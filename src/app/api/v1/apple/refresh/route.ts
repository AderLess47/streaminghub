import { apiError, json, tooManyRequests } from "@/lib/api";
import { appleSubscriptionView, refreshStoredAppleReceipt } from "@/lib/apple-subscriptions";
import { authenticateDevice } from "@/lib/device-auth";
import { isAppleIapConfigured } from "@/lib/env";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Pull model for the App Store subscription.
 *
 * A renewal arrives as a new signed transaction, which the app posts to
 * `/api/v1/apple/purchase` (StoreKit 2 delivers it via `Transaction.updates`).
 * This endpoint re-evaluates the stored period, so an elapsed subscription
 * without a reported renewal ends here instead of staying active forever.
 *
 * It does not ask Apple for the current status: that needs the App Store Server
 * API with its own key (see docs/IAP-APPLE.md), and guessing would be worse than
 * reporting the stored state.
 */
export async function POST(request: Request) {
  if (!isAppleIapConfigured()) {
    return apiError("not_configured", "Der App Store ist für diese Installation nicht konfiguriert.");
  }

  const auth = authenticateDevice(request);
  if (!auth.ok) return apiError(auth.code, auth.message);

  const limit = rateLimit(rateLimitKey("apple:refresh", auth.userId), 30, 600);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  refreshStoredAppleReceipt(auth.userId);
  return json({ ok: true, subscription: appleSubscriptionView(auth.userId) });
}
