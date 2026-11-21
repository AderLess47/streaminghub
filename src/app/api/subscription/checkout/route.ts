import { z } from "zod";
import { legalUpdatedLabel } from "@/content/legal";
import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { trialConversionCoupon } from "@/lib/conversion";
import { nowIso } from "@/lib/db";
import { env } from "@/lib/env";
import { isFeatureEnabled } from "@/lib/flags";
import { createWebCheckout } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { getSessionUser } from "@/lib/session";

export const runtime = "nodejs";

const schema = z.object({
  interval: z.enum(["month", "year"]).optional(),
  acceptTerms: z.boolean().optional(),
  acceptWithdrawalLoss: z.boolean().optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  const user = await getSessionUser();
  if (!user) return apiError("unauthorized", "Bitte melde dich an.");

  const ip = clientIp(request);
  const limit = rateLimit(rateLimitKey("checkout:user", user.id), 5, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;

  // Ohne beide Zustimmungen entsteht keine Zahlungspflicht: AGB/Widerrufs-
  // informationen (§ 312j Abs. 3 BGB) und der ausdrückliche Wunsch sofortiger
  // Leistung mit Verlust des Widerrufsrechts (§ 356 Abs. 5 BGB).
  if (parsed.data.acceptTerms !== true || parsed.data.acceptWithdrawalLoss !== true) {
    return apiError(
      "consent_required",
      "Bitte stimmen Sie den Vertragsbedingungen zu und bestätigen Sie den Verzicht auf das Widerrufsrecht.",
    );
  }

  // Rabatt für die Umwandlung nach dem Trial – serverseitig bestimmt, damit
  // die Preisänderung nicht von der Oberfläche abhängt.
  const couponId = trialConversionCoupon(user.id);

  // Jahresabo nur mit hinterlegtem Preis und gesetztem Flag; sonst bleibt es
  // beim Monatsabschluss, und die Oberflaeche bietet ihn gar nicht erst an.
  const interval: "month" | "year" = parsed.data.interval === "year" ? "year" : "month";
  if (interval === "year" && !(isFeatureEnabled("annualBilling") && env.billing.stripeAnnualPriceId)) {
    return apiError("not_configured", "Der Jahresabschluss ist derzeit nicht verfügbar.");
  }

  const consentAcceptedAt = nowIso();
  const consent = {
    terms: true,
    withdrawalLoss: true,
    version: legalUpdatedLabel,
    acceptedAt: consentAcceptedAt,
  } as const;

  const outcome = await createWebCheckout({
    userId: user.id,
    email: user.email,
    locale: user.locale,
    couponId,
    interval,
    consentAcceptedAt,
    consentVersion: legalUpdatedLabel,
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
      consent,
    },
  });

  if (!outcome.ok) {
    return apiError(outcome.code === "not_configured" ? "not_configured" : "conflict", outcome.message);
  }

  return json({ ok: true, url: outcome.url, sessionId: outcome.sessionId });
}
