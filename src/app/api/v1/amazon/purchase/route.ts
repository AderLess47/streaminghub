import { apiError, clientIp, json, parseBody, tooManyRequests } from "@/lib/api";
import {
  AMAZON_ERROR_MESSAGES,
  decideReceiptApplication,
  isReplayable,
  receiptState,
  verifyReceipt,
} from "@/lib/amazon-iap";
import {
  applyCanceledReceipt,
  applyVerifiedReceipt,
  getReceipt,
  subscriptionView,
} from "@/lib/amazon-subscriptions";
import { logAudit } from "@/lib/audit";
import { authenticateDevice } from "@/lib/device-auth";
import { env, isAmazonIapConfigured } from "@/lib/env";
import { effectiveStatus, getSubscription } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { amazonPurchaseSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Called by the Amazon build after a successful IAP purchase. The receipt is
 * verified with Amazon's RVS before anything is granted – the app never unlocks
 * premium on its own.
 */
export async function POST(request: Request) {
  if (!isAmazonIapConfigured()) {
    return apiError("not_configured", "Amazon In-App Purchasing ist nicht konfiguriert.");
  }

  const auth = authenticateDevice(request);
  if (!auth.ok) return apiError(auth.code, auth.message);

  const limit = rateLimit(rateLimitKey("amazon:purchase", auth.userId), 10, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const parsed = await parseBody(request, amazonPurchaseSchema);
  if (!parsed.ok) return parsed.response;

  const { receiptId, appUserId, productId } = parsed.data;
  if (productId !== env.billing.amazonIapSku) {
    return apiError("invalid_request", AMAZON_ERROR_MESSAGES.invalid_product);
  }

  const known = getReceipt(receiptId);
  if (known && known.user_id !== auth.userId) {
    return apiError("conflict", "Dieser Kaufbeleg ist bereits mit einem anderen Konto verknüpft.");
  }
  if (known && isReplayable(known.verified_at)) {
    return json({ ok: true, subscription: subscriptionView(auth.userId) });
  }

  const result = await verifyReceipt({
    baseUrl: env.billing.amazonRvsBase,
    sandbox: env.billing.amazonRvsSandbox,
    sharedSecret: env.billing.amazonRvsSharedSecret,
    appUserId,
    receiptId,
    expectedProductId: productId,
  });

  if (!result.ok) {
    if (result.code === "canceled") {
      applyCanceledReceipt({ userId: auth.userId, receiptId });
      return json({ ok: true, subscription: subscriptionView(auth.userId) });
    }
    if (result.code === "misconfigured") {
      // RVS 496/497: wrong shared secret or app user id. Log the code only, the
      // request URL contains the secret.
      console.error("amazon rvs rejected the credentials", result.code);
      return apiError("server_error", AMAZON_ERROR_MESSAGES.misconfigured);
    }
    if (result.code === "provider_busy" || result.code === "provider_error") {
      return json(
        { error: { code: result.code, message: AMAZON_ERROR_MESSAGES[result.code] } },
        { status: 503, headers: { "retry-after": String(result.retryAfterSeconds ?? 30) } },
      );
    }
    return apiError("invalid_request", AMAZON_ERROR_MESSAGES[result.code]);
  }

  const subscription = getSubscription(auth.userId);
  const decision = decideReceiptApplication(
    subscription
      ? {
          channel: subscription.channel,
          status: effectiveStatus(subscription),
          providerCustomerId: subscription.provider_customer_id,
        }
      : null,
    appUserId,
  );
  if (!decision.ok) {
    return apiError(
      "conflict",
      decision.code === "already_active_web"
        ? "Für dieses Konto ist bereits ein Web-Abo aktiv. Bitte beende es zuerst oder wende dich an den Support."
        : "Dieser Kaufbeleg gehört bereits zu einem anderen Amazon-Konto.",
      { reason: decision.code },
    );
  }

  const state = receiptState(result.receipt);
  applyVerifiedReceipt({
    userId: auth.userId,
    appUserId,
    receipt: result.receipt,
    state,
    rawResponse: null,
  });

  logAudit({
    action: "subscription.amazon_receipt",
    actorId: auth.userId,
    ip: clientIp(request),
    targetType: "subscription",
    targetId: auth.userId,
    meta: {
      productId: result.receipt.productId,
      status: state.status,
      sandbox: env.billing.amazonRvsSandbox,
    },
  });

  return json({ ok: true, subscription: subscriptionView(auth.userId) });
}
