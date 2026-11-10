import { verifyPassword } from "@/lib/auth";
import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { get, nowIso, run } from "@/lib/db";
import { verifyTotp } from "@/lib/totp";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { applySessionCookie, createSession } from "@/lib/session-helpers";
import { loginSchema } from "@/lib/validation";

export const runtime = "nodejs";

type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  email_verified: number;
  disabled_at: string | null;
  mfa_secret: string | null;
  mfa_confirmed: string | null;
};

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const ip = clientIp(request);
  const ipLimit = rateLimit(rateLimitKey("login:ip", ip), 20, 900);
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);

  const parsed = await parseBody(request, loginSchema);
  if (!parsed.ok) return parsed.response;
  const email = parsed.data.email.toLowerCase();

  const emailLimit = rateLimit(rateLimitKey("login:email", email), 8, 900);
  if (!emailLimit.allowed) return tooManyRequests(emailLimit.retryAfterSeconds);

  const user = get<UserRow>(
    `SELECT u.id, u.email, u.password_hash, u.role, u.email_verified, u.disabled_at,
            m.secret AS mfa_secret, m.confirmed_at AS mfa_confirmed
     FROM users u LEFT JOIN mfa_secrets m ON m.user_id = u.id
     WHERE u.email = ?`,
    email,
  );

  if (!user || !verifyPassword(parsed.data.password, user.password_hash)) {
    logAudit({ action: "auth.login_failed", actorEmail: email, ip });
    return apiError("invalid_request", "E-Mail-Adresse oder Passwort ist falsch.");
  }
  if (user.disabled_at) {
    return apiError("forbidden", "Dieses Konto ist deaktiviert. Bitte kontaktiere den Support.");
  }

  const staffRole = user.role === "admin" || user.role === "support";
  const mfaRequired = Boolean(user.mfa_confirmed && user.mfa_secret) && staffRole;

  if (mfaRequired) {
    if (!parsed.data.mfaCode) {
      const pendingSession = await createSession(user.id, {
        ip,
        userAgent: request.headers.get("user-agent"),
        mfaOk: false,
      });
      await applySessionCookie(pendingSession);
      return json({ ok: true, mfaRequired: true });
    }
    const token = parsed.data.mfaCode.trim();
    const validTotp = user.mfa_secret ? verifyTotp(user.mfa_secret, token) : false;
    const recovery = user.id ? checkRecoveryCode(user.id, token) : false;
    if (!validTotp && !recovery) {
      logAudit({ action: "auth.mfa_failed", actorId: user.id, actorEmail: email, ip });
      return apiError("invalid_request", "Der Code ist ungültig.");
    }
  }

  const session = await createSession(user.id, {
    ip,
    userAgent: request.headers.get("user-agent"),
    mfaOk: true,
  });
  await applySessionCookie(session);
  run(`UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?`, nowIso(), nowIso(), user.id);

  logAudit({ action: "auth.login", actorId: user.id, actorEmail: user.email, ip });

  return json({
    ok: true,
    redirectTo: staffRole ? "/admin" : "/dashboard",
    emailVerified: Boolean(user.email_verified),
  });
}

function checkRecoveryCode(userId: string, token: string) {
  const row = get<{ recovery_codes: string }>(`SELECT recovery_codes FROM mfa_secrets WHERE user_id = ?`, userId);
  if (!row) return false;
  const codes = JSON.parse(row.recovery_codes) as string[];
  const normalized = token.trim().toUpperCase();
  if (!codes.includes(normalized)) return false;
  const remaining = codes.filter((code) => code !== normalized);
  run(`UPDATE mfa_secrets SET recovery_codes = ? WHERE user_id = ?`, JSON.stringify(remaining), userId);
  return true;
}
