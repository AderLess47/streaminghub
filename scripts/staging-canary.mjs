#!/usr/bin/env node
/**
 * Staging billing canary.
 *
 * It creates a real Stripe test-mode Checkout Session through the app, verifies
 * the session configuration, creates a test subscription with a test payment
 * method, sends the signed `checkout.session.completed` event, and checks the
 * staging database/outbox through `staging-canary-assert.mjs` over Fly SSH.
 *
 * Why not Playwright for hosted Checkout? Stripe's own automated-testing and
 * Checkout documentation state that hosted Checkout and Payment Element have
 * security measures that prevent automated testing. The reliable contract is
 * therefore the provider/API/webhook path below; a human still checks the
 * hosted card form before a release.
 *
 * Required environment:
 *   STAGING_BASE_URL        https://streaminghub-staging.fly.dev
 *   STRIPE_SECRET_KEY       sk_test_...
 *   STRIPE_PRICE_ID         test price, 2.49 EUR / month
 *   STRIPE_WEBHOOK_SECRET   test webhook signing secret
 *   FLY_API_TOKEN           app-scoped token for the staging app
 *   CANARY_EXPECT_COMMIT    commit deployed to staging (or GITHUB_SHA)
 *
 * Optional:
 *   STAGING_APP             default streaminghub-staging
 *   STAGING_CANARY_EMAIL    default delivered+staging-canary@resend.dev
 *   CANARY_EXPECT_MAIL      default sent
 *   CANARY_TIMEOUT_MS       default 90000
 *   CANARY_LOCAL_ASSERT=1   run the assert helper locally (for development)
 *   FLYCTL_BIN              default flyctl
 */
import { execFileSync } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.STAGING_BASE_URL ?? "https://streaminghub-staging.fly.dev").replace(/\/+$/, "");
const STRIPE_API_BASE = (process.env.STRIPE_API_BASE ?? "https://api.stripe.com").replace(/\/+$/, "");
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const PRICE_ID = process.env.STRIPE_PRICE_ID ?? "";
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";
const FLY_APP = process.env.STAGING_APP ?? "streaminghub-staging";
const EXPECT_MAIL = process.env.CANARY_EXPECT_MAIL ?? "sent";
const EXPECTED_ENV = process.env.CANARY_EXPECT_ENV ?? "staging";
const EXPECTED_COMMIT = process.env.CANARY_EXPECT_COMMIT ?? process.env.GITHUB_SHA ?? "";
const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
];
const TIMEOUT_MS = Number(process.env.CANARY_TIMEOUT_MS ?? 90_000);
const runId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const CANARY_MARKER = "staging-billing-canary";
const TEST_CARD_TOKEN = "tok_visa";
const RAW_CANARY_EMAIL =
  process.env.STAGING_CANARY_EMAIL ?? "delivered+staging-canary@resend.dev";
let email = "";
let cleanupNeeded = false;
const password = `Canary-${randomBytes(18).toString("base64url")}!`;

let checks = 0;
let failures = 0;
let cleanupRuns = 0;

