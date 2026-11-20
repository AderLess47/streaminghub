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

test("die Kaufbestätigung nennt das tatsächliche Intervall", async () => {
  // Regression: Der Text sagte immer „/ Monat“, auch für ein Jahresabo.
  const { purchaseConfirmationMail } = await import("./mail.ts");

  const yearly = purchaseConfirmationMail({
    name: "Testkonto",
    locale: "de",
    priceEur: 34.99,
    interval: "year",
  });
  assert.match(yearly.text, /34,99\s*€ \/ Jahr/);
  assert.doesNotMatch(yearly.text, /\/ Monat/);

  const monthly = purchaseConfirmationMail({
    name: "Testkonto",
    locale: "en",
    priceEur: 3.49,
    interval: "month",
  });
  assert.match(monthly.text, /€3\.49 \/ month/);
});

test("the trial-start mail names the device limits from the settings", async () => {
  const { trialStartedMail } = await import("./mail.ts");

  const defaults = trialStartedMail({ name: "Max", locale: "de", trialEndsAt: "2026-12-03T22:00:00.000Z", priceEur: 3.49 });
  assert.match(defaults.text, /bis zu 5 gekoppelte Geräte/);
  assert.match(defaults.text, /kostenlose Tarif mit 2 Geräten/);

  const setLimit = (key: string, value: string) =>
    run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      key,
      value,
      nowIso(),
    );
  setLimit("free_device_limit", "3");
  setLimit("premium_device_limit", "7");

  const changed = trialStartedMail({ name: "Max", locale: "de", trialEndsAt: "2026-12-03T22:00:00.000Z", priceEur: 3.49 });
  assert.match(changed.text, /bis zu 7 gekoppelte Geräte/);
  assert.match(changed.text, /kostenlose Tarif mit 3 Geräten/);

  const en = trialStartedMail({ name: "Max", locale: "en", trialEndsAt: "2026-12-03T22:00:00.000Z", priceEur: 3.49 });
  assert.match(en.text, /link up to 7 devices/);
  assert.match(en.text, /free plan with 3 devices/);

  // Zurück auf die Standardwerte, damit spätere Tests dieselben Limits sehen.
  setLimit("free_device_limit", "2");
  setLimit("premium_device_limit", "5");
});

test("the cancellation confirmation greets by name when the account has one", async () => {
  const { cancellationMail } = await import("./mail.ts");
  const base = {
    reference: "KND-1",
    contract: "StreamingHub Premium, monatlich",
    receivedAt: "20.11.2026, 21:20",
    effectiveAt: "3. Dezember 2026",
    status: "canceled_web",
    channel: null,
    locale: "de",
  };

  assert.match(cancellationMail({ ...base, name: "Max" }).text, /^Hallo Max,/);
  assert.match(cancellationMail({ ...base, name: "" }).text, /^Hallo,/);
  assert.match(cancellationMail({ ...base, name: "Max", locale: "en" }).text, /^Hello Max,/);
});

function seedDevice(userId: string, id: string, lastSeenAt: string) {
  run(
    `INSERT INTO devices (id, user_id, name, platform, status, activated_at, last_seen_at, created_at)
     VALUES (?, ?, ?, 'web', 'active', ?, ?, ?)`,
    id,
    userId,
    `Gerät ${id}`,
    lastSeenAt,
    lastSeenAt,
    lastSeenAt,
  );
}

function activeDeviceIds(userId: string) {
  return all<{ id: string }>(
    `SELECT id FROM devices WHERE user_id = ? AND status = 'active' ORDER BY id`,
    userId,
  ).map((row) => row.id);
}

function lastMailText() {
  return all<{ body_text: string }>(
    `SELECT body_text FROM outbox_emails ORDER BY created_at DESC LIMIT 1`,
  )[0].body_text;
}

test("an ended web subscription unlinks devices over the free limit", async () => {
  seedUser("devices-web", "cus_devices_web");
  // Vier Geräte, das erste zuletzt genutzt: es muss bleiben.
  for (let i = 0; i < 4; i += 1) {
    seedDevice("devices-web", `web-${i}`, new Date(now - i * 1_000).toISOString());
  }

  await stripeEvent("evt_devices_unpaid", "customer.subscription.updated", {
    id: "sub_devices_web",
    customer: "cus_devices_web",
    status: "unpaid",
    current_period_end: Math.floor((now - DAY) / 1000),
  });

  assert.deepEqual(activeDeviceIds("devices-web"), ["web-0", "web-1"]);
  assert.match(lastMailText(), /2 weitere Geräte wurden deshalb abgemeldet/);

  // Der Grund steht an den Geräten, damit das Konto ihn erklären kann.
  const reasons = all<{ revoked_reason: string | null }>(
    `SELECT revoked_reason FROM devices WHERE user_id = ? AND status = 'revoked'`,
    "devices-web",
  ).map((row) => row.revoked_reason);
  assert.deepEqual(reasons, ["subscription_ended", "subscription_ended"]);
  assert.doesNotMatch(lastMailText(), /Deine Geräte bleiben gekoppelt/);

  // Zweite Meldung für denselben Zeitraum: keine weitere Mail, keine weitere Abmeldung.
  const mailed = mailCount();
  await stripeEvent("evt_devices_unpaid_again", "customer.subscription.updated", {
    id: "sub_devices_web",
    customer: "cus_devices_web",
    status: "unpaid",
    current_period_end: Math.floor((now - DAY) / 1000),
  });
  assert.equal(mailCount(), mailed);
  assert.deepEqual(activeDeviceIds("devices-web"), ["web-0", "web-1"]);
});

test("a subscription ending with enough devices leaves them linked", async () => {
  seedUser("devices-few", "cus_devices_few");
  seedDevice("devices-few", "few-0", new Date(now - 1_000).toISOString());

  await stripeEvent("evt_devices_few_unpaid", "customer.subscription.updated", {
    id: "sub_devices_few",
    customer: "cus_devices_few",
    status: "unpaid",
    current_period_end: Math.floor((now - DAY) / 1000),
  });

  assert.deepEqual(activeDeviceIds("devices-few"), ["few-0"]);
  assert.match(lastMailText(), /Deine Geräte bleiben gekoppelt/);
  assert.doesNotMatch(lastMailText(), /abgemeldet/);
});

test("an ended store subscription unlinks devices over the free limit", async () => {
  seedUser("devices-store");
  for (let i = 0; i < 3; i += 1) {
    seedDevice("devices-store", `store-${i}`, new Date(now - i * 1_000).toISOString());
  }

  const sent = await notifyStoreSubscriptionEnded({
    userId: "devices-store",
    store: "apple",
    subscriptionKey: "apple:tx-devices",
    periodEnd: new Date(now - DAY).toISOString(),
  });
  assert.equal(sent, true);
  assert.deepEqual(activeDeviceIds("devices-store"), ["store-0", "store-1"]);
  assert.match(lastMailText(), /ein weiteres Gerät wurde deshalb abgemeldet/);
});
