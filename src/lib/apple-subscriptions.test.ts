import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Prüft die Schreibwege der App-Store-Anbindung gegen eine echte SQLite-Datei:
 * Spalten, Platzhalter, Transaktion und der Unique-Index. Genau diese Schicht
 * kann man ohne Datenbank nicht sinnvoll prüfen, und ein Tippfehler in einem
 * INSERT fällt sonst erst im Betrieb auf.
 *
 * `DATABASE_PATH` muss vor dem Import von `db.ts` gesetzt sein – deshalb die
 * dynamischen Importe.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-apple-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

const { get, nowIso, run } = await import("./db.ts");
const { applyVerifiedTransaction, appleSubscriptionView, getAppleReceipt, refreshStoredAppleReceipt } =
  await import("./apple-subscriptions.ts");
const { transactionState } = await import("./apple-iap.ts");
const { getSubscription } = await import("./payments.ts");

import type { AppleTransaction } from "./apple-iap.ts";

const transaction = (overrides: Partial<AppleTransaction> = {}): AppleTransaction => ({
  transactionId: "2000000000000001",
  originalTransactionId: "1000000000000001",
  bundleId: "org.streaminghub.app",
  productId: "premium_monthly",
  productType: "Auto-Renewable Subscription",
  environment: "Production",
  purchaseDate: Date.now() - 60_000,
  expiresDate: Date.now() + 30 * 86_400_000,
  revocationDate: null,
  inAppOwnershipType: "PURCHASED",
  appAccountToken: null,
  ...overrides,
});

function createUser(id: string) {
  const now = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
     VALUES (?, ?, 'x', 'Testkonto', ?, ?)`,
    id,
    `${id}@example.test`,
    now,
    now,
  );
}

function receiptCount(originalTransactionId: string) {
  return (
    get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM iap_receipts WHERE provider = 'apple' AND receipt_id = ?`,
      originalTransactionId,
    )?.count ?? 0
  );
}

test("a verified transaction writes one receipt and activates the subscription", () => {
  createUser("user-new");
  const tx = transaction();
  applyVerifiedTransaction({ userId: "user-new", transaction: tx, state: transactionState(tx) });

  const view = appleSubscriptionView("user-new");
  assert.equal(view.channel, "apple");
  assert.equal(view.status, "active");
  assert.equal(view.premiumActive, true);
  assert.ok(view.currentPeriodEnd);

  const receipt = getAppleReceipt(tx.originalTransactionId);
  assert.equal(receipt?.user_id, "user-new");
  assert.equal(receipt?.status, "active");
  assert.equal(receiptCount(tx.originalTransactionId), 1);
});

test("a renewal updates the same receipt instead of adding a second one", () => {
  createUser("user-renew");
  const first = transaction({ originalTransactionId: "1000000000000002" });
  applyVerifiedTransaction({ userId: "user-renew", transaction: first, state: transactionState(first) });

  const renewal = transaction({
    transactionId: "2000000000000099",
    originalTransactionId: first.originalTransactionId,
    expiresDate: Date.now() + 60 * 86_400_000,
  });
  applyVerifiedTransaction({ userId: "user-renew", transaction: renewal, state: transactionState(renewal) });

  assert.equal(receiptCount(first.originalTransactionId), 1);
  const view = appleSubscriptionView("user-renew");
  assert.equal(view.status, "active");
  assert.equal(view.currentPeriodEnd, new Date(renewal.expiresDate!).toISOString());
});

test("the database refuses the same subscription on a second account", () => {
  createUser("user-a");
  createUser("user-b");
  const tx = transaction({ originalTransactionId: "1000000000000003" });
  applyVerifiedTransaction({ userId: "user-a", transaction: tx, state: transactionState(tx) });

  assert.throws(
    () => applyVerifiedTransaction({ userId: "user-b", transaction: tx, state: transactionState(tx) }),
    /UNIQUE|unique/i,
  );
  assert.equal(getSubscription("user-b")?.status ?? "none", "none");
  assert.equal(getAppleReceipt(tx.originalTransactionId)?.user_id, "user-a");
});

test("a refund ends premium immediately", () => {
  createUser("user-refund");
  const tx = transaction({ originalTransactionId: "1000000000000004" });
  applyVerifiedTransaction({ userId: "user-refund", transaction: tx, state: transactionState(tx) });
  assert.equal(appleSubscriptionView("user-refund").premiumActive, true);

  const refunded = transaction({
    originalTransactionId: tx.originalTransactionId,
    revocationDate: Date.now() - 1_000,
  });
  applyVerifiedTransaction({
    userId: "user-refund",
    transaction: refunded,
    state: transactionState(refunded),
  });

  const view = appleSubscriptionView("user-refund");
  assert.equal(view.status, "canceled");
  assert.equal(view.premiumActive, false);
});

test("refresh ends an elapsed period that the app never renewed", () => {
  createUser("user-expired");
  const tx = transaction({
    originalTransactionId: "1000000000000005",
    expiresDate: Date.now() + 60_000,
  });
  applyVerifiedTransaction({ userId: "user-expired", transaction: tx, state: transactionState(tx) });
  assert.equal(appleSubscriptionView("user-expired").premiumActive, true);

  // Zeitraum künstlich in die Vergangenheit legen und den Pull-Lauf auslösen.
  const past = new Date(Date.now() - 86_400_000).toISOString();
  run(
    `UPDATE iap_receipts SET renewal_date = ? WHERE provider = 'apple' AND receipt_id = ?`,
    past,
    tx.originalTransactionId,
  );
  refreshStoredAppleReceipt("user-expired");

  const view = appleSubscriptionView("user-expired");
  assert.equal(view.status, "canceled");
  assert.equal(view.premiumActive, false);
  assert.equal(getAppleReceipt(tx.originalTransactionId)?.status, "expired");
});

test("refresh leaves an active period alone", () => {
  createUser("user-still-active");
  const tx = transaction({ originalTransactionId: "1000000000000006" });
  applyVerifiedTransaction({
    userId: "user-still-active",
    transaction: tx,
    state: transactionState(tx),
  });

  refreshStoredAppleReceipt("user-still-active");
  assert.equal(appleSubscriptionView("user-still-active").premiumActive, true);
});
