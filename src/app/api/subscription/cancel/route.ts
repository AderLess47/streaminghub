import { apiError, clientIp, isSameOrigin, json, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { cancelSubscription } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("cancel:user", user.id), 5, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const result = await cancelSubscription(user.id);
  logAudit({
    action: "subscription.cancel_attempt",
    actorId: user.id,
    actorEmail: user.email,
    ip,
    meta: { ok: result.ok },
  });

  if (!result.ok) return apiError("conflict", result.message);
  return json({ ok: true, message: result.message });
}
