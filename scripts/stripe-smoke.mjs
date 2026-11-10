#!/usr/bin/env node
/**
 * Full billing-flow test against a local Stripe API stub (no real charges).
 *
 *   STRIPE_SECRET_KEY=sk_test_stub STRIPE_PRICE_ID=price_stub \
 *   STRIPE_WEBHOOK_SECRET=whsec_stub_secret \
 *   STRIPE_API_BASE=http://127.0.0.1:4026 npm run dev
 *
 *   npm run stripe:smoke
 *
 * Covers: checkout session creation, server-side success confirmation,
 * signed webhooks (completed / past_due / invoice paid / deleted),
 * cancellation at period end, idempotency and ownership checks.
 */
import http from "node:http";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const STUB_PORT = Number(process.env.STRIPE_STUB_PORT ?? 4026);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const runId = Date.now();
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");

let checks = 0;
let failures = 0;
const ok = (condition, label, detail = "") => {
  checks++;
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` – ${detail}` : ""}`);
  }
};

if (!WEBHOOK_SECRET) {
  console.error("STRIPE_WEBHOOK_SECRET is required (same value as the running server).");
  process.exit(1);
}

/* ---------------------------------- stub ---------------------------------- */

const sessions = new Map();
const subscriptions = new Map();
const calls = [];
let counter = 0;

const stub = http.createServer(async (request, response) => {
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${STUB_PORT}`);
  calls.push({ method: request.method, path: url.pathname, body: raw });

  const send = (status, payload) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(payload));
  };

  if (request.method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const form = new URLSearchParams(raw);
    const userId = form.get("metadata[userId]") ?? "unknown";
    counter++;
    const sessionId = `cs_test_${runId}_${counter}`;
    const subscriptionId = `sub_test_${runId}_${counter}`;
    const customerId = `cus_test_${runId}_${counter}`;
    const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
    const subscription = {
      id: subscriptionId,
      object: "subscription",
      status: "active",
      customer: customerId,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
      metadata: { userId },
    };
    subscriptions.set(subscriptionId, subscription);
    sessions.set(sessionId, {
      id: sessionId,
      object: "checkout.session",
      status: "complete",
      payment_status: "paid",
      mode: "subscription",
      customer: customerId,
      subscription,
      metadata: { userId },
      client_reference_id: userId,
      success_url: form.get("success_url"),
      amount_total: 249,
      currency: "eur",
    });
    return send(200, {
      id: sessionId,
      object: "checkout.session",
      status: "open",
      mode: "subscription",
      url: `http://127.0.0.1:${STUB_PORT}/pay/${sessionId}`,
    });
  }

  if (request.method === "GET" && url.pathname.startsWith("/v1/checkout/sessions/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const session = sessions.get(id);
    return session ? send(200, session) : send(404, { error: { message: "No such session" } });
  }

  if (url.pathname.startsWith("/v1/subscriptions/")) {
    const id = decodeURIComponent(url.pathname.split("/").pop() ?? "");
    const subscription = subscriptions.get(id);
    if (!subscription) return send(404, { error: { message: "No such subscription" } });
    if (request.method === "POST") {
      const form = new URLSearchParams(raw);
      if (form.get("cancel_at_period_end") === "true") subscription.cancel_at_period_end = true;
    }
    return send(200, subscription);
  }

  return send(404, { error: { message: "Unknown stub route" } });
});

await new Promise((resolve, reject) => {
  stub.once("error", reject);
  stub.listen(STUB_PORT, "127.0.0.1", resolve);
});
console.log(`Stripe billing test → ${BASE} (API stub on :${STUB_PORT})\n`);

/* --------------------------------- helpers -------------------------------- */

const db = new DatabaseSync(dbPath);
db.exec(
  "DELETE FROM rate_limits WHERE key LIKE 'checkout:%' OR key LIKE 'cancel:%' OR key LIKE 'confirm:%' OR key LIKE 'register:ip%'",
);

const cookies = new Map();
function storeCookies(response) {
  for (const raw of response.headers.getSetCookie?.() ?? []) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value) cookies.set(name, value);
    else cookies.delete(name);
  }
}

function currentCookie() {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function post(route, body, cookieOverride) {
  const headers = { origin: BASE };
  if (body !== undefined) headers["content-type"] = "application/json";
  const cookie =
    cookieOverride === false
      ? ""
      : typeof cookieOverride === "string"
        ? cookieOverride
        : currentCookie();
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  storeCookies(response);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: response.status, json, text };
}

