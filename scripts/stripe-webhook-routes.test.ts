/**
 * Headless-Tests für `/api/webhooks/stripe`: Signaturprüfung, Mailzyklus und
 * Dedupe über die echte Route.
 *
 * Signatur, Event-Verarbeitung, Datenbank und Mailausgang laufen im Original;
 * ersetzt sind nur die NextResponse-Helfer (`scripts/fakes/api.ts`).
 *
 * Aufruf: npm run test:stripe-webhook
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

process.env.STRIPE_SECRET_KEY = "sk_test_local";
process.env.STRIPE_PRICE_ID = "price_local";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_local";
process.env.APP_URL = "https://streaminghub.org";
delete process.env.RESEND_API_KEY;

const { all, nowIso, run } = await import("@/lib/db");
const { POST: stripeWebhook } = await import("@/app/api/webhooks/stripe/route");

const SECRET = "whsec_local";
const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, body: () => Promise<void> | void) {
  try {
    await body();
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  \u2717 ${name}\n      ${detail.split("\n")[0]}`);
  }
}

function resetDb() {
  for (const table of [
    "outbox_emails",
    "subscription_events",
    "subscriptions",
    "devices",
    "rate_limits",
    "audit_log",
    "users",
  ]) {
    run(`DELETE FROM ${table}`);
  }
}

function seedSubscription() {
  const at = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, created_at, updated_at)
     VALUES ('stripe-cycle', 'stripe-cycle@example.test', 'x', 'Testkonto', 'de', ?, ?)`,
    at,
    at,
  );
  run(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, provider_customer_id,
       provider_subscription_id, current_period_end, cancel_at_period_end, updated_at, created_at)
     VALUES ('sub-row', 'stripe-cycle', 'premium', 'active', 'web', 'stripe', 'cus_cycle',
       'sub_cycle', ?, 0, ?, ?)`,
    new Date(Date.now() + 30 * 86_400_000).toISOString(),
    at,
    at,
  );
}

function sign(payload: string, timestamp = Math.floor(Date.now() / 1000)) {
  const signature = createHmac("sha256", SECRET).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

function eventBody(
  id: string,
  type: string,
  object: Record<string, unknown>,
): string {
  return JSON.stringify({ id, type, data: { object } });
}

function webhookRequest(payload: string, signature: string | null) {
  return new Request("https://app.example/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "app.example",
      ...(signature ? { "stripe-signature": signature } : {}),
    },
    body: payload,
  });
}

function mailCount() {
  return all<{ c: number }>(`SELECT COUNT(*) AS c FROM outbox_emails`)[0].c;
}

function eventCount() {
  return all<{ c: number }>(`SELECT COUNT(*) AS c FROM subscription_events`)[0].c;
}

function subjects() {
  return all<{ subject: string }>(`SELECT subject FROM outbox_emails ORDER BY created_at`).map(
    (row) => row.subject,
  );
}

const SUBSCRIPTION = { id: "sub_cycle", customer: "cus_cycle", current_period_end: 0 };
const P1 = Math.floor((Date.now() - 86_400_000) / 1000);
const P2 = Math.floor((Date.now() - 3_600_000) / 1000);

/* ------------------------------ Signatur ------------------------------- */

await check("ohne Signatur 400, kein Event gespeichert", async () => {
  resetDb();
  seedSubscription();
  const payload = eventBody("evt_missing", "customer.subscription.updated", {
    ...SUBSCRIPTION,
    status: "unpaid",
    current_period_end: P1,
  });
  const response = await stripeWebhook(webhookRequest(payload, null));
  assert.equal(response.status, 400);
  assert.equal(eventCount(), 0);
  assert.equal(mailCount(), 0);
});

await check("manipulierter Body 400", async () => {
  resetDb();
  seedSubscription();
  const payload = eventBody("evt_tampered", "customer.subscription.updated", {
    ...SUBSCRIPTION,
    status: "unpaid",
    current_period_end: P1,
  });
  const signature = sign(payload);
  const tampered = payload.replace('"unpaid"', '"active"');
  const response = await stripeWebhook(webhookRequest(tampered, signature));
  assert.equal(response.status, 400);
  assert.equal(eventCount(), 0);
  assert.equal(mailCount(), 0);
});

await check("abgelaufener Zeitstempel 400", async () => {
  resetDb();
  seedSubscription();
  const payload = eventBody("evt_old", "customer.subscription.updated", {
    ...SUBSCRIPTION,
    status: "unpaid",
    current_period_end: P1,
  });
  const stale = Math.floor(Date.now() / 1000) - 600;
  const response = await stripeWebhook(webhookRequest(payload, sign(payload, stale)));
  assert.equal(response.status, 400);
  assert.equal(eventCount(), 0);
});

await check("ungueltiges JSON mit gueltiger Signatur 400", async () => {
  resetDb();
  seedSubscription();
  const payload = "{kein json";
  const response = await stripeWebhook(webhookRequest(payload, sign(payload)));
  assert.equal(response.status, 400);
  assert.equal(eventCount(), 0);
});

/* ------------------------------ Mailzyklus ------------------------------ */

await check("unpaid mailt, Duplikat nicht, Nachzahlung und zweiter Ablauf", async () => {
  resetDb();
  seedSubscription();

  const unpaid1 = eventBody("evt_unpaid_1", "customer.subscription.updated", {
    ...SUBSCRIPTION,
    status: "unpaid",
    current_period_end: P1,
  });
  const first = await stripeWebhook(webhookRequest(unpaid1, sign(unpaid1)));
  assert.equal(first.status, 200);
  const firstBody = (await first.json()) as { duplicate: boolean };
  assert.equal(firstBody.duplicate, false);
  assert.equal(mailCount(), 1);

  // Dasselbe Event noch einmal: keine zweite Mail, kein zweiter Effekt.
  const duplicate = await stripeWebhook(webhookRequest(unpaid1, sign(unpaid1)));
  assert.equal(duplicate.status, 200);
  const duplicateBody = (await duplicate.json()) as { duplicate: boolean };
  assert.equal(duplicateBody.duplicate, true);
  assert.equal(mailCount(), 1);

  const paid = eventBody("evt_paid_1", "invoice.paid", {
    customer: "cus_cycle",
    lines: { data: [{ period: { end: P1 } }] },
  });
  assert.equal((await stripeWebhook(webhookRequest(paid, sign(paid)))).status, 200);
  assert.equal(mailCount(), 2);
  assert.match(subjects()[1], /wieder aktiv/);

  const unpaid2 = eventBody("evt_unpaid_2", "customer.subscription.updated", {
    ...SUBSCRIPTION,
    status: "unpaid",
    current_period_end: P2,
  });
  assert.equal((await stripeWebhook(webhookRequest(unpaid2, sign(unpaid2)))).status, 200);
  assert.equal(mailCount(), 3);
  assert.match(subjects()[2], /ausgelaufen/);

  const deleted = eventBody("evt_deleted_1", "customer.subscription.deleted", {
    id: "sub_cycle",
    customer: "cus_cycle",
  });
  assert.equal((await stripeWebhook(webhookRequest(deleted, sign(deleted)))).status, 200);
  assert.equal(mailCount(), 3, "der Abschluss im selben Zeitraum mailt nicht erneut");
});

/* -------------------------------- Ergebnis -------------------------------- */

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  process.exitCode = 1;
}
