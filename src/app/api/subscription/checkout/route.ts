import { apiError, clientIp, isSameOrigin, json, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { createWebCheckout } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("checkout:user", user.id), 5, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const outcome = await createWebCheckout({
    userId: user.id,
    email: user.email,
    locale: user.locale,
  });

  logAudit({
    action: "subscription.checkout_attempt",
    actorId: user.id,
    actorEmail: user.email,
    ip,
    meta: { ok: outcome.ok, code: outcome.ok ? null : outcome.code },
  });

  if (!outcome.ok) {
    return apiError(outcome.code === "not_configured" ? "not_configured" : "conflict", outcome.message);
  }

  return json({ ok: true, url: outcome.url, sessionId: outcome.sessionId });
}
