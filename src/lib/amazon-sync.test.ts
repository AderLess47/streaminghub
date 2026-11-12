import "./ts-resolve-hooks.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after, beforeEach } from "node:test";
import type { AmazonReceipt, AmazonVerifyResult } from "./amazon-iap.ts";

const databasePath = path.join(os.tmpdir(), `streaminghub-amazon-sync-${process.pid}.db`);
process.env.DATABASE_PATH = databasePath;
process.env.APP_URL = "http://localhost:3000";

const { get, nowIso, run } = await import("./db.ts");
const { receiptState } = await import("./amazon-iap.ts");
const { applyVerifiedReceipt, subscriptionView } = await import("./amazon-subscriptions.ts");
const { selectDueReceipts, syncAmazonReceipts } = await import("./amazon-sync.ts");

const DAY = 86_400_000;
const now = Date.now();

function seedUser(id: string) {
  run(
    `INSERT INTO users (id, email, password_hash, display_name, email_verified, created_at, updated_at)
     VALUES (?, ?, 'x', 'Test', 1, ?, ?)`,
    id,
    `${id}@example.com`,
    nowIso(),
    nowIso(),
  );
}

function receipt(overrides: Partial<AmazonReceipt> = {}): AmazonReceipt {
  return {
    receiptId: `receipt-${Math.random().toString(36).slice(2)}`,
    productId: "premium_monthly",
    termSku: "premium_monthly.term.1month",
    productType: "SUBSCRIPTION",
    autoRenewing: true,
    purchaseDate: now - DAY,
    renewalDate: now + 30 * DAY,
    cancelDate: null,
    gracePeriodEndDate: null,
    freeTrialEndDate: null,
    testTransaction: false,
    betaProduct: false,
    ...overrides,
  };
}

function grant(userId: string, appUserId: string, overrides: Partial<AmazonReceipt> = {}) {
  const value = receipt(overrides);
  applyVerifiedReceipt({
    userId,
    appUserId,
    receipt: value,
    state: receiptState(value, now),
    rawResponse: null,
  });
  return value;
}

// Every test starts from an empty schema so due-receipt queries stay predictable.
beforeEach(() => {
  for (const table of ["iap_receipts", "subscription_events", "subscriptions", "users"]) {
    run(`DELETE FROM ${table}`);
  }
});

after(() => {
  try {
    fs.rmSync(databasePath, { force: true });
  } catch {
    // Throwaway database in the temp directory.
  }
});

test("only receipts near their renewal or cancel date are due", () => {
  seedUser("sync-one");
  seedUser("sync-two");
  const dueSoon = grant("sync-one", "amazon-sync-one", { renewalDate: now + DAY });
  grant("sync-two", "amazon-sync-two", { renewalDate: now + 30 * DAY });

  const due = selectDueReceipts(now);
  const ids = due.map((row) => row.receipt_id);
  assert.equal(ids.includes(dueSoon.receiptId), true);
  assert.equal(due.length, 1);
});

test("sync stores a renewed period", async () => {
  seedUser("sync-three");
  const value = grant("sync-three", "amazon-sync-three", { renewalDate: now + DAY });

  const result = await syncAmazonReceipts({
    now,
    verify: async () => ({
      ok: true,
      receipt: { ...value, renewalDate: now + 31 * DAY },
    }),
  });

  assert.deepEqual(result, { checked: 1, updated: 1, canceled: 0, failed: 0 });
  assert.equal(
    subscriptionView("sync-three").currentPeriodEnd,
    new Date(now + 31 * DAY).toISOString(),
  );
  assert.equal(subscriptionView("sync-three").premiumActive, true);
});

test("sync ends premium when RVS reports a canceled receipt", async () => {
  seedUser("sync-four");
  grant("sync-four", "amazon-sync-four", { renewalDate: now + DAY });

  const canceled: AmazonVerifyResult = { ok: false, code: "canceled" };
  const result = await syncAmazonReceipts({ now, verify: async () => canceled });

  assert.deepEqual(result, { checked: 1, updated: 0, canceled: 1, failed: 0 });
  assert.equal(subscriptionView("sync-four").premiumActive, false);
});

test("sync counts failed verifications and keeps the current state", async () => {
  seedUser("sync-five");
  grant("sync-five", "amazon-sync-five", { renewalDate: now + DAY });

  const failed: AmazonVerifyResult = { ok: false, code: "provider_error" };
  const result = await syncAmazonReceipts({ now, verify: async () => failed });

  assert.deepEqual(result, { checked: 1, updated: 0, canceled: 0, failed: 1 });
  assert.equal(subscriptionView("sync-five").premiumActive, true);
});

test("a sync run records its summary once", async () => {
  seedUser("sync-six");
  grant("sync-six", "amazon-sync-six", { renewalDate: now + DAY });

  const failed: AmazonVerifyResult = { ok: false, code: "provider_error" };
  const options = { now, verify: async () => failed };
  await syncAmazonReceipts(options);
  await syncAmazonReceipts(options);

  const row = get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM subscription_events WHERE event_type = 'amazon.sync'`,
  );
  assert.equal(row?.count, 1);
});
