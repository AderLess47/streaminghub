/**
 * Conversion-Angebote für den Checkout.
 *
 * Wer den Testzeitraum genutzt hat und danach abschließt, bekommt einen
 * hinterlegten Stripe-Coupon – als Anreiz genau im richtigen Moment. Der
 * Coupon wird serverseitig gesetzt (`discounts[0][coupon]`), nicht über den
 * frei eintippbaren Promo-Code im Checkout.
 *
 * Alles startet aus: ohne Flag oder ohne konfigurierten Coupon ändert sich am
 * Checkout nichts. Nur serverseitig verwenden.
 */
import { env } from "./env";
import { isFeatureEnabled } from "./flags";
import { effectiveStatus, getSubscription } from "./payments";

/**
 * Coupon für die Umwandlung nach einem Trial, oder `null`, wenn keiner gilt.
 *
 * Absichtlich eng: nur Konten mit Trial-Historie, ohne laufendes oder früheres
 * Stripe-Abo. Wer schon zahlt oder schon einmal gezahlt hat, bekommt keinen
 * Rabatt auf einen Neuanfang.
 */
export function trialConversionCoupon(userId: string): string | null {
  if (!isFeatureEnabled("conversionCoupon")) return null;
  const couponId = env.billing.stripeConversionCouponId;
  if (!couponId) return null;

  const subscription = getSubscription(userId);
  if (!subscription?.trial_used_at) return null;
  if (subscription.provider_subscription_id) return null;

  const status = effectiveStatus(subscription);
  if (status === "active" || status === "past_due") return null;

  return couponId;
}
