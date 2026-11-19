/**
 * Kündigungs-Rettung: ein Rabattangebot, bevor jemand sein Abo beendet.
 *
 * Die Kündigung selbst bleibt unangetastet – `cancelSubscription()` und der
 * bestehende Server-Action funktionieren unverändert, das Angebot ist ein
 * zusätzlicher Schritt davor. Wer ablehnt, kündigt wie gewohnt.
 *
 * Ein Angebot gilt nur einmal pro Konto: `retention_outcome` hält fest, ob es
 * angenommen oder abgelehnt wurde; danach wird es nicht erneut gezeigt.
 * Annehmen heißt serverseitig einen Stripe-Coupon auf das laufende Abo legen –
 * schlägt das fehl, bleibt der Zustand unverändert und der Versuch ist
 * wiederholbar.
 *
 * Nur serverseitig verwenden.
 */
import { nowIso, run } from "./db";
import { env } from "./env";
import { isFeatureEnabled } from "./flags";
import {
  applySubscriptionCoupon,
  effectiveStatus,
  getSubscription,
  type Subscription,
} from "./payments";

export type RetentionUnavailable =
  | "disabled"
  | "not_configured"
  | "not_active"
  | "store_channel"
  | "already_scheduled"
  | "already_decided";

export type RetentionOffer =
  | { available: true; couponId: string }
  | { available: false; reason: RetentionUnavailable };

export type RetentionDecision =
  | { ok: true; outcome: "accepted" | "declined" }
  | { ok: false; reason: RetentionUnavailable | "provider_error"; message: string };

export type RetentionOptions = {
  /** Coupon-ID überschreiben (Tests); Standard ist der konfigurierte Wert. */
  couponId?: string;
  /** Für Tests und reproduzierbare Läufe. */
  now?: number;
};

/** Setzt einen Coupon auf ein laufendes Abo. Austauschbar für Tests. */
export type ApplyCoupon = (userId: string, couponId: string) => Promise<{ ok: boolean; message?: string }>;

/**
 * Prüft, ob ein Rettungsangebot angeboten werden darf.
 *
 * Bewusst zurückhaltend: nur laufende Web-Abos ohne bereits vorgemerkte
 * Kündigung. Store-Abos werden im Store verwaltet, ein Coupon aus dem Web
 * hätte dort keine Wirkung.
 */
export function retentionOffer(userId: string, options: RetentionOptions = {}): RetentionOffer {
  if (!isFeatureEnabled("retention")) return { available: false, reason: "disabled" };

  const couponId = options.couponId ?? env.billing.stripeWinbackCouponId;
  if (!couponId) return { available: false, reason: "not_configured" };

  const subscription = getSubscription(userId);
  const reason = blockingReason(subscription);
  if (reason) return { available: false, reason };

  return { available: true, couponId };
}

function blockingReason(subscription: Subscription | null): RetentionUnavailable | null {
  if (!subscription || effectiveStatus(subscription) !== "active") return "not_active";
  if (subscription.channel !== "web") return "store_channel";
  if (subscription.cancel_at_period_end) return "already_scheduled";
  if (subscription.retention_outcome) return "already_decided";
  return null;
}

/**
 * Nimmt das Angebot an: Coupon auf das laufende Abo legen und festhalten.
 *
 * Erst nach erfolgreicher Antwort beim Zahlungsanbieter werden die Marker
 * geschrieben, damit ein fehlgeschlagener Versuch nicht als angenommen gilt.
 */
export async function acceptRetentionOffer(
  userId: string,
  options: RetentionOptions & { apply?: ApplyCoupon } = {},
): Promise<RetentionDecision> {
  const offer = retentionOffer(userId, options);
  if (!offer.available) {
    return { ok: false, reason: offer.reason, message: messageFor(offer.reason) };
  }

  const apply = options.apply ?? defaultApply;
  let result: { ok: boolean; message?: string };
  try {
    result = await apply(userId, offer.couponId);
  } catch {
    result = { ok: false };
  }

  if (!result.ok) {
    return {
      ok: false,
      reason: "provider_error",
      message:
        result.message ??
        "Der Rabatt konnte nicht hinterlegt werden. Bitte versuche es später erneut.",
    };
  }

  run(
    `UPDATE subscriptions
     SET retention_outcome = 'accepted', retention_decided_at = ?, coupon_id = ?, updated_at = ?
     WHERE user_id = ?`,
    iso(options.now),
    offer.couponId,
    iso(options.now),
    userId,
  );

  return { ok: true, outcome: "accepted" };
}

/**
 * Lehnt das Angebot ab – nur für die Auswertung, die Kündigung läuft separat.
 *
 * Absichtlich auch dann möglich, wenn die Kündigung schon vorgemerkt ist:
 * Die Kündigungs-Action ruft das direkt nach einer erfolgreichen Kündigung auf.
 * Ein zweiter Aufruf ändert nichts (idempotent).
 */
export function declineRetentionOffer(
  userId: string,
  options: RetentionOptions = {},
): RetentionDecision {
  if (!isFeatureEnabled("retention")) {
    return { ok: false, reason: "disabled", message: messageFor("disabled") };
  }

  const subscription = getSubscription(userId);
  if (!subscription) {
    return { ok: false, reason: "not_active", message: messageFor("not_active") };
  }
  if (subscription.retention_outcome) {
    return { ok: false, reason: "already_decided", message: messageFor("already_decided") };
  }

  run(
    `UPDATE subscriptions
     SET retention_outcome = 'declined', retention_decided_at = ?, updated_at = ?
     WHERE user_id = ? AND (retention_outcome IS NULL OR retention_outcome = '')`,
    iso(options.now),
    iso(options.now),
    userId,
  );

  return { ok: true, outcome: "declined" };
}

function defaultApply(userId: string, couponId: string) {
  return applySubscriptionCoupon(userId, couponId);
}

function iso(now?: number) {
  return new Date(now ?? Date.now()).toISOString();
}

function messageFor(reason: RetentionUnavailable): string {
  switch (reason) {
    case "disabled":
      return "Für dieses Konto gibt es derzeit kein Angebot.";
    case "not_configured":
      return "Es ist kein Angebot hinterlegt.";
    case "not_active":
      return "Es ist kein aktives Abonnement vorhanden.";
    case "store_channel":
      return "Dieses Abonnement wird über den Store verwaltet – ein Rabatt aus dem Web wirkt dort nicht.";
    case "already_scheduled":
      return "Für dieses Abonnement ist die Kündigung bereits vorgemerkt.";
    case "already_decided":
      return "Für dieses Abonnement wurde bereits über das Angebot entschieden.";
  }
}
