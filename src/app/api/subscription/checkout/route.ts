import { apiError, clientIp, isSameOrigin, json, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { trialConversionCoupon } from "@/lib/conversion";
import { env } from "@/lib/env";
import { isFeatureEnabled } from "@/lib/flags";
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

  // Rabatt für die Umwandlung nach dem Trial – serverseitig bestimmt, damit
  // die Preisänderung nicht von der Oberfläche abhängt.
  const couponId = trialConversionCoupon(user.id);

  // Jahresabo nur mit hinterlegtem Preis und gesetztem Flag; sonst bleibt es
  // beim Monatsabschluss, und die Oberflaeche bietet ihn gar nicht erst an.
  const payload = (await request.json().catch(() => null)) as { interval?: unknown } | null;
  const interval: "month" | "year" = payload?.interval === "year" ? "year" : "month";
  if (interval === "year" && !(isFeatureEnabled("annualBilling") && env.billing.stripeAnnualPriceId)) {
    return apiError("not_configured", "Der Jahresabschluss ist derzeit nicht verfügbar.");
  }

  const outcome = await createWebCheckout({
    userId: user.id,
    email: user.email,
    locale: user.locale,
    couponId,
    interval,
  });

  logAudit({
    action: "subscription.checkout_attempt",
    actorId: user.id,
    actorEmail: user.email,
    ip,
    meta: {
      ok: outcome.ok,
      code: outcome.ok ? null : outcome.code,
      coupon: couponId ? "conversion" : null,
      interval,
    },
  });

  if (!outcome.ok) {
    return apiError(outcome.code === "not_configured" ? "not_configured" : "conflict", outcome.message);
  }

  return json({ ok: true, url: outcome.url, sessionId: outcome.sessionId });
}
