#!/usr/bin/env node
/**
 * Validates the checkout integration against real Stripe **test mode**.
 *
 * It never charges a card and never completes a payment. It creates a real
 * test-mode Checkout Session through the app and verifies price, currency,
 * interval, mode and the success URL via the Stripe API. Completing the payment
 * is a manual browser step (4242 4242 4242 4242).
 *
 * Requirements:
 *   - STRIPE_SECRET_KEY=sk_test_... (live keys are refused unless
 *     ALLOW_LIVE_STRIPE=1)
 *   - the app running with the same key and STRIPE_PRICE_ID
 *   - STRIPE_WEBHOOK_SECRET optional; for webhook testing use the Stripe CLI
 *
 * Exit codes: 0 pass, 1 failure, 2 not configured.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const key = process.env.STRIPE_SECRET_KEY ?? "";
const apiBase = (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/$/, "");
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");

if (!key) {
  console.error("SKIPPED: STRIPE_SECRET_KEY is missing. Use a test-mode key (sk_test_...).");
  process.exit(2);
}
if (key.startsWith("sk_live_") && process.env.ALLOW_LIVE_STRIPE !== "1") {
  console.error("Refusing to run against a live Stripe key. Use sk_test_... or set ALLOW_LIVE_STRIPE=1.");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec("DELETE FROM rate_limits WHERE key LIKE 'checkout:%' OR key LIKE 'register:ip%'");

async function post(route, body, cookies) {
  const response = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers: {
      origin: BASE,
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookies ? { cookie: cookies } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: response.status, json, text, headers: response.headers };
}

const stamp = Date.now();
const email = `stripe-live-${stamp}@example.com`;
const register = await post("/api/auth/register", {
  displayName: "Stripe Live Test",
  email,
  password: "StripeTest-2026!Ab",
  locale: "de",
  acceptTerms: true,
});
if (register.status !== 200) {
  console.error(`Registration failed (${register.status}): ${register.text.slice(0, 200)}`);
  process.exit(1);
}
const cookie = (register.headers.getSetCookie?.() ?? [])
  .map((raw) => raw.split(";")[0])
  .join("; ");

const checkout = await post("/api/subscription/checkout", undefined, cookie);
if (checkout.status !== 200 || !checkout.json?.sessionId) {
  console.error(`Checkout failed (${checkout.status}): ${checkout.text.slice(0, 300)}`);
  process.exit(1);
}

const sessionResponse = await fetch(
  `${apiBase}/v1/checkout/sessions/${encodeURIComponent(checkout.json.sessionId)}?expand[]=line_items.data.price`,
  { headers: { authorization: `Bearer ${key}` } },
);
const session = await sessionResponse.json().catch(() => null);
if (!sessionResponse.ok) {
  console.error(`Stripe API ${sessionResponse.status}: ${JSON.stringify(session).slice(0, 300)}`);
  process.exit(1);
}

const price = session.line_items?.data?.[0]?.price;
const problems = [];
if (session.mode !== "subscription") problems.push(`mode=${session.mode}`);
if (session.currency !== "eur") problems.push(`currency=${session.currency}`);
if (price?.unit_amount !== 249) problems.push(`unit_amount=${price?.unit_amount}`);
if (price?.recurring?.interval !== "month") problems.push(`interval=${price?.recurring?.interval}`);
if (!String(session.success_url ?? "").includes("session_id=")) problems.push("success_url missing session id");

if (problems.length > 0) {
  console.error(`Checkout session is not configured as expected: ${problems.join(", ")}`);
  process.exit(1);
}

console.log("Stripe test-mode checkout is configured correctly:");
console.log(`  session: ${session.id}`);
console.log(`  price:   ${(price.unit_amount / 100).toFixed(2)} ${String(price.currency).toUpperCase()} / ${price.recurring.interval}`);
console.log(`  url:     ${session.url}`);
console.log(`
Complete the payment manually with test card 4242 4242 4242 4242, any future
expiry and any CVC. To receive webhooks locally:

  stripe listen --forward-to localhost:3000/api/webhooks/stripe

Then set STRIPE_WEBHOOK_SECRET to the printed whsec_... value and restart the app.
A failed payment can be tested with 4000 0000 0000 0341.
`);

db.close();
