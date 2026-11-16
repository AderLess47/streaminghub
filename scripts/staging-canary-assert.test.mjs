import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");
const assertScript = path.join(root, "scripts", "staging-canary-assert.mjs");
const initScript = path.join(root, "scripts", "init-db.mjs");

function runAssert(dbPath, email, cleanup = false) {
  return spawnSync(
    process.execPath,
    [assertScript, `--email=${email}`, ...(cleanup ? ["--cleanup"] : [])],
    {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: dbPath },
      encoding: "utf8",
    },
  );
}

test("canary assertion reports one sent mail and cleanup removes the synthetic user", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "streaminghub-canary-assert-"));
  const dbPath = path.join(dir, "canary.db");
  const email = "canary+assert-test@resend.dev";

  try {
    execFileSync(process.execPath, [initScript], {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: dbPath },
      stdio: "ignore",
    });

    const db = new DatabaseSync(dbPath);
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO users (id, email, password_hash, display_name, locale, created_at, updated_at)
       VALUES ('canary-user', ?, 'x', 'Canary', 'de', ?, ?)`,
    ).run(email, now, now);
    db.prepare(
      `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider,
         provider_customer_id, provider_subscription_id, current_period_end,
         cancel_at_period_end, updated_at, created_at)
       VALUES ('canary-sub', 'canary-user', 'premium', 'active', 'web', 'stripe',
         'cus_canary', 'sub_canary', ?, 0, ?, ?)`,
    ).run(new Date(Date.now() + 30 * 86_400_000).toISOString(), now, now);
    db.prepare(
      `INSERT INTO outbox_emails (id, to_email, subject, body_text, kind, status, created_at)
       VALUES ('canary-mail', ?, 'Willkommen', 'Test', 'subscription', 'sent', ?)`,
    ).run(email, now);
    db.prepare(
      `INSERT INTO subscription_events (id, user_id, provider, event_type, provider_event_id, payload, created_at)
       VALUES ('canary-marker', 'canary-user', 'stripe', 'mail.sent',
         'mail:purchase-confirmation:sub_canary', '{}', ?)`,
    ).run(now);
    db.close();

    const check = runAssert(dbPath, email);
    assert.equal(check.status, 0, check.stderr);
    const result = JSON.parse(check.stdout.trim());
    assert.equal(result.subscriptionStatus, "active");
    assert.equal(result.mailCount, 1);
    assert.deepEqual(result.mailStatuses, ["sent"]);
    assert.equal(result.purchaseMarkerCount, 1);
    assert.equal(result.cancelAtPeriodEnd, false);

    const cleaned = runAssert(dbPath, email, true);
    assert.equal(cleaned.status, 0, cleaned.stderr);
    assert.equal(JSON.parse(cleaned.stdout.trim()).cleaned, true);

    const verify = new DatabaseSync(dbPath);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM users WHERE email = ?").get(email).c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM outbox_emails WHERE to_email = ?").get(email).c, 0);
    verify.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("cleanup refuses a non-test recipient without deleting it", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "streaminghub-canary-guard-"));
  const dbPath = path.join(dir, "canary.db");
  const email = "canary@example.com";

  try {
    execFileSync(process.execPath, [initScript], {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: dbPath },
      stdio: "ignore",
    });

    const result = runAssert(dbPath, email, true);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /restricted to @resend\.dev/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
