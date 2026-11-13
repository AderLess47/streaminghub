import { apiError, clientIp, json, parseBody, tooManyRequests } from "@/lib/api";
import {
  decideAppleApplication,
  isReplayable,
  transactionState,
  verifyAppleTransaction,
} from "@/lib/apple-iap";
import { APPLE_ROOT_CA_G3 } from "@/lib/apple-root-ca";
import {
  appleSubscriptionView,
  applyVerifiedTransaction,
  getAppleReceipt,
} from "@/lib/apple-subscriptions";
import { logAudit } from "@/lib/audit";
import { authenticateDevice } from "@/lib/device-auth";
import { env, isAppleIapConfigured } from "@/lib/env";
import { effectiveStatus, getSubscription } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { applePurchaseSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Called by the Apple app after a StoreKit purchase. The signed transaction is
 * verified against Apple's root certificate before anything is granted – the app
 * never unlocks premium on its own.
 */
export async function POST(request: Request) {
  if (!isAppleIapConfigured()) {
    return apiError("not_configured", "Der App Store ist für diese Installation nicht konfiguriert.");
  }

  const auth = authenticateDevice(request);
  if (!auth.ok) return apiError(auth.code, auth.message);

  const limit = rateLimit(rateLimitKey("apple:purchase", auth.userId), 10, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, applePurchaseSchema);
  if (!parsed.ok) return parsed.response;

  const verification = verifyAppleTransaction({
    jws: parsed.data.jws,
    bundleId: env.billing.appleIapBundleId,
    productId: env.billing.appleIapProductId,
    trustedRoots: [APPLE_ROOT_CA_G3],
    allowSandbox: env.billing.appleIapAllowSandbox,
  });

  if (!verification.ok) {
    logAudit({
      action: "subscription.apple_receipt_rejected",
      actorId: auth.userId,
      ip: clientIp(request),
      targetType: "subscription",
      targetId: auth.userId,
      meta: { reason: verification.code },
    });
    return apiError(
      verification.code === "sandbox_not_allowed" ? "forbidden" : "invalid_request",
      verification.message,
      { reason: verification.code },
    );
  }

  const transaction = verification.transaction;
  const known = getAppleReceipt(transaction.originalTransactionId);
  if (known && known.user_id !== auth.userId) {
    return apiError("conflict", "Dieser Kaufbeleg ist bereits mit einem anderen Konto verknüpft.");
  }
  if (known && isReplayable(known.verified_at)) {
    return json({ ok: true, subscription: appleSubscriptionView(auth.userId) });
  }

  const subscription = getSubscription(auth.userId);
  const decision = decideAppleApplication(
    subscription
      ? {
          channel: subscription.channel,
          status: effectiveStatus(subscription),
          providerCustomerId: subscription.provider_customer_id,
        }
      : null,
    transaction.originalTransactionId,
  );
  if (!decision.ok) {
    return apiError(
      "conflict",
      decision.code === "already_active_other_channel"
        ? "Für dieses Konto ist bereits ein Abo über einen anderen Kanal aktiv. Bitte beende es zuerst oder wende dich an den Support."
        : "Dieses Abo gehört bereits zu einem anderen Konto.",
      { reason: decision.code },
    );
  }

  const state = transactionState(transaction);
  applyVerifiedTransaction({ userId: auth.userId, transaction, state });

  logAudit({
    action: "subscription.apple_receipt",
    actorId: auth.userId,
    ip: clientIp(request),
    targetType: "subscription",
    targetId: auth.userId,
    meta: {
      productId: transaction.productId,
      status: state.status,
      environment: transaction.environment,
    },
  });

  return json({ ok: true, subscription: appleSubscriptionView(auth.userId) });
}
