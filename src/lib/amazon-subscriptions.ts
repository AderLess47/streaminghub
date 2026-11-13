/**
 * Persistence for verified Amazon receipts: the `iap_receipts` audit rows and
 * the single `subscriptions` row that `/api/v1/me` and the dashboard read.
 */
import { randomUUID } from "node:crypto";
import { bit, get, nowIso, run, transaction } from "./db";
import {
  effectiveStatus,
  ensureSubscription,
  getSubscription,
  type SubscriptionStatus,
} from "./payments";
import type { AmazonReceipt, SubscriptionState } from "./amazon-iap";

export type ReceiptRow = {
  id: string;
  user_id: string;
  provider: string;
  receipt_id: string;
  app_user_id: string;
  product_id: string;
  term_sku: string | null;
  product_type: string;
  status: string;
  auto_renewing: number;
  purchase_date: string | null;
  renewal_date: string | null;
  cancel_date: string | null;
  grace_period_end: string | null;
  test_transaction: number;
  raw_response: string | null;
  verified_at: string;
  created_at: string;
};

export type SubscriptionView = {
  plan: "premium";
  status: SubscriptionStatus;
  channel: "web" | "amazon" | "apple";
  currentPeriodEnd: string | null;
  premiumActive: boolean;
};

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

export function getReceipt(receiptId: string): ReceiptRow | null {
  return (
    get<ReceiptRow>(
      `SELECT * FROM iap_receipts WHERE provider = 'amazon' AND receipt_id = ?`,
      receiptId,
    ) ?? null
  );
}

export function getLatestReceipt(userId: string): ReceiptRow | null {
  return (
    get<ReceiptRow>(
      `SELECT * FROM iap_receipts
       WHERE provider = 'amazon' AND user_id = ?
       ORDER BY verified_at DESC LIMIT 1`,
      userId,
    ) ?? null
  );
}

export function hasNotification(receiptId: string, notificationType: string): boolean {
  return Boolean(
    get<{ id: string }>(
      `SELECT id FROM subscription_events WHERE provider_event_id = ?`,
      `amazon:${notificationType}:${receiptId}`,
    ),
  );
}

/** Records a processed Real-Time Notification so SNS retries are no-ops. */
export function recordNotification(userId: string, receiptId: string, notificationType: string) {
  recordEvent(userId, `amazon.rtn.${notificationType}`, `amazon:${notificationType}:${receiptId}`, {
    notificationType,
  });
}

function recordEvent(userId: string, eventType: string, providerEventId: string, payload: unknown) {
  run(
    `INSERT OR IGNORE INTO subscription_events
       (id, user_id, provider, event_type, provider_event_id, payload, created_at)
     VALUES (?, ?, 'amazon', ?, ?, ?, ?)`,
    randomUUID(),
    userId,
    eventType,
    providerEventId,
    JSON.stringify(payload).slice(0, 4000),
    nowIso(),
  );
}

function saveReceipt(params: {
  userId: string;
  appUserId: string;
  receipt: AmazonReceipt;
  state: SubscriptionState;
  rawResponse: string | null;
}) {
  const { receipt, state } = params;
  run(
    `INSERT INTO iap_receipts
       (id, user_id, provider, receipt_id, app_user_id, product_id, term_sku, product_type,
        status, auto_renewing, purchase_date, renewal_date, cancel_date, grace_period_end,
        test_transaction, raw_response, verified_at, created_at)
     VALUES (?, ?, 'amazon', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(provider, receipt_id) DO UPDATE SET
       status = excluded.status,
       auto_renewing = excluded.auto_renewing,
       renewal_date = excluded.renewal_date,
       cancel_date = excluded.cancel_date,
       grace_period_end = excluded.grace_period_end,
       raw_response = excluded.raw_response,
       verified_at = excluded.verified_at`,
    randomUUID(),
    params.userId,
    receipt.receiptId,
    params.appUserId,
    receipt.productId,
    receipt.termSku,
    receipt.productType,
    state.status,
    bit(receipt.autoRenewing),
    iso(receipt.purchaseDate),
    iso(receipt.renewalDate),
    iso(receipt.cancelDate),
    iso(receipt.gracePeriodEndDate),
    bit(receipt.testTransaction),
    params.rawResponse,
    nowIso(),
    nowIso(),
  );
}

/**
 * Writes the receipt and the subscription row in one transaction. The receipt
 * alone never grants premium – only this row does.
 */
export function applyVerifiedReceipt(params: {
  userId: string;
  appUserId: string;
  receipt: AmazonReceipt;
  state: SubscriptionState;
  rawResponse: string | null;
}) {
  const { receipt, state } = params;
  transaction(() => {
    ensureSubscription(params.userId);
    saveReceipt({
      userId: params.userId,
      appUserId: params.appUserId,
      receipt,
      state,
      rawResponse: params.rawResponse,
    });
    run(
      `UPDATE subscriptions SET plan = 'premium', status = ?, channel = 'amazon', provider = 'amazon',
         provider_customer_id = ?, provider_subscription_id = ?, current_period_end = ?,
         cancel_at_period_end = ?, updated_at = ?
       WHERE user_id = ?`,
      state.status,
      params.appUserId,
      receipt.termSku ?? receipt.productId,
      state.currentPeriodEnd,
      bit(state.cancelAtPeriodEnd),
      nowIso(),
      params.userId,
    );
    recordEvent(
      params.userId,
      `amazon.receipt.${state.status}`,
      `amazon:receipt:${receipt.receiptId}`,
      { productId: receipt.productId, termSku: receipt.termSku, cancelAtPeriodEnd: state.cancelAtPeriodEnd },
    );
  });
}

/** RVS answered 410: the receipt is no longer valid, so premium ends now. */
export function applyCanceledReceipt(params: { userId: string; receiptId: string }) {
  transaction(() => {
    const at = nowIso();
    run(
      `UPDATE iap_receipts SET status = 'canceled', verified_at = ?
       WHERE provider = 'amazon' AND receipt_id = ?`,
      at,
      params.receiptId,
    );
    const subscription = getSubscription(params.userId);
    if (subscription && subscription.channel === "amazon") {
      run(
        `UPDATE subscriptions SET status = 'canceled', cancel_at_period_end = 0,
           current_period_end = COALESCE(current_period_end, ?), updated_at = ?
         WHERE user_id = ?`,
        at,
        at,
        params.userId,
      );
    }
    recordEvent(params.userId, "amazon.receipt.canceled", `amazon:receipt:${params.receiptId}`, {
      reason: "rvs_410",
    });
  });
}

/** Subscription shape shared by `/api/v1/me` and the Amazon endpoints. */
export function subscriptionView(userId: string): SubscriptionView {
  const subscription = getSubscription(userId);
  const status = effectiveStatus(subscription);
  return {
    plan: "premium",
    status,
    channel: subscription?.channel ?? "web",
    currentPeriodEnd: subscription?.current_period_end ?? null,
    premiumActive: status === "active",
  };
}
