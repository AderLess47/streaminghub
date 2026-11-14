/**
 * Daily pull sync for Amazon subscriptions: RVS stays authoritative, so every
 * receipt whose dates are close to now is re-verified even without a
 * Real-Time Notification. Logs counts only – never receipt or customer ids.
 */
import { all, get, nowIso, run } from "./db";
import {
  receiptState,
  verifyReceipt,
  type AmazonVerifyResult,
} from "./amazon-iap";
import {
  applyCanceledReceipt,
  applyVerifiedReceipt,
  type ReceiptRow,
} from "./amazon-subscriptions";
import { notifyStoreSubscriptionEnded } from "./payments";

const DAY = 86_400_000;

export type SyncResult = {
  checked: number;
  updated: number;
  canceled: number;
  failed: number;
};

export type SyncOptions = {
  /** Verification call, injectable for tests. */
  verify: (row: ReceiptRow) => Promise<AmazonVerifyResult>;
  now?: number;
  limit?: number;
};

/**
 * Receipts due for a re-check: renewals and cancellations inside the window,
 * plus anything already overdue (so a missed notification cannot keep premium
 * alive forever).
 */
export function selectDueReceipts(now = Date.now(), windowDays = 3, limit = 200): ReceiptRow[] {
  const from = new Date(now - windowDays * DAY).toISOString();
  const to = new Date(now + windowDays * DAY).toISOString();
  return all<ReceiptRow>(
    `SELECT * FROM iap_receipts
     WHERE provider = 'amazon'
       AND status <> 'canceled'
       AND (
         (renewal_date IS NOT NULL AND renewal_date <= ?) OR
         (cancel_date IS NOT NULL AND cancel_date <= ?) OR
         (grace_period_end IS NOT NULL AND grace_period_end <= ?) OR
         (renewal_date IS NULL AND cancel_date IS NULL AND verified_at <= ?)
       )
     ORDER BY COALESCE(renewal_date, cancel_date, verified_at) ASC
     LIMIT ?`,
    to,
    to,
    to,
    from,
    limit,
  );
}

export async function syncAmazonReceipts(options: SyncOptions): Promise<SyncResult> {
  const now = options.now ?? Date.now();
  const rows = selectDueReceipts(now, 3, options.limit ?? 200);
  const result: SyncResult = { checked: 0, updated: 0, canceled: 0, failed: 0 };

  for (const row of rows) {
    result.checked += 1;
    const outcome = await options.verify(row);
    if (!outcome.ok) {
      if (outcome.code === "canceled") {
        applyCanceledReceipt({ userId: row.user_id, receiptId: row.receipt_id });
        await notifyStoreSubscriptionEnded({
          userId: row.user_id,
          store: "amazon",
          subscriptionKey: `amazon:${row.receipt_id}`,
          periodEnd: row.renewal_date ?? row.cancel_date,
        });
        result.canceled += 1;
        continue;
      }
      result.failed += 1;
      continue;
    }

    const state = receiptState(outcome.receipt, now);
    applyVerifiedReceipt({
      userId: row.user_id,
      appUserId: row.app_user_id,
      receipt: outcome.receipt,
      state,
      rawResponse: null,
    });
    if (state.status === "canceled") {
      await notifyStoreSubscriptionEnded({
        userId: row.user_id,
        store: "amazon",
        subscriptionKey: `amazon:${row.receipt_id}`,
        periodEnd: state.currentPeriodEnd,
      });
      result.canceled += 1;
    } else {
      result.updated += 1;
    }
  }

  run(
    `INSERT OR IGNORE INTO subscription_events
       (id, user_id, provider, event_type, provider_event_id, payload, created_at)
     VALUES (?, NULL, 'amazon', 'amazon.sync', ?, ?, ?)`,
    `sync-${now}`,
    `amazon:sync:${new Date(now).toISOString().slice(0, 13)}`,
    JSON.stringify(result),
    nowIso(),
  );

  return result;
}

/** Convenience wrapper used by the internal route. */
export async function runAmazonSync(config: {
  baseUrl: string;
  sandbox: boolean;
  sharedSecret: string;
  now?: number;
  limit?: number;
}): Promise<SyncResult> {
  return syncAmazonReceipts({
    now: config.now,
    limit: config.limit,
    verify: (row) =>
      verifyReceipt({
        baseUrl: config.baseUrl,
        sandbox: config.sandbox,
        sharedSecret: config.sharedSecret,
        appUserId: row.app_user_id,
        receiptId: row.receipt_id,
        expectedProductId: row.product_id,
      }),
  });
}

/** Subscription counts for the admin view and for smoke checks. */
export function amazonSubscriptionCounts() {
  const row = get<{ total: number; active: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active
     FROM subscriptions WHERE provider = 'amazon'`,
  );
  return { total: row?.total ?? 0, active: row?.active ?? 0 };
}
