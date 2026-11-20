/**
 * Der Webhook ohne Billing-Konfiguration. Muss in einem eigenen Prozess laufen,
 * weil `env` die Stripe-Variablen beim Import einmalig liest.
 *
 * Aufruf über `npm run test:stripe-webhook` (zweiter Prozess).
 */

import assert from "node:assert/strict";

process.env.STRIPE_SECRET_KEY = "";
process.env.STRIPE_PRICE_ID = "";
process.env.STRIPE_WEBHOOK_SECRET = "";
process.env.APP_URL = "https://streaminghub.org";
delete process.env.RESEND_API_KEY;

const { all } = await import("@/lib/db");
const { POST: stripeWebhook } = await import("@/app/api/webhooks/stripe/route");

const request = new Request("https://app.example/api/webhooks/stripe", {
  method: "POST",
  headers: { "content-type": "application/json", host: "app.example" },
  body: JSON.stringify({
    id: "evt_unconfigured",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_x", customer: "cus_x", status: "unpaid" } },
  }),
});

const response = await stripeWebhook(request);
const body = (await response.json()) as { error?: { code?: string } };
const events = all<{ c: number }>(`SELECT COUNT(*) AS c FROM subscription_events`)[0].c;

console.log(`  ${response.status === 503 ? "\u2713" : "\u2717"} ohne Billing-Konfiguration 503`);
assert.equal(response.status, 503);
assert.equal(body.error?.code, "not_configured");
assert.equal(events, 0, "ohne Konfiguration darf kein Event gespeichert werden");
console.log("\n1/1 Prüfungen bestanden.");
