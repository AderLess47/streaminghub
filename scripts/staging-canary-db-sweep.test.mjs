import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(import.meta.dirname, "..");
const sweepScript = path.join(root, "scripts", "staging-canary-db-sweep.mjs");
const initScript = path.join(root, "scripts", "init-db.mjs");

function runSweep(dbPath, args = [], env = {}) {
  return spawnSync(process.execPath, [sweepScript, ...args], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_PATH: dbPath,
      CANARY_DB_SWEEP_APPLY: "0",
      ...env,
    },
    encoding: "utf8",
  });
}

function insertFixture(db, old, recent) {
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, created_at, updated_at)
     VALUES
       ('canary-old', 'canary+old@resend.dev', 'x', 'Old Canary', 'de', 'customer', ?, ?),
       ('canary-recent', 'canary+recent@resend.dev', 'x', 'Recent Canary', 'de', 'customer', ?, ?),
       ('real-old', 'real@example.com', 'x', 'Real User', 'de', 'customer', ?, ?)`,
  ).run(old, old, recent, recent, old, old);

  db.prepare(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider,
       provider_customer_id, provider_subscription_id, current_period_end,
       cancel_at_period_end, updated_at, created_at)
     VALUES
       ('sub-old', 'canary-old', 'premium', 'active', 'web', 'stripe', 'cus_old', 'sub_old', ?, 0, ?, ?),
       ('sub-recent', 'canary-recent', 'premium', 'active', 'web', 'stripe', 'cus_recent', 'sub_recent', ?, 0, ?, ?)`,
  ).run(recent, old, old, recent, recent, recent);

  db.prepare(
    `INSERT INTO outbox_emails (id, to_email, subject, body_text, kind, status, created_at)
     VALUES
       ('mail-old', 'canary+old@resend.dev', 'Old', 'Test', 'subscription', 'sent', ?),
       ('mail-recent', 'canary+recent@resend.dev', 'Recent', 'Test', 'subscription', 'sent', ?),
       ('mail-orphan-old', 'orphan@resend.dev', 'Orphan', 'Test', 'subscription', 'sent', ?),
       ('mail-orphan-recent', 'orphan-recent@resend.dev', 'Recent orphan', 'Test', 'subscription', 'sent', ?),
       ('mail-real', 'real@example.com', 'Real', 'Test', 'subscription', 'sent', ?)`,
  ).run(old, recent, old, recent, old);

  db.prepare(
    `INSERT INTO subscription_events (id, user_id, provider, event_type, provider_event_id, payload, created_at)
     VALUES
       ('event-old', 'canary-old', 'stripe', 'invoice.paid', 'evt_old', '{}', ?),
       ('event-recent', 'canary-recent', 'stripe', 'invoice.paid', 'evt_recent', '{}', ?)`,
  ).run(old, recent);

  db.prepare(
    `INSERT INTO audit_log (id, actor_email, target_id, action, created_at)
     VALUES
       ('audit-old', 'canary+old@resend.dev', 'canary-old', 'canary.cleanup', ?),
       ('audit-recent', 'canary+recent@resend.dev', 'canary-recent', 'canary.cleanup', ?),
       ('audit-real', 'real@example.com', 'real-old', 'account.login', ?)`,
  ).run(old, recent, old);

  db.prepare(
    `INSERT INTO support_tickets (id, user_id, email, subject, category, status, priority, created_at, updated_at)
     VALUES ('ticket-old', 'canary-old', 'canary+old@resend.dev', 'Old ticket', 'other', 'open', 'normal', ?, ?)`,
  ).run(old, old);
  db.prepare(
    `INSERT INTO ticket_messages (id, ticket_id, author_type, author_name, body, created_at)
     VALUES ('ticket-old-message', 'ticket-old', 'customer', 'Canary', 'Test', ?)`,
  ).run(old);

  db.prepare(
    `INSERT INTO contract_requests (id, reference, kind, email, name, contract, status, created_at)
     VALUES ('contract-old', 'ref-old', 'cancellation', 'canary+old@resend.dev', 'Canary', 'premium', 'received', ?)`,
  ).run(old);
  db.prepare(
    `INSERT INTO contact_messages (id, name, email, subject, message, status, created_at)
     VALUES ('contact-old', 'Canary', 'canary+old@resend.dev', 'Old contact', 'Test', 'new', ?)`,
  ).run(old);
  db.prepare(
    `INSERT INTO email_suppressions (email, reason, created_at)
     VALUES ('canary+old@resend.dev', 'manual', ?)`,
  ).run(old);
}

