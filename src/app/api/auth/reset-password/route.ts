import { consumeAuthToken, hashPassword } from "@/lib/auth";
import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { nowIso, run } from "@/lib/db";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { resetPasswordSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("reset:ip", ip), 10, 3600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, resetPasswordSchema);
  if (!parsed.ok) return parsed.response;

  const row = consumeAuthToken(parsed.data.token, "reset_password");
  if (!row) {
    return apiError("invalid_request", "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an.");
  }

  run(
    `UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?`,
    hashPassword(parsed.data.password),
    nowIso(),
    row.user_id,
  );
  // Force re-authentication everywhere.
  run(`DELETE FROM sessions WHERE user_id = ?`, row.user_id);
  run(`DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'reset_password' AND used_at IS NULL`, row.user_id);

  logAudit({ action: "auth.password_reset", actorId: row.user_id, ip });

  return json({ ok: true });
}
