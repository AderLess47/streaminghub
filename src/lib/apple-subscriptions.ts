/**
 * Persistenz der geprüften App-Store-Transaktionen.
 *
 * Dieselbe Tabelle wie für Amazon (`iap_receipts`, `provider = 'apple'`) und
 * dieselbe Regel: Der Beleg allein schaltet nichts frei – nur die
 * `subscriptions`-Zeile tut das, und die wird hier in einer Transaktion gesetzt.
 */
import { randomUUID } from "node:crypto";
import { bit, get, nowIso, run, transaction } from "./db";
import {
  effectiveStatus,
  ensureSubscription,
  getSubscription,
  type SubscriptionStatus,
} from "./payments";
import type { AppleSubscriptionState, AppleTransaction } from "./apple-iap";
import type { ReceiptRow } from "./amazon-subscriptions";

export type AppleReceiptRow = ReceiptRow;

export function getAppleReceipt(originalTransactionId: string): AppleReceiptRow | null {
  return (
    get<AppleReceiptRow>(
      `SELECT * FROM iap_receipts WHERE provider = 'apple' AND receipt_id = ?`,
      originalTransactionId,
    ) ?? null
  );
}

export function getLatestAppleReceipt(userId: string): AppleReceiptRow | null {
  return (
    get<AppleReceiptRow>(
      `SELECT * FROM iap_receipts
       WHERE provider = 'apple' AND user_id = ?
       ORDER BY verified_at DESC LIMIT 1`,
      userId,
    ) ?? null
  );
}

function recordEvent(userId: string, eventType: string, providerEventId: string, payload: unknown) {
  run(
    `INSERT OR IGNORE INTO subscription_events
       (id, user_id, provider, event_type, provider_event_id, payload, created_at)
     VALUES (?, ?, 'apple', ?, ?, ?, ?)`,
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
  transaction: AppleTransaction;
  state: AppleSubscriptionState;
}) {
  const { transaction: tx, state } = params;
  run(
    `INSERT INTO iap_receipts
       (id, user_id, provider, receipt_id, app_user_id, product_id, term_sku, product_type,
        status, auto_renewing, purchase_date, renewal_date, cancel_date, grace_period_end,
        test_transaction, raw_response, verified_at, created_at)
     VALUES (?, ?, 'apple', ?, ?, ?, ?, 'AUTO_RENEWABLE_SUBSCRIPTION',
             ?, 1, ?, ?, ?, NULL, ?, ?, ?, ?)
     ON CONFLICT(provider, receipt_id) DO UPDATE SET
       status = excluded.status,
       renewal_date = excluded.renewal_date,
       cancel_date = excluded.cancel_date,
       raw_response = excluded.raw_response,
       verified_at = excluded.verified_at`,
    randomUUID(),
    params.userId,
    tx.originalTransactionId,
    params.userId,
    tx.productId,
    null,
    state.status,
    tx.purchaseDate > 0 ? new Date(tx.purchaseDate).toISOString() : null,
    tx.expiresDate === null ? null : new Date(tx.expiresDate).toISOString(),
    tx.revocationDate === null ? null : new Date(tx.revocationDate).toISOString(),
    bit(tx.environment === "Sandbox"),
    JSON.stringify(tx),
    nowIso(),
    nowIso(),
  );
}

/**
 * Schreibt Beleg und Abo-Zeile gemeinsam. `originalTransactionId` wird zur
 * Kundenkennung im Abo-Datensatz, damit ein zweites Konto nicht dasselbe Abo
 * beanspruchen kann (Unique-Index `idx_subs_apple_customer`).
 */
export function applyVerifiedTransaction(params: {
  userId: string;
  transaction: AppleTransaction;
  state: AppleSubscriptionState;
}) {
  const { transaction: tx, state } = params;
  transaction(() => {
    ensureSubscription(params.userId);
    saveReceipt(params);
    run(
      `UPDATE subscriptions SET plan = 'premium', status = ?, channel = 'apple', provider = 'apple',
         provider_customer_id = ?, provider_subscription_id = ?, current_period_end = ?,
         cancel_at_period_end = 0, updated_at = ?
       WHERE user_id = ?`,
      state.status,
      tx.originalTransactionId,
      tx.productId,
      state.currentPeriodEnd,
      nowIso(),
      params.userId,
    );
    recordEvent(
      params.userId,
      `apple.transaction.${state.status}`,
      `apple:tx:${tx.transactionId}`,
      { productId: tx.productId, environment: tx.environment },
    );
  });
}

/**
 * Pull-Aktualisierung ohne App Store Server API: Ist der gespeicherte Zeitraum
 * abgelaufen und hat die App keine Verlängerung gemeldet, endet Premium hier.
 * Verlängerungen kommen als neue Transaktion über `/api/v1/apple/purchase`.
 */
export function refreshStoredAppleReceipt(userId: string, now = Date.now()) {
  const row = getLatestAppleReceipt(userId);
  if (!row) return;

  const subscription = getSubscription(userId);
  if (!subscription || subscription.channel !== "apple") return;

  const end = row.renewal_date ? Date.parse(row.renewal_date) : Number.NaN;
  const expired = !Number.isFinite(end) || end <= now;
  if (!expired || subscription.status !== "active") return;

  transaction(() => {
    run(
      `UPDATE iap_receipts SET status = 'expired', verified_at = ? WHERE provider = 'apple' AND receipt_id = ?`,
      nowIso(),
      row.receipt_id,
    );
    run(
      `UPDATE subscriptions SET status = 'canceled', updated_at = ? WHERE user_id = ?`,
      nowIso(),
      userId,
    );
    recordEvent(userId, "apple.subscription.expired", `apple:expired:${row.receipt_id}`, {
      currentPeriodEnd: row.renewal_date,
    });
  });
}

export type AppleSubscriptionView = {
  plan: "premium";
  status: SubscriptionStatus;
  channel: "web" | "amazon" | "apple";
  currentPeriodEnd: string | null;
  premiumActive: boolean;
};

export function appleSubscriptionView(userId: string): AppleSubscriptionView {
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
