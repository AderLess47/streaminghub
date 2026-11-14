import { apiError, json, tooManyRequests } from "@/lib/api";
import { AMAZON_ERROR_MESSAGES, receiptState, verifyReceipt } from "@/lib/amazon-iap";
import {
  applyCanceledReceipt,
  applyVerifiedReceipt,
  getLatestReceipt,
  subscriptionView,
} from "@/lib/amazon-subscriptions";
import { authenticateDevice } from "@/lib/device-auth";
import { env, isAmazonIapConfigured } from "@/lib/env";
import { notifyStoreSubscriptionEnded } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Pull model for renewals and cancellations: re-verifies the newest receipt of
 * the account with RVS. The app calls this when the settings screen opens.
 */
export async function POST(request: Request) {
  if (!isAmazonIapConfigured()) {
    return apiError("not_configured", "Amazon In-App Purchasing ist nicht konfiguriert.");
  }

  const auth = authenticateDevice(request);
  if (!auth.ok) return apiError(auth.code, auth.message);

  const limit = rateLimit(rateLimitKey("amazon:refresh", auth.userId), 30, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  const row = getLatestReceipt(auth.userId);
  if (!row) return json({ ok: true, subscription: subscriptionView(auth.userId) });

  const result = await verifyReceipt({
    baseUrl: env.billing.amazonRvsBase,
    sandbox: env.billing.amazonRvsSandbox,
    sharedSecret: env.billing.amazonRvsSharedSecret,
    appUserId: row.app_user_id,
    receiptId: row.receipt_id,
    expectedProductId: row.product_id,
  });

  if (!result.ok) {
    if (result.code === "canceled") {
      applyCanceledReceipt({ userId: auth.userId, receiptId: row.receipt_id });
      await notifyStoreSubscriptionEnded({
        userId: auth.userId,
        store: "amazon",
        subscriptionKey: `amazon:${row.receipt_id}`,
      });
      return json({ ok: true, subscription: subscriptionView(auth.userId) });
    }
    if (result.code === "misconfigured") {
      console.error("amazon rvs rejected the credentials", result.code);
      return apiError("server_error", AMAZON_ERROR_MESSAGES.misconfigured);
    }
    if (result.code === "provider_busy" || result.code === "provider_error") {
      return json(
        { error: { code: result.code, message: AMAZON_ERROR_MESSAGES[result.code] } },
        { status: 503, headers: { "retry-after": String(result.retryAfterSeconds ?? 30) } },
      );
    }
    // The stored receipt is unknown, not a subscription, or a test purchase:
    // keep the recorded state instead of guessing.
    return json({ ok: true, subscription: subscriptionView(auth.userId) });
  }

  const state = receiptState(result.receipt);
  applyVerifiedReceipt({
    userId: auth.userId,
    appUserId: row.app_user_id,
    receipt: result.receipt,
    state,
    rawResponse: null,
  });
  if (state.status === "canceled") {
    await notifyStoreSubscriptionEnded({
      userId: auth.userId,
      store: "amazon",
      subscriptionKey: `amazon:${row.receipt_id}`,
    });
  }

  return json({ ok: true, subscription: subscriptionView(auth.userId) });
}
