#!/usr/bin/env node
/**
 * Reads the staging database after a billing-canary webhook and prints a JSON
 * summary without customer PII. It runs inside the staging container, where the
 * database file is local.
 *
 *   node /app/scripts/staging-canary-assert.mjs --email=canary+...@resend.dev
 *   node /app/scripts/staging-canary-assert.mjs --email=... --cleanup
 *
 * Cleanup is allowed only for @resend.dev test recipients. It removes the
 * synthetic user, subscription, outbox rows, event rows and canary audit rows.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

function fail(message) {
  console.error(`[staging-canary-assert] ${message}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const emailArg = args.find((arg) => arg.startsWith("--email="));
const email = emailArg?.slice("--email=".length) ?? "";
const cleanup = args.includes("--cleanup");

if (!email) fail("--email=<address> is required");
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("invalid email address");
if (cleanup && !/@resend\.dev$/i.test(email)) {
  fail("cleanup is restricted to @resend.dev test recipients");
}

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");
if (!fs.existsSync(dbPath)) fail(`database not found at ${dbPath}`);

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 10000;");

try {
  const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (!user) {
    if (cleanup) {
      // A failed canary may not have created the account. Remove any orphaned
      // outbox row and report a successful no-op cleanup.
      db.prepare("DELETE FROM outbox_emails WHERE to_email = ?").run(email);
      console.log(JSON.stringify({ ok: true, userFound: false, cleaned: true }));
      process.exit(0);
    }
    fail("canary user not found");
  }

  const subscription = db
    .prepare(
      `SELECT status, provider, provider_subscription_id, current_period_end, cancel_at_period_end
       FROM subscriptions WHERE user_id = ?`,
    )
    .get(user.id);

  const mails = db
    .prepare(
      `SELECT status FROM outbox_emails
       WHERE kind = 'subscription' AND to_email = ?
       ORDER BY created_at`,
    )
    .all(email);

  const markers = db
    .prepare(
      `SELECT provider_event_id FROM subscription_events
       WHERE user_id = ? AND event_type = 'mail.sent'
         AND provider_event_id LIKE 'mail:purchase-confirmation:%'`,
    )
    .all(user.id);

  const eventTypes = db
    .prepare(
      `SELECT event_type, COUNT(*) AS count FROM subscription_events
       WHERE user_id = ? GROUP BY event_type ORDER BY event_type`,
    )
    .all(user.id);

  const result = {
    ok: true,
    userFound: true,
    subscriptionStatus: subscription?.status ?? null,
    provider: subscription?.provider ?? null,
    hasProviderSubscriptionId: Boolean(subscription?.provider_subscription_id),
    currentPeriodEnd: subscription?.current_period_end ?? null,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    mailCount: mails.length,
    mailStatuses: mails.map((mail) => mail.status),
    purchaseMarkerCount: markers.length,
    eventTypes: Object.fromEntries(eventTypes.map((row) => [row.event_type, row.count])),
  };

  if (cleanup) {
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("DELETE FROM outbox_emails WHERE to_email = ?").run(email);
      db.prepare("DELETE FROM subscription_events WHERE user_id = ?").run(user.id);
      db.prepare("DELETE FROM audit_log WHERE actor_email = ? OR target_id = ?").run(email, user.id);
      db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
      db.exec("COMMIT");
      result.cleaned = true;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  console.log(JSON.stringify(result));
} finally {
  db.close();
}