test("database sweeper reports old resend.dev rows without deleting on dry run", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "streaminghub-db-sweep-dry-"));
  const dbPath = path.join(dir, "canary.db");
  const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const recent = new Date().toISOString();

  try {
    execFileSync(process.execPath, [initScript], {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: dbPath },
      stdio: "ignore",
    });
    const db = new DatabaseSync(dbPath);
    insertFixture(db, old, recent);
    db.close();

    const result = runSweep(dbPath);
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout.trim());
    assert.equal(plan.dryRun, true);
    assert.deepEqual(plan.users.map((user) => user.id), ["canary-old"]);
    assert.deepEqual(plan.outboxRows.map((row) => row.id).sort(), ["mail-old", "mail-orphan-old"]);
    assert.equal(plan.counts.users, 1);
    assert.equal(plan.counts.subscriptions, 1);
    assert.equal(plan.counts.subscriptionEvents, 1);

    const verify = new DatabaseSync(dbPath);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM users").get().c, 3);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM outbox_emails").get().c, 5);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM support_tickets").get().c, 1);
    verify.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("database sweeper apply removes only old resend.dev canary rows", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "streaminghub-db-sweep-apply-"));
  const dbPath = path.join(dir, "canary.db");
  const old = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const recent = new Date().toISOString();

  try {
    execFileSync(process.execPath, [initScript], {
      cwd: root,
      env: { ...process.env, DATABASE_PATH: dbPath },
      stdio: "ignore",
    });
    const db = new DatabaseSync(dbPath);
    insertFixture(db, old, recent);
    db.close();

    const result = runSweep(dbPath, ["--apply"]);
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output.dryRun, false);
    assert.equal(output.deleted.users, 1);

    const verify = new DatabaseSync(dbPath);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM users WHERE id = 'canary-old'").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM users WHERE id = 'canary-recent'").get().c, 1);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM users WHERE id = 'real-old'").get().c, 1);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM subscriptions WHERE id = 'sub-old'").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM subscriptions WHERE id = 'sub-recent'").get().c, 1);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM outbox_emails WHERE id = 'mail-old'").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM outbox_emails WHERE id = 'mail-orphan-old'").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM outbox_emails WHERE id = 'mail-recent'").get().c, 1);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM outbox_emails WHERE id = 'mail-orphan-recent'").get().c, 1);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM outbox_emails WHERE id = 'mail-real'").get().c, 1);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM subscription_events WHERE id = 'event-old'").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM subscription_events WHERE id = 'event-recent'").get().c, 1);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE id = 'audit-old'").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE id = 'audit-recent'").get().c, 1);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM audit_log WHERE id = 'audit-real'").get().c, 1);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM support_tickets").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM ticket_messages").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM contract_requests").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM contact_messages").get().c, 0);
    assert.equal(verify.prepare("SELECT COUNT(*) AS c FROM email_suppressions").get().c, 0);
    verify.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("database sweeper refuses an age below one hour", () => {
  const result = spawnSync(process.execPath, [sweepScript], {
    cwd: root,
    env: {
      ...process.env,
      DATABASE_PATH: path.join(tmpdir(), "does-not-matter.db"),
      CANARY_DB_SWEEP_AGE_MS: "60000",
    },
    encoding: "utf8",
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /at least one hour/);
});