function ok(condition, label, detail = "") {
  checks += 1;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${label}${detail ? ` – ${detail}` : ""}`);
  }
}

function fail(message) {
  throw new Error(message);
}

/**
 * The canary may only use a well-formed @resend.dev recipient. A malformed
 * value must fail before registration or any shell command is built from it.
 */
function buildCanaryEmail() {
  const value = RAW_CANARY_EMAIL.trim();
  const parts = value.split("@");
  if (parts.length !== 2) {
    fail("STAGING_CANARY_EMAIL must contain exactly one @");
  }
  const [localPart, domain] = parts;
  if (domain.toLowerCase() !== "resend.dev") {
    fail("STAGING_CANARY_EMAIL must use the @resend.dev test domain");
  }
  if (!localPart || !/^[A-Za-z0-9._+-]+$/.test(localPart)) {
    fail("STAGING_CANARY_EMAIL has an invalid local part");
  }
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) {
    fail("STAGING_CANARY_EMAIL has an invalid local part");
  }
  const generated = `${localPart}+${runId}@resend.dev`;
  if (generated.length > 254) fail("STAGING_CANARY_EMAIL is too long");
  return generated;
}

function assertConfiguration() {
  let host;
  try {
    host = new URL(BASE).hostname;
  } catch {
    fail("STAGING_BASE_URL is not a valid URL");
  }
  if (host === "streaminghub.org" || host.endsWith(".streaminghub.org")) {
    fail("refusing to run against the production hostname");
  }
  if (!STRIPE_KEY || !PRICE_ID || !WEBHOOK_SECRET) {
    fail("STRIPE_SECRET_KEY, STRIPE_PRICE_ID and STRIPE_WEBHOOK_SECRET are required");
  }
  if (!STRIPE_KEY.startsWith("sk_test_")) {
    fail("STRIPE_SECRET_KEY must be a test-mode key (sk_test_...)");
  }
  email = buildCanaryEmail();
  if (!EXPECTED_COMMIT) {
    fail("CANARY_EXPECT_COMMIT or GITHUB_SHA is required to verify the deployed commit");
  }
  if (EXPECT_MAIL !== "sent") {
    fail("CANARY_EXPECT_MAIL must be sent; queued is not a passing state");
  }
  if (!process.env.FLY_API_TOKEN && process.env.CANARY_LOCAL_ASSERT !== "1") {
    fail("FLY_API_TOKEN is required for the staging database assertion");
  }
}

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

function cookieHeader() {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  timer.unref?.();
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseDeployment(html) {
  const environment = /data-deployment-environment="([^"]*)"/.exec(html)?.[1];
  const commit = /data-deployment-commit="([^"]*)"/.exec(html)?.[1];
  return { environment, commit };
}

async function request(method, route, body, cookieOverride) {
  const headers = { origin: BASE };
  if (body !== undefined) headers["content-type"] = "application/json";
  const cookie = cookieOverride === false ? "" : (cookieOverride ?? cookieHeader());
  if (cookie) headers.cookie = cookie;
  const response = await fetchWithTimeout(
    `${BASE}${route}`,
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    },
    15_000,
  );
  storeCookies(response);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML response */
  }
  return { status: response.status, text, json };
}

async function stripeRequest(method, route, form, { idempotencyKey } = {}) {
  const body = form === undefined ? undefined : new URLSearchParams(form).toString();
  const response = await fetchWithTimeout(
    `${STRIPE_API_BASE}${route}`,
    {
      method,
      headers: {
        authorization: `Bearer ${STRIPE_KEY}`,
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body,
    },
    20_000,
  );
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message ?? "request failed";
    throw new Error(`Stripe ${response.status} on ${route}: ${message}`);
  }
  return payload;
}

function signWebhook(body) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac("sha256", WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

async function assertStripeWebhookEndpoint() {
  const expectedUrl = `${BASE}/api/webhooks/stripe`;
  const result = await stripeRequest("GET", "/v1/webhook_endpoints?limit=100");
  if (result.has_more) {
    fail("too many Stripe webhook endpoints to verify safely");
  }
  const endpoints = Array.isArray(result.data) ? result.data : [];
  const matching = endpoints.filter((endpoint) => endpoint.url === expectedUrl);
  if (matching.length !== 1) {
    fail(`expected exactly one Stripe webhook endpoint for ${expectedUrl}, found ${matching.length}`);
  }
  const endpoint = matching[0];
  if (endpoint.livemode !== false) {
    fail("the Stripe webhook endpoint is not a test-mode endpoint");
  }
  if (endpoint.status !== "enabled") {
    fail(`the Stripe webhook endpoint is not enabled (${endpoint.status})`);
  }
  const enabledEvents = Array.isArray(endpoint.enabled_events) ? endpoint.enabled_events : [];
  const missing = REQUIRED_WEBHOOK_EVENTS.filter(
    (event) => !enabledEvents.includes(event) && !enabledEvents.includes("*"),
  );
  if (missing.length > 0) {
    fail(`the Stripe webhook endpoint is missing events: ${missing.join(", ")}`);
  }
  console.log(`  ✓ Stripe webhook endpoint is enabled for ${expectedUrl}`);
}

async function sendEvent(event) {
  const body = JSON.stringify(event);
  const response = await fetchWithTimeout(
    `${BASE}/api/webhooks/stripe`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "stripe-signature": signWebhook(body),
      },
      body,
    },
    15_000,
  );
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

function runAssert({ cleanup = false } = {}) {
  const args = [`--email=${email}`, ...(cleanup ? ["--cleanup"] : [])];
  let stdout;
  if (process.env.CANARY_LOCAL_ASSERT === "1") {
    if (!process.env.DATABASE_PATH) fail("DATABASE_PATH is required with CANARY_LOCAL_ASSERT=1");
    stdout = execFileSync(process.execPath, [path.join(ROOT, "scripts", "staging-canary-assert.mjs"), ...args], {
      cwd: ROOT,
      encoding: "utf8",
      env: process.env,
      timeout: 30_000,
    });
  } else {
    const flyctl = process.env.FLYCTL_BIN ?? "flyctl";
    stdout = execFileSync(
      flyctl,
      [
        "ssh",
        "console",
        "--app",
        FLY_APP,
        "--user",
        "nextjs",
        "-C",
        `node /app/scripts/staging-canary-assert.mjs ${args.join(" ")}`,
      ],
      { cwd: ROOT, encoding: "utf8", env: process.env, timeout: 30_000 },
    );
  }
  const line = stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .at(-1);
  if (!line) fail("staging assert returned no JSON");
  return JSON.parse(line);
}

async function waitFor(label, predicate) {
  const deadline = Date.now() + TIMEOUT_MS;
  let last = null;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      last = runAssert();
      if (predicate(last)) {
        ok(true, label);
        return last;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  ok(false, label, last ? JSON.stringify(last) : String(lastError?.message ?? "timeout"));
  throw new Error(`timeout waiting for: ${label}`);
}

async function cleanupStripeResource(label, operation) {
  try {
    await operation();
  } catch (error) {
    failures += 1;
    console.error(`  ! cleanup failed (${label}): ${error.message}`);
  }
}

async function main() {
  assertConfiguration();
  console.log(`Staging billing canary → ${BASE}`);
  await assertStripeWebhookEndpoint();

  let customerId = null;
  let paymentMethodId = null;
  let subscriptionId = null;
  let subscriptionDeleted = false;
  let sessionId = null;

  try {
    const health = await request("GET", "/status", undefined, false);
    ok(health.status === 200, `staging /status is reachable (${health.status})`);
    const deployment = parseDeployment(health.text);
    ok(
      deployment.environment === EXPECTED_ENV,
      `deployed environment is ${EXPECTED_ENV} (${deployment.environment})`,
    );
    ok(
      deployment.commit === EXPECTED_COMMIT,
      `deployed commit is ${EXPECTED_COMMIT} (${deployment.commit})`,
    );
    if (deployment.environment !== EXPECTED_ENV || deployment.commit !== EXPECTED_COMMIT) {
      fail("deployed environment or commit does not match the canary");
    }

    cleanupNeeded = true;
    const registration = await request(
      "POST",
      "/api/auth/register",
      {
        displayName: "Staging Canary",
        email,
        password,
        locale: "de",
        acceptTerms: true,
        marketingOptIn: false,
      },
      false,
    );
    const userId = registration.json?.userId;
    ok(
      registration.status === 200 && Boolean(userId),
      `staging canary account created (${registration.status})`,
      registration.text.slice(0, 160),
    );
    if (registration.status !== 200 || !userId) fail("could not create the staging canary account");

    const checkout = await request("POST", "/api/subscription/checkout", undefined);
    sessionId = checkout.json?.sessionId;
    ok(
      checkout.status === 200 && Boolean(sessionId),
      `checkout session created (${checkout.status})`,
      checkout.text.slice(0, 200),
    );
    if (checkout.status !== 200 || !sessionId) fail("could not create the checkout session");

    const sessionRoute = `/v1/checkout/sessions/${encodeURIComponent(sessionId)}?expand[]=line_items.data.price`;
    const session = await stripeRequest("GET", sessionRoute);
    const sessionPrice = session.line_items?.data?.[0]?.price;
    ok(session.livemode === false, "Stripe reports livemode=false");
    ok(session.status === "open", `checkout session is open (${session.status})`);
    ok(session.mode === "subscription", `checkout mode is subscription (${session.mode})`);
    ok(session.currency === "eur", `checkout currency is EUR (${session.currency})`);
    ok(session.amount_total === 249, `checkout amount is 249 cents (${session.amount_total})`);
    ok(sessionPrice?.id === PRICE_ID, `checkout uses configured price (${sessionPrice?.id})`);
    ok(sessionPrice?.livemode === false, "checkout price is test-mode");
    ok(sessionPrice?.active === true, "checkout price is active");
    ok(
      session.metadata?.userId === userId,
      "checkout metadata is bound to the canary user",
    );
    ok(
      session.client_reference_id === userId,
      "checkout client_reference_id is bound to the canary user",
    );
    ok(sessionPrice?.recurring?.interval === "month", `price interval is monthly (${sessionPrice?.recurring?.interval})`);
    if (
      session.livemode !== false ||
      session.status !== "open" ||
      session.metadata?.userId !== userId ||
      session.client_reference_id !== userId ||
      sessionPrice?.id !== PRICE_ID ||
      sessionPrice?.livemode !== false ||
      sessionPrice?.active !== true
    ) {
      fail("checkout session does not match the configured test price or canary user");
    }

    const paymentMethod = await stripeRequest(
      "POST",
      "/v1/payment_methods",
      {
        type: "card",
        "card[token]": TEST_CARD_TOKEN,
        "metadata[canary]": CANARY_MARKER,
        "metadata[canary_run_id]": runId,
      },
      { idempotencyKey: `canary-${runId}-payment-method` },
    );
    paymentMethodId = paymentMethod.id;
    ok(Boolean(paymentMethodId), `test payment method created (${paymentMethodId})`);
    if (!paymentMethodId) fail("could not create the test payment method");

    const customer = await stripeRequest(
      "POST",
      "/v1/customers",
      {
        email,
        "metadata[userId]": userId,
        "metadata[canary]": CANARY_MARKER,
        "metadata[canary_run_id]": runId,
        payment_method: paymentMethodId,
        "invoice_settings[default_payment_method]": paymentMethodId,
      },
      { idempotencyKey: `canary-${runId}-customer` },
    );
    customerId = customer.id;
    ok(
      customer.metadata?.canary === CANARY_MARKER,
      `customer returns canary metadata (${customer.metadata?.canary})`,
    );
    ok(
      customer.metadata?.canary_run_id === runId,
      `customer returns canary run id (${customer.metadata?.canary_run_id})`,
    );
    if (
      customer.metadata?.canary !== CANARY_MARKER ||
      customer.metadata?.canary_run_id !== runId
    ) {
      fail("customer metadata is missing the canary marker or run id");
    }

    const subscription = await stripeRequest(
      "POST",
      "/v1/subscriptions",
      {
        customer: customerId,
        "items[0][price]": PRICE_ID,
        "metadata[userId]": userId,
        "metadata[canary]": CANARY_MARKER,
        "metadata[canary_run_id]": runId,
        default_payment_method: paymentMethodId,
        payment_behavior: "error_if_incomplete",
        "expand[]": "latest_invoice",
      },
      { idempotencyKey: `canary-${runId}-subscription` },
    );
    subscriptionId = subscription.id;
    ok(subscription.status === "active", `test subscription is active (${subscription.status})`);
    if (subscription.status !== "active") fail("test subscription did not become active");
    ok(
      subscription.metadata?.canary === CANARY_MARKER,
      `subscription returns canary metadata (${subscription.metadata?.canary})`,
    );
    ok(
      subscription.metadata?.canary_run_id === runId,
      `subscription returns canary run id (${subscription.metadata?.canary_run_id})`,
    );
    if (
      subscription.metadata?.canary !== CANARY_MARKER ||
      subscription.metadata?.canary_run_id !== runId
    ) {
      fail("subscription metadata is missing the canary marker or run id");
    }

    const periodEnd =
      subscription.current_period_end ??
      subscription.items?.data?.[0]?.current_period_end ??
      Math.floor(Date.now() / 1000) + 30 * 86_400;

    const completedEvent = {
      id: `evt_canary_${runId}_completed`,
      type: "checkout.session.completed",
      data: {
        object: {
          id: sessionId,
          object: "checkout.session",
          payment_status: "paid",
          customer: customerId,
          subscription: subscriptionId,
          metadata: { userId },
          client_reference_id: userId,
        },
      },
    };
    const completed = await sendEvent(completedEvent);
    ok(
      completed.status === 200 && completed.json?.handled === true,
      `signed checkout webhook handled (${completed.status})`,
      JSON.stringify(completed.json ?? {}).slice(0, 160),
    );
    if (completed.status !== 200 || completed.json?.handled !== true) {
      fail("checkout webhook was not handled");
    }

    await waitFor(
      "active subscription, one purchase mail with expected status, and one marker",
      (state) =>
        state.subscriptionStatus === "active" &&
        state.mailCount === 1 &&
        state.mailStatuses.includes(EXPECT_MAIL) &&
        state.purchaseMarkerCount === 1,
    );

    const duplicate = await sendEvent(completedEvent);
    ok(duplicate.json?.duplicate === true, "duplicate webhook is idempotent");
    const afterDuplicate = runAssert();
    ok(afterDuplicate.mailCount === 1, "duplicate webhook does not create a second mail");

    const cancellation = await request("POST", "/api/subscription/cancel", {}, cookieHeader());
    ok(cancellation.status === 200, `cancellation accepted (${cancellation.status})`);
    await waitFor("cancel_at_period_end is stored", (state) => state.cancelAtPeriodEnd === true);

    const providerCancellation = await stripeRequest(
      "GET",
      `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    );
    ok(
      providerCancellation.cancel_at_period_end === true,
      `Stripe reports cancel_at_period_end=true (${providerCancellation.cancel_at_period_end})`,
    );
    if (providerCancellation.cancel_at_period_end !== true) {
      fail("Stripe subscription is not set to cancel at period end");
    }

    await stripeRequest("DELETE", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
    subscriptionDeleted = true;
    const deletedEvent = {
      id: `evt_canary_${runId}_deleted`,
      type: "customer.subscription.deleted",
      data: {
        object: {
          id: subscriptionId,
          object: "subscription",
          status: "canceled",
          customer: customerId,
          current_period_end: periodEnd,
          metadata: { userId },
        },
      },
    };
    const deleted = await sendEvent(deletedEvent);
    ok(
      deleted.status === 200 && deleted.json?.handled === true,
      `signed deletion webhook handled (${deleted.status})`,
      JSON.stringify(deleted.json ?? {}).slice(0, 160),
    );
    await waitFor("subscription ends as canceled", (state) => state.subscriptionStatus === "canceled");
  } finally {
    if (cleanupNeeded) {
      if (subscriptionId && !subscriptionDeleted) {
        await cleanupStripeResource("subscription", () =>
          stripeRequest("DELETE", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`),
        );
      }
      if (customerId) {
        await cleanupStripeResource("customer", () =>
          stripeRequest("DELETE", `/v1/customers/${encodeURIComponent(customerId)}`),
        );
      }
      if (sessionId) {
        await cleanupStripeResource("checkout session", () =>
          stripeRequest("POST", `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {}),
        );
      }
      cleanupRuns += 1;
      try {
        const cleanupResult = runAssert({ cleanup: true });
        if (cleanupResult.cleaned !== true) {
          failures += 1;
          console.error("  ! cleanup assertion did not report cleaned=true");
        }
      } catch (error) {
        failures += 1;
        console.error(`  ! cleanup assertion failed: ${error.message}`);
      }
    }
  }
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.error(`  ✗ canary failed: ${error.message}`);
} finally {
  const total = Math.max(checks, failures);
  console.log(`\n${Math.max(0, checks - failures)}/${total} checks passed (cleanup calls: ${cleanupRuns}).`);
  if (failures > 0) process.exitCode = 1;
}
