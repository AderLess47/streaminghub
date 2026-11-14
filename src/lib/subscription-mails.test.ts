import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Der Mail-Zyklus eines Abos: Auslaufen, Wiederkauf, erneutes Auslaufen und die
 * Dedupe derselben Meldung. Die Store-Routen selbst brauchen Geräte-Tokens und
 * sind hier nicht erreichbar; geprüft wird die Funktion, die sie nach dem
 * Statuswechsel aufrufen, plus der vollständige Stripe-Webhook-Pfad.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-mails-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
process.env.APP_URL = "http://localhost:3000";
delete process.env.RESEND_API_KEY;

const { all, nowIso, run } = await import("./db.ts");
const { applyStripeEvent } = await import("./payments.ts");
const { notifyStoreSubscriptionEnded } = await import("./payments.ts");
const { applyVerifiedReceipt } = await import("./amazon-subscriptions.ts");
const { receiptState } = await import("./amazon-iap.ts");

const DAY = 86_400_000;
const now = Date.now();

function seedUser(id: string, customerId: string | null = null) {
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, created_at, updated_at)
     VALUES (?, ?, 'x', 'Testkonto', 'de', ?, ?)`,
    id,
    `${id}@example.test`,
    nowIso(),
    nowIso(),
  );
  if (customerId) {
    run(
      `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, provider_customer_id,
         provider_subscription_id, current_period_end, cancel_at_period_end, updated_at, created_at)
       VALUES (?, ?, 'premium', 'active', 'web', 'stripe', ?, ?, ?, 0, ?, ?)`,
      `sub-${id}`,
      id,
      customerId,
      `stripe-${id}`,
      new Date(now + 30 * DAY).toISOString(),
      nowIso(),
      nowIso(),
    );
  }
}

function mailCount() {
  return all<{ c: number }>(`SELECT COUNT(*) AS c FROM outbox_emails`)[0].c;
}

function subjects() {
  return all<{ subject: string }>(`SELECT subject FROM outbox_emails ORDER BY created_at`).map(
    (row) => row.subject,
  );
}

function stripeEvent(
  id: string,
  type: string,
  object: Record<string, unknown>,
) {
  return applyStripeEvent({ id, type, data: { object } });
}

test("stripe: expired, paid again, expired again, then deduplicated", async () => {
  seedUser("stripe-cycle", "cus_cycle");
  const p1 = Math.floor((now - DAY) / 1000);
  const p2 = Math.floor((now - 3_600_000) / 1000);

  await stripeEvent("evt_unpaid_1", "customer.subscription.updated", {
    id: "sub_stripe_cycle",
    customer: "cus_cycle",
    status: "unpaid",
    current_period_end: p1,
  });
  assert.equal(mailCount(), 1);
  assert.match(subjects()[0], /ausgelaufen/);

  // Nachzahlung: nur die "wieder aktiv"-Mail, keine zweite Abschlussmail.
  await stripeEvent("evt_paid_1", "invoice.paid", {
    customer: "cus_cycle",
    lines: { data: [{ period: { end: p1 } }] },
  });
  assert.equal(mailCount(), 2);
  assert.match(subjects()[1], /wieder aktiv/);

  // Neuer Zeitraum, erneut zahlungsunfähig: wieder eine Abschlussmail.
  await stripeEvent("evt_unpaid_2", "customer.subscription.updated", {
    id: "sub_stripe_cycle",
    customer: "cus_cycle",
    status: "unpaid",
    current_period_end: p2,
  });
  assert.equal(mailCount(), 3);
  assert.match(subjects()[2], /ausgelaufen/);

  // Löschung im selben Zeitraum und wiederholte Meldung: keine weitere Mail.
  await stripeEvent("evt_deleted_1", "customer.subscription.deleted", {
    id: "sub_stripe_cycle",
    customer: "cus_cycle",
  });
  await stripeEvent("evt_unpaid_3", "customer.subscription.updated", {
    id: "sub_stripe_cycle",
    customer: "cus_cycle",
    status: "unpaid",
    current_period_end: p2,
  });
  assert.equal(mailCount(), 3);
});

test("store: repurchase sends nothing, the next expiry mails once", async () => {
  seedUser("store-cycle");
  const p1 = new Date(now - 3 * DAY).toISOString();
  const p2 = new Date(now - 3_600_000).toISOString();

  const sent = await notifyStoreSubscriptionEnded({
    userId: "store-cycle",
    store: "amazon",
    subscriptionKey: "amazon:receipt-1",
    periodEnd: p1,
  });
  assert.equal(sent, true);
  const afterFirstExpiry = mailCount();

  // Wiederkauf: neuer Zeitraum, kein Mailversand in diesem Schritt.
  const receipt = {
    receiptId: "receipt-1",
    productId: "premium_monthly",
    termSku: "premium_monthly.term.1month",
    productType: "SUBSCRIPTION",
    autoRenewing: true,
    purchaseDate: now - 30 * DAY,
    renewalDate: now + 30 * DAY,
    cancelDate: null,
    gracePeriodEndDate: null,
    freeTrialEndDate: null,
    testTransaction: false,
    betaProduct: false,
  };
  applyVerifiedReceipt({
    userId: "store-cycle",
    appUserId: "amazon-user",
    receipt,
    state: receiptState(receipt),
    rawResponse: null,
  });
  assert.equal(mailCount(), afterFirstExpiry);

  // Derselbe Beleg, neuer Ablauf: die Markierung des alten Zeitraums blockiert nicht.
  const sentAgain = await notifyStoreSubscriptionEnded({
    userId: "store-cycle",
    store: "amazon",
    subscriptionKey: "amazon:receipt-1",
    periodEnd: p2,
  });
  assert.equal(sentAgain, true);
  assert.equal(mailCount(), afterFirstExpiry + 1);

  // Dieselbe Feststellung noch einmal: keine dritte Mail.
  const duplicate = await notifyStoreSubscriptionEnded({
    userId: "store-cycle",
    store: "amazon",
    subscriptionKey: "amazon:receipt-1",
    periodEnd: p2,
  });
  assert.equal(duplicate, false);
  assert.equal(mailCount(), afterFirstExpiry + 1);

  const markers = all<{ provider_event_id: string }>(
    `SELECT provider_event_id FROM subscription_events WHERE event_type = 'mail.sent' AND user_id = ? ORDER BY created_at`,
    "store-cycle",
  ).map((row) => row.provider_event_id);
  assert.equal(markers.length, 2);
  assert.match(markers[0], new RegExp(`amazon:receipt-1:${p1.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  assert.match(markers[1], new RegExp(`amazon:receipt-1:${p2.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
});