function stripeSignature(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function sendEvent(event, signature) {
  const body = JSON.stringify(event);
  const response = await fetch(`${BASE}/api/webhooks/stripe`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature ?? stripeSignature(body),
    },
    body,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

function subscriptionRow(userId) {
  return db
    .prepare(
      "SELECT status, provider, provider_customer_id, provider_subscription_id, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ?",
    )
    .get(userId);
}

async function register(label) {
  const stamp = Date.now();
  const response = await post(
    "/api/auth/register",
    {
      displayName: `Stripe ${label}`,
      email: `stripe-${label}-${stamp}@example.com`,
      password: "StripeTest-2026!Ab",
      locale: "de",
      acceptTerms: true,
    },
    false,
  );
  return response;
}

/* ---------------------------------- flow ---------------------------------- */

console.log("Checkout session");
const userA = await register("a");
ok(userA.status === 200, `test customer created (${userA.status})`, userA.text.slice(0, 160));
const userAId = userA.json?.userId;
const cookieA = currentCookie();
const checkoutA = await post("/api/subscription/checkout");
ok(checkoutA.status === 200, `checkout created (${checkoutA.status})`, checkoutA.text.slice(0, 200));
ok(String(checkoutA.json?.url ?? "").startsWith(`http://127.0.0.1:${STUB_PORT}`), "provider URL returned");
ok(String(checkoutA.json?.sessionId ?? "").startsWith("cs_test_"), "session id returned");

const sessionCall = calls.find((call) => call.method === "POST" && call.path === "/v1/checkout/sessions");
const sessionForm = new URLSearchParams(sessionCall?.body ?? "");
ok(sessionForm.get("mode") === "subscription", "subscription mode requested");
ok(
  sessionForm.get("line_items[0][price]") === (process.env.STRIPE_PRICE_ID ?? "price_stub"),
  "configured price used",
);
ok(sessionForm.get("metadata[userId]") === userAId, "user id attached to the session");
ok(
  String(sessionForm.get("success_url")).includes("session_id={CHECKOUT_SESSION_ID}"),
  "success URL carries the session placeholder",
);
ok(subscriptionRow(userAId)?.status === "pending", "local state is pending before payment");
const sessionA = sessions.get(checkoutA.json?.sessionId);
const subA = sessionA?.subscription?.id;
const cusA = sessionA?.customer;
ok(Boolean(subA && cusA), "stub session is linked to provider objects");

console.log("\nSigned subscription webhooks");
const periodEnd = Math.floor(Date.now() / 1000) + 30 * 86_400;
const completed = await sendEvent({
  id: `evt_completed_${runId}`,
  type: "checkout.session.completed",
  data: {
    object: {
      id: checkoutA.json?.sessionId,
      object: "checkout.session",
      payment_status: "paid",
      customer: cusA,
      subscription: subA,
      metadata: { userId: userAId },
      client_reference_id: userAId,
    },
  },
});
ok(completed.status === 200 && completed.json?.handled === true, "checkout completion handled");
let row = subscriptionRow(userAId);
ok(row?.status === "active", `subscription active after confirmation (${row?.status})`);
ok(row?.provider_subscription_id === subA, "subscription id stored");
ok(row?.provider_customer_id === cusA, "customer id stored");
ok(Boolean(row?.current_period_end), "period end stored");

const pastDue = await sendEvent({
  id: `evt_past_due_${runId}`,
  type: "customer.subscription.updated",
  data: {
    object: {
      id: subA,
      status: "past_due",
      customer: cusA,
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    },
  },
});
ok(pastDue.status === 200, "past_due update accepted");
ok(subscriptionRow(userAId)?.status === "past_due", "provider status is mapped (past_due)");

const paid = await sendEvent({
  id: `evt_invoice_paid_${runId}`,
  type: "invoice.paid",
  data: {
    object: {
      id: `in_test_${runId}`,
      customer: cusA,
      lines: { data: [{ period: { end: periodEnd + 86_400 } }] },
    },
  },
});
ok(paid.status === 200, "invoice.paid accepted");
row = subscriptionRow(userAId);
ok(row?.status === "active", "paid invoice restores active status");

console.log("\nCancellation at period end");
const cancel = await post("/api/subscription/cancel");
ok(cancel.status === 200, `cancellation accepted (${cancel.status})`, cancel.text.slice(0, 160));
const cancelCall = calls.find(
  (call) => call.method === "POST" && call.path === `/v1/subscriptions/${subA}`,
);
ok(Boolean(cancelCall), "cancellation sent to the provider");
ok(new URLSearchParams(cancelCall?.body ?? "").get("cancel_at_period_end") === "true", "cancel_at_period_end requested");
row = subscriptionRow(userAId);
ok(row?.cancel_at_period_end === 1, "cancellation flag stored");
ok(row?.status === "active", "access remains until period end");

const deleted = await sendEvent({
  id: `evt_deleted_${runId}`,
  type: "customer.subscription.deleted",
  data: {
    object: {
      id: subA,
      status: "canceled",
      customer: cusA,
      current_period_end: periodEnd,
    },
  },
});
ok(deleted.status === 200, "subscription deletion accepted");
ok(subscriptionRow(userAId)?.status === "canceled", "subscription ends as canceled");

const duplicate = await sendEvent({
  id: `evt_deleted_${runId}`,
  type: "customer.subscription.deleted",    data: { object: { id: subA, status: "canceled", customer: cusA } },
});
ok(duplicate.status === 200 && duplicate.json?.duplicate === true, "duplicate event is idempotent");

const forged = await sendEvent(
  {
    id: `evt_forged_${runId}`,
    type: "invoice.paid",
    data: { object: { customer: cusA, lines: { data: [] } } },
  },
  "t=1,v1=deadbeef",
);
ok(forged.status === 400, `forged signature rejected (${forged.status})`);
ok(subscriptionRow(userAId)?.status === "canceled", "forged event does not change state");

console.log("\nServer-side success confirmation and ownership");
const userB = await register("b");
ok(userB.status === 200, "second test customer created");
const userBId = userB.json?.userId;
const checkoutB = await post("/api/subscription/checkout");
ok(checkoutB.status === 200, "second checkout created");
const confirmB = await post("/api/subscription/confirm", { sessionId: checkoutB.json?.sessionId });
ok(confirmB.status === 200 && confirmB.json?.status === "active", `session confirmed server-side (${confirmB.status})`);
ok(subscriptionRow(userBId)?.status === "active", "confirmation activates the subscription");

const foreign = await post(
  "/api/subscription/confirm",
  { sessionId: checkoutB.json?.sessionId },
  cookieA,
);
ok(foreign.status === 403, `foreign session rejected (${foreign.status})`);
ok(subscriptionRow(userBId)?.status === "active", "foreign attempt does not change state");

stub.close();
db.close();

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) process.exitCode = 1;
