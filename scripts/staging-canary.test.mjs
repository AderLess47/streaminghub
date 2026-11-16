import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");
const canaryScript = path.join(root, "scripts", "staging-canary.mjs");
const initScript = path.join(root, "scripts", "init-db.mjs");

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

test("early checkout failure cleans up the synthetic user and rows", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "streaminghub-canary-early-"));
  const dbPath = path.join(dir, "canary.db");
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
      const send = (status, payload) => {
        response.writeHead(status, { "content-type": "application/json", connection: "close" });
        response.end(JSON.stringify(payload));
      };

      if (request.method === "GET" && request.url === "/status") {
        return send(200, { ok: true });
      }
      if (request.method === "POST" && request.url === "/api/auth/register") {
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

    const result = spawnSync(process.execPath, [canaryScript], {
      cwd: root,
      env: {
        ...baseEnv(),
        STAGING_BASE_URL: `http://127.0.0.1:${port}`,
        DATABASE_PATH: dbPath,
      },
      encoding: "utf8",
    });

    assert.notEqual(result.status, 0, "checkout failure must fail the canary");
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
