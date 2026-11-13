import { apiError, clientIp, json, parseBody, tooManyRequests } from "@/lib/api";
import { notificationEffect, verifyAppleNotification } from "@/lib/apple-iap";
import { APPLE_ROOT_CA_G3 } from "@/lib/apple-root-ca";
import { applyAppleNotification } from "@/lib/apple-subscriptions";
import { logAudit } from "@/lib/audit";
import { env, isAppleIapConfigured } from "@/lib/env";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { appleNotificationSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * App Store Server Notifications V2.
 *
 * Apple kann sich nicht ausweisen wie eine App – der Beleg ist das signierte
 * `signedPayload`. Es wird deshalb genauso streng geprüft wie ein Kauf: Kette
 * bis Apple Root CA G3, Bundle, Produkt, Abo-Typ, Umgebung. Nur der Zeitraum
 * darf hier abgelaufen oder erstattet sein, denn genau das melden diese Events.
 *
 * Antworten: `200`, sobald die Meldung geprüft und verarbeitet oder bewusst
 * übersprungen wurde (unbekannte Transaktion, fremder Kanal, Duplikat). Apple
 * stellt sonst über Tage erneut zu, ohne dass sich etwas ändern könnte. `400`
 * nur für Belege, die nicht durch die Prüfung kommen – die sollen auffallen.
 */
export async function POST(request: Request) {
  if (!isAppleIapConfigured()) {
    return apiError("not_configured", "Der App Store ist für diese Installation nicht konfiguriert.");
  }

  const ip = clientIp(request);
  // Apple liefert in Schüben; das Limit ist ein Notausgang, keine Drosselung.
  const limit = rateLimit(rateLimitKey("apple:notifications", ip), 300, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, appleNotificationSchema);
  if (!parsed.ok) return parsed.response;

  const verification = verifyAppleNotification({
    signedPayload: parsed.data.signedPayload,
    bundleId: env.billing.appleIapBundleId,
    productId: env.billing.appleIapProductId,
    trustedRoots: [APPLE_ROOT_CA_G3],
    allowSandbox: env.billing.appleIapAllowSandbox,
  });

  if (!verification.ok) {
    logAudit({
      action: "subscription.apple_notification_rejected",
      ip,
      targetType: "subscription",
      targetId: "apple",
      meta: { reason: verification.code },
    });
    return apiError("invalid_request", verification.message, { reason: verification.code });
  }

  const notification = verification.notification;
  const effect = notificationEffect(notification);

  if (effect.kind === "ignore") {
    return json({
      ok: true,
      handled: false,
      reason: effect.reason,
      notificationType: notification.notificationType,
    });
  }

  const outcome = applyAppleNotification(notification);

  logAudit({
    action: outcome.handled
      ? "subscription.apple_notification"
      : "subscription.apple_notification_skipped",
    actorId: outcome.handled ? outcome.userId : undefined,
    ip,
    targetType: "subscription",
    targetId: outcome.handled ? outcome.userId : "apple",
    meta: {
      notificationType: notification.notificationType,
      notificationUUID: notification.notificationUUID,
      reason: outcome.handled ? null : outcome.reason,
      status: outcome.handled ? outcome.status : null,
    },
  });

  return json({ ok: true, ...outcome });
}
