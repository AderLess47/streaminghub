import { randomToken, hashPassword, issueAuthToken } from "@/lib/auth";
import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { nowIso, run } from "@/lib/db";
import { env, isEmailConfigured } from "@/lib/env";
import { sendMail, verificationMail } from "@/lib/mail";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { applySessionCookie, createSession, get } from "@/lib/session-helpers";
import { registerSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("register:ip", ip), 5, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, registerSchema);
  if (!parsed.ok) return parsed.response;
  const data = parsed.data;
  const email = data.email.toLowerCase();

  const existing = get<{ id: string }>(`SELECT id FROM users WHERE email = ?`, email);
  if (existing) {
    return apiError("conflict", "Für diese E-Mail-Adresse besteht bereits ein Konto.");
  }

  const userId = randomToken(12);
  const now = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified, marketing_opt_in, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'customer', 0, ?, ?, ?)`,
    userId,
    email,
    hashPassword(data.password),
    data.displayName,
    data.locale,
    data.marketingOptIn ? 1 : 0,
    now,
    now,
  );
  run(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, updated_at, created_at)
     VALUES (?, ?, 'premium', 'none', 'web', 'none', ?, ?)`,
    randomToken(12),
    userId,
    now,
    now,
  );
  run(
    `INSERT INTO legal_acceptances (id, user_id, document, version, accepted_at)
     VALUES (?, ?, 'terms_and_privacy', '2026-11-01', ?)`,
    randomToken(12),
    userId,
    now,
  );

  const { raw } = issueAuthToken(userId, "verify_email", 48 * 3600);
  const verifyUrl = `${env.appUrl}/api/auth/verify?token=${encodeURIComponent(raw)}`;
  const mail = verificationMail(verifyUrl, data.locale);
  const delivery = await sendMail({
    to: email,
    subject: mail.subject,
    text: mail.text,
    kind: "verify_email",
  });

  const session = await createSession(userId, {
    ip,
    userAgent: request.headers.get("user-agent"),
    mfaOk: true,
  });
  await applySessionCookie(session);

  logAudit({ action: "auth.register", actorId: userId, actorEmail: email, ip });

  return json({
    ok: true,
    userId,
    emailVerificationRequired: true,
    devLink: env.email.showDevHints && !isEmailConfigured() ? verifyUrl : undefined,
    delivered: delivery.delivered,
    redirectTo: "/dashboard",
  });
}
