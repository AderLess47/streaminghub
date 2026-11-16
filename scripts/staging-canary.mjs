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
const TIMEOUT_MS = Number(process.env.CANARY_TIMEOUT_MS ?? 90_000);
const runId = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const RAW_CANARY_EMAIL =
  process.env.STAGING_CANARY_EMAIL ?? "delivered+staging-canary@resend.dev";
let email = "";
let cleanupNeeded = false;
const password = `Canary-${randomBytes(18).toString("base64url")}!`;

let checks = 0;
let failures = 0;

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
  if (!EXPECT_MAIL || !["sent", "queued"].includes(EXPECT_MAIL)) {
    fail("CANARY_EXPECT_MAIL must be sent or queued");
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

async function stripeRequest(method, route, form) {
  const body = form === undefined ? undefined : new URLSearchParams(form).toString();
  const response = await fetchWithTimeout(
    `${STRIPE_API_BASE}${route}`,
    {
      method,
      headers: {
        authorization: `Bearer ${STRIPE_KEY}`,
        ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
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

async function main() {
  assertConfiguration();
  console.log(`Staging billing canary → ${BASE}`);

  const health = await request("GET", "/status", undefined, false);
  ok(health.status === 200, `staging /status is reachable (${health.status})`);

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
  const sessionId = checkout.json?.sessionId;
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
  ok(session.mode === "subscription", `checkout mode is subscription (${session.mode})`);
  ok(session.currency === "eur", `checkout currency is EUR (${session.currency})`);
  ok(session.amount_total === 249, `checkout amount is 249 cents (${session.amount_total})`);
  ok(sessionPrice?.recurring?.interval === "month", `price interval is monthly (${sessionPrice?.recurring?.interval})`);

  let customerId = null;
  let subscriptionId = null;
  let subscription = null;

  try {
    const paymentMethod = await stripeRequest("POST", "/v1/payment_methods", {
      type: "card",
      "card[token]": "tok_visa",
      "billing_details[name]": "Staging Canary",
      "billing_details[email]": email,
    });
    const customer = await stripeRequest("POST", "/v1/customers", {
      email,
      "metadata[userId]": userId,
      payment_method: paymentMethod.id,
      "invoice_settings[default_payment_method]": paymentMethod.id,
    });
    customerId = customer.id;

    subscription = await stripeRequest("POST", "/v1/subscriptions", {
      customer: customerId,
      "items[0][price]": PRICE_ID,
      default_payment_method: paymentMethod.id,
      payment_behavior: "error_if_incomplete",
      "expand[]": "latest_invoice",
    });
    subscriptionId = subscription.id;
    ok(subscription.status === "active", `test subscription is active (${subscription.status})`);
    if (subscription.status !== "active") fail("test subscription did not become active");

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

    await stripeRequest("DELETE", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
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
    if (subscriptionId) {
      try {
        await stripeRequest("DELETE", `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`);
      } catch {
        /* already canceled */
      }
    }
    if (customerId) {
      try {
        await stripeRequest("DELETE", `/v1/customers/${encodeURIComponent(customerId)}`);
      } catch {
        /* best-effort test-mode cleanup */
      }
    }
    try {
      await stripeRequest("POST", `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/expire`, {});
    } catch {
      /* already completed or expired */
    }
    try {
      runAssert({ cleanup: true });
    } catch (error) {
      failures += 1;
      console.error(`  ! cleanup failed: ${error.message}`);
    }
  }
}

try {
  await main();
} catch (error) {
  failures += 1;
  console.error(`  ✗ canary failed: ${error.message}`);
  if (cleanupNeeded) {
    try {
      runAssert({ cleanup: true });
    } catch (cleanupError) {
      console.error(`  ! early cleanup failed: ${cleanupError.message}`);
    }
  }
} finally {
  const total = Math.max(checks, failures);
  console.log(`\n${Math.max(0, checks - failures)}/${total} checks passed.`);
  if (failures > 0) process.exitCode = 1;
}
