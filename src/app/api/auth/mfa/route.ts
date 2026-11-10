import { z } from "zod";
import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { get, run } from "@/lib/db";
import { getSessionUser, markSessionMfaVerified } from "@/lib/session";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";

const schema = z.object({ code: z.string().trim().min(6).max(20) });

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich erneut an.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("mfa:user", user.id), 8, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const secret = get<{ secret: string; confirmed_at: string | null; recovery_codes: string }>(
    `SELECT secret, confirmed_at, recovery_codes FROM mfa_secrets WHERE user_id = ?`,
    user.id,
  );
  if (!secret?.confirmed_at) return apiError("invalid_request", "Für dieses Konto ist keine MFA eingerichtet.");

  const token = parsed.data.code.trim();
  let valid = verifyTotp(secret.secret, token);

  if (!valid) {
    const codes = JSON.parse(secret.recovery_codes) as string[];
    const normalized = token.toUpperCase();
    if (codes.includes(normalized)) {
      run(
        `UPDATE mfa_secrets SET recovery_codes = ? WHERE user_id = ?`,
        JSON.stringify(codes.filter((code) => code !== normalized)),
        user.id,
      );
      valid = true;
    }
  }

  if (!valid) {
    logAudit({ action: "auth.mfa_failed", actorId: user.id, actorEmail: user.email, ip });
    return apiError("invalid_request", "Der Code ist ungültig.");
  }

  await markSessionMfaVerified();
  logAudit({ action: "auth.mfa_success", actorId: user.id, actorEmail: user.email, ip });

  return json({ ok: true, redirectTo: user.role === "admin" || user.role === "support" ? "/admin" : "/dashboard" });
}
