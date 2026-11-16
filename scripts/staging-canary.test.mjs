import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");
const canaryScript = path.join(root, "scripts", "staging-canary.mjs");
const initScript = path.join(root, "scripts", "init-db.mjs");

function runCanary(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [canaryScript], { cwd: root, env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

function baseEnv() {
  return {
    ...process.env,
    STRIPE_SECRET_KEY: "sk_test_dummy",
    STRIPE_PRICE_ID: "price_dummy",
    STRIPE_WEBHOOK_SECRET: "whsec_dummy",
    CANARY_LOCAL_ASSERT: "1",
    STAGING_CANARY_EMAIL: "delivered+staging-canary@resend.dev",
  };
}

test("malformed canary recipients are rejected before registration", () => {
  for (const value of ["not-an-email", "canary@example.com", "canary@@resend.dev"]) {
    const result = spawnSync(process.execPath, [canaryScript], {
      cwd: root,
      env: { ...baseEnv(), STAGING_CANARY_EMAIL: value },
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, `expected rejection for ${value}`);
    assert.match(result.stderr, /STAGING_CANARY_EMAIL/);
  }
});

test("queued mail is rejected as a passing state", () => {
  const result = spawnSync(process.execPath, [canaryScript], {
    cwd: root,
    env: { ...baseEnv(), CANARY_EXPECT_MAIL: "queued" },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0, "queued mail must not pass the canary");
  assert.match(result.stderr, /CANARY_EXPECT_MAIL must be sent/);
});

test("missing Stripe webhook endpoint fails before registration", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json", connection: "close" });
    if (request.url?.startsWith("/v1/webhook_endpoints")) {
      response.end(JSON.stringify({ data: [], has_more: false }));
      return;
    }
    response.end(JSON.stringify({ error: { message: "unexpected request" } }));
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const result = await runCanary({
      ...baseEnv(),
      STAGING_BASE_URL: base,
      STRIPE_API_BASE: base,
    });

    assert.notEqual(result.status, 0, "a missing webhook endpoint must fail the canary");
    assert.match(result.stderr, /expected exactly one Stripe webhook endpoint/);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("successful canary verifies Stripe cancellation and cleans up", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "streaminghub-canary-success-"));
  const dbPath = path.join(dir, "canary.db");
  const seenEvents = new Set();
  let canaryEmail = "";
  let failCustomerCleanup = false;
  let providerCancel = false;
  let providerSubscriptionGets = 0;
  let server;

  try {
    execFileSync(process.execPath, [initScript], {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: dbPath },
      stdio: "ignore",
    });

    server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const url = request.url ?? "";
      const send = (status, payload) => {
        response.writeHead(status, { "content-type": "application/json", connection: "close" });
        response.end(JSON.stringify(payload));
      };
      const now = new Date().toISOString();

      if (request.method === "GET" && url.startsWith("/v1/webhook_endpoints")) {
        return send(200, {
          data: [
            {
              url: `http://${request.headers.host}/api/webhooks/stripe`,
              livemode: false,
              status: "enabled",
              enabled_events: [
                "checkout.session.completed",
                "customer.subscription.created",
                "customer.subscription.updated",
                "customer.subscription.deleted",
                "invoice.paid",
                "invoice.payment_failed",
              ],
            },
          ],
          has_more: false,
        });
      }
      if (request.method === "GET" && url === "/status") {
        return send(200, { ok: true });
      }
      if (request.method === "POST" && url === "/api/auth/register") {
        const parsed = JSON.parse(body || "{}");
        canaryEmail = parsed.email;
        const db = new DatabaseSync(dbPath);
        db.prepare(
          `INSERT INTO users (id, email, password_hash, display_name, locale, created_at, updated_at)
           VALUES ('canary-success-user', ?, 'x', 'Canary', 'de', ?, ?)`,
        ).run(parsed.email, now, now);
        db.close();
        return send(200, { ok: true, userId: "canary-success-user" });
      }
      if (request.method === "POST" && url === "/api/subscription/checkout") {
        return send(200, { ok: true, sessionId: "cs_test_canary" });
      }
      if (request.method === "GET" && url.startsWith("/v1/checkout/sessions/")) {
        return send(200, {
          livemode: false,
          mode: "subscription",
          currency: "eur",
          amount_total: 249,
          line_items: { data: [{ price: { id: "price_dummy", recurring: { interval: "month" } } }] },
        });
      }
      if (request.method === "POST" && url === "/v1/payment_methods") {
        return send(200, { id: "pm_canary" });
      }
      if (request.method === "POST" && url === "/v1/customers") {
        return send(200, { id: "cus_canary" });
      }
      if (request.method === "POST" && url === "/v1/subscriptions") {
        return send(200, {
          id: "sub_canary",
          status: "active",
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
        });
      }
      if (request.method === "GET" && url === "/v1/subscriptions/sub_canary") {
        providerSubscriptionGets += 1;
        return send(200, {
          id: "sub_canary",
          status: "active",
          cancel_at_period_end: providerCancel,
        });
      }
      if (request.method === "DELETE" && url === "/v1/subscriptions/sub_canary") {
        return send(200, { id: "sub_canary", status: "canceled" });
      }
      if (request.method === "DELETE" && url === "/v1/customers/cus_canary") {
        if (failCustomerCleanup) {
          return send(500, { error: { message: "customer cleanup failed" } });
        }
        return send(200, { id: "cus_canary", deleted: true });
      }
      if (request.method === "POST" && url === "/v1/checkout/sessions/cs_test_canary/expire") {
        return send(200, { id: "cs_test_canary", status: "expired" });
      }
      if (request.method === "POST" && url === "/api/webhooks/stripe") {
        const event = JSON.parse(body || "{}");
        const db = new DatabaseSync(dbPath);
        if (event.type === "checkout.session.completed") {
          const duplicate = seenEvents.has(event.id);
          if (!duplicate) {
            seenEvents.add(event.id);
            db.prepare(
              `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider,
                 provider_customer_id, provider_subscription_id, current_period_end,
                 cancel_at_period_end, updated_at, created_at)
               VALUES ('sub_canary', 'canary-success-user', 'premium', 'active', 'web', 'stripe',
                 'cus_canary', 'sub_canary', ?, 0, ?, ?)`,
            ).run(new Date(Date.now() + 30 * 86_400_000).toISOString(), now, now);
            db.prepare(
              `INSERT INTO outbox_emails (id, to_email, subject, body_text, kind, status, created_at)
               VALUES ('canary-success-mail', ?, 'Kauf bestätigt', 'Test', 'subscription', 'sent', ?)`,
            ).run(canaryEmail, now);
            db.prepare(
              `INSERT INTO subscription_events (id, user_id, provider, event_type, provider_event_id, payload, created_at)
               VALUES ('canary-success-marker', 'canary-success-user', 'stripe', 'mail.sent',
                 'mail:purchase-confirmation:sub_canary', '{}', ?)`,
            ).run(now);
          }
          db.close();
          return send(200, { received: true, handled: true, duplicate });
        }
        if (event.type === "customer.subscription.deleted") {
          db.prepare("UPDATE subscriptions SET status = 'canceled', updated_at = ? WHERE id = 'sub_canary'").run(now);
          db.close();
          return send(200, { received: true, handled: true });
        }
        db.close();
        return send(200, { received: true, handled: true });
      }
      if (request.method === "POST" && url === "/api/subscription/cancel") {
        providerCancel = true;
        const db = new DatabaseSync(dbPath);
        db.prepare("UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = ? WHERE id = 'sub_canary'").run(now);
        db.close();
        return send(200, { ok: true });
      }
      return send(404, { error: { code: "not_found" } });
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const result = await runCanary({
      ...baseEnv(),
      STAGING_BASE_URL: base,
      STRIPE_API_BASE: base,
      DATABASE_PATH: dbPath,
    });

    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Stripe reports cancel_at_period_end=true/);
    assert.equal(providerSubscriptionGets, 1, "the canary must query Stripe after cancellation");

    const db = new DatabaseSync(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM users").get().c, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM subscriptions").get().c, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM outbox_emails").get().c, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM subscription_events").get().c, 0);
    db.close();

    failCustomerCleanup = true;
    const cleanupFailure = await runCanary({
      ...baseEnv(),
      STAGING_BASE_URL: base,
      STRIPE_API_BASE: base,
      DATABASE_PATH: dbPath,
    });
    assert.notEqual(cleanupFailure.status, 0, "failed Stripe cleanup must fail the canary");
    assert.match(cleanupFailure.stderr, /cleanup failed \(customer\)/);

    const afterCleanupFailure = new DatabaseSync(dbPath);
    assert.equal(afterCleanupFailure.prepare("SELECT COUNT(*) AS c FROM users").get().c, 0);
    assert.equal(afterCleanupFailure.prepare("SELECT COUNT(*) AS c FROM subscriptions").get().c, 0);
    assert.equal(afterCleanupFailure.prepare("SELECT COUNT(*) AS c FROM outbox_emails").get().c, 0);
    assert.equal(afterCleanupFailure.prepare("SELECT COUNT(*) AS c FROM subscription_events").get().c, 0);
    afterCleanupFailure.close();
  } finally {
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

test("early checkout failure cleans up the synthetic user and rows", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "streaminghub-canary-early-"));
  const dbPath = path.join(dir, "canary.db");
  let server;
  let registerCalls = 0;

  try {
    execFileSync(process.execPath, [initScript], {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: dbPath },
      stdio: "ignore",
    });

    server = createServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += chunk;
      const send = (status, payload) => {
        response.writeHead(status, { "content-type": "application/json", connection: "close" });
        response.end(JSON.stringify(payload));
      };

      if (request.method === "GET" && request.url?.startsWith("/v1/webhook_endpoints")) {
        return send(200, {
          data: [
            {
              url: `http://${request.headers.host}/api/webhooks/stripe`,
              livemode: false,
              status: "enabled",
              enabled_events: [
                "checkout.session.completed",
                "customer.subscription.created",
                "customer.subscription.updated",
                "customer.subscription.deleted",
                "invoice.paid",
                "invoice.payment_failed",
              ],
            },
          ],
          has_more: false,
        });
      }
      if (request.method === "GET" && request.url === "/status") {
        return send(200, { ok: true });
      }
      if (request.method === "POST" && request.url === "/api/auth/register") {
        registerCalls += 1;
        const parsed = JSON.parse(body || "{}");
        const db = new DatabaseSync(dbPath);
        const now = new Date().toISOString();
        db.prepare(
          `INSERT INTO users (id, email, password_hash, display_name, locale, created_at, updated_at)
           VALUES ('canary-early-user', ?, 'x', 'Canary', 'de', ?, ?)`,
        ).run(parsed.email, now, now);
        db.prepare(
          `INSERT INTO outbox_emails (id, to_email, subject, body_text, kind, status, created_at)
           VALUES ('canary-early-mail', ?, 'Verify', 'Test', 'verify_email', 'queued', ?)`,
        ).run(parsed.email, now);
        db.close();
        return send(200, { ok: true, userId: "canary-early-user" });
      }
      if (request.method === "POST" && request.url === "/api/subscription/checkout") {
        return send(500, { error: { code: "provider_error" } });
      }
      return send(404, { error: { code: "not_found" } });
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();

    const result = await runCanary({
      ...baseEnv(),
      STAGING_BASE_URL: `http://127.0.0.1:${port}`,
      STRIPE_API_BASE: `http://127.0.0.1:${port}`,
      DATABASE_PATH: dbPath,
    });

    assert.notEqual(result.status, 0, "checkout failure must fail the canary");
    assert.equal(registerCalls, 1, "the canary must reach registration before checkout");
    const db = new DatabaseSync(dbPath);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM users").get().c, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS c FROM outbox_emails").get().c, 0);
    db.close();
  } finally {
    if (server) {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    }
    rmSync(dir, { recursive: true, force: true });
  }
});
