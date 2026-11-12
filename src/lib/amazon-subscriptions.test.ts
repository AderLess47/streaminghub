import "./ts-resolve-hooks.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import type { AmazonReceipt } from "./amazon-iap.ts";

const databasePath = path.join(os.tmpdir(), `streaminghub-amazon-${process.pid}.db`);
process.env.DATABASE_PATH = databasePath;
process.env.APP_URL = "http://localhost:3000";

const { get, nowIso, run } = await import("./db.ts");
const { receiptState } = await import("./amazon-iap.ts");
const { applyCanceledReceipt, applyVerifiedReceipt, getReceipt, subscriptionView } = await import(
  "./amazon-subscriptions.ts"
);
const { cancelSubscription, createWebCheckout } = await import("./payments.ts");

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

after(() => {
  try {
    fs.rmSync(databasePath, { force: true });
  } catch {
    // The database file is a throwaway in the temp directory.
  }
});

test("a verified receipt activates Amazon premium exactly once", () => {
  seedUser("user-one");
  const value = grant("user-one", "amazon-customer-one");

  const view = subscriptionView("user-one");
  assert.equal(view.channel, "amazon");
  assert.equal(view.status, "active");
  assert.equal(view.premiumActive, true);
  assert.equal(view.currentPeriodEnd, new Date(now + 30 * DAY).toISOString());

  // Replaying the same receipt must not create a second row or event.
  grant("user-one", "amazon-customer-one", { receiptId: value.receiptId });
  const rows = get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM iap_receipts WHERE user_id = ?`,
    "user-one",
  );
  assert.equal(rows?.count, 1);
  assert.equal(getReceipt(value.receiptId)?.status, "active");
});

test("a receipt RVS no longer honours removes premium", () => {
  seedUser("user-two");
  const value = grant("user-two", "amazon-customer-two");
  assert.equal(subscriptionView("user-two").premiumActive, true);

  applyCanceledReceipt({ userId: "user-two", receiptId: value.receiptId });

  const view = subscriptionView("user-two");
  assert.equal(view.status, "canceled");
  assert.equal(view.premiumActive, false);
  assert.equal(getReceipt(value.receiptId)?.status, "canceled");
});

test("an Amazon subscription cannot be cancelled on the website", async () => {
  seedUser("user-three");
  grant("user-three", "amazon-customer-three");

  const result = await cancelSubscription("user-three");
  assert.equal(result.ok, false);
  assert.match(result.message, /Amazon/);
});

test("an active Amazon subscription blocks a second web checkout", async () => {
  seedUser("user-four");
  grant("user-four", "amazon-customer-four");

  const result = await createWebCheckout({
    userId: "user-four",
    email: "user-four@example.com",
    locale: "de",
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "already_active");
});

test("one Amazon customer cannot hold premium on two accounts", () => {
  seedUser("user-five");
  seedUser("user-six");
  grant("user-five", "amazon-customer-shared");

  assert.throws(() => grant("user-six", "amazon-customer-shared"), /UNIQUE|constraint/i);
  assert.equal(subscriptionView("user-six").premiumActive, false);
});
