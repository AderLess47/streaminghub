import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { reconcileCheckoutSession } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";
import { checkoutConfirmSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Confirms a finished Checkout session on the server. The browser only sends
 * the session id; ownership and payment state are verified with Stripe before
 * the local subscription record is advanced.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("confirm:user", user.id), 10, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, checkoutConfirmSchema);
  if (!parsed.ok) return parsed.response;

  const result = await reconcileCheckoutSession(parsed.data.sessionId, user.id);
  logAudit({
    action: "subscription.checkout_confirmed",
    actorId: user.id,
    actorEmail: user.email,
    ip,
    targetType: "checkout_session",
    targetId: parsed.data.sessionId,
    meta: { ok: result.ok, code: result.ok ? result.status : result.code },
  });

  if (!result.ok) {
    const code =
      result.code === "not_configured"
        ? "not_configured"
        : result.code === "not_found"
          ? "not_found"
          : result.code === "forbidden"
            ? "forbidden"
            : result.code === "not_complete"
              ? "conflict"
              : "server_error";
    return apiError(code, result.message);
  }

  return json({ ok: true, status: result.status });
}
