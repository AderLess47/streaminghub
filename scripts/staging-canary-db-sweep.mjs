#!/usr/bin/env node
/**
 * Safely removes old synthetic staging-canary database rows.
 *
 * Dry-run is the default. It only selects customer accounts whose email ends in
 * @resend.dev and whose user (or orphaned outbox) row is older than the minimum
 * age. Apply runs in one transaction and never targets a non-test email.
 *
 *   node scripts/staging-canary-db-sweep.mjs
 *   node scripts/staging-canary-db-sweep.mjs --apply
 *   CANARY_DB_SWEEP_APPLY=1 DATABASE_PATH=/app/data/streaminghub.db node scripts/staging-canary-db-sweep.mjs
 *
 * Optional:
 *   DATABASE_PATH             default data/streaminghub.db
 *   CANARY_DB_SWEEP_AGE_MS    default 24 hours; minimum 1 hour
 *   CANARY_DB_SWEEP_LIMIT     default 100; maximum 100
 *   CANARY_DB_SWEEP_APPLY=1   same as --apply
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply") || process.env.CANARY_DB_SWEEP_APPLY === "1";
const AGE_MS = Number(process.env.CANARY_DB_SWEEP_AGE_MS ?? 24 * 60 * 60 * 1000);
const LIMIT = Math.min(Math.max(Number(process.env.CANARY_DB_SWEEP_LIMIT ?? 100) || 100, 1), 100);
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");

function fail(message) {
  throw new Error(message);
}

function placeholders(count) {
  return Array(count).fill("?").join(", ");
}

function count(db, sql, params) {
  if (params.length === 0) return 0;
  return Number(db.prepare(sql).get(...params).c);
}

function deleteWhere(db, sql, params) {
  if (params.length === 0) return;
  db.prepare(sql).run(...params);
}

function isOld(createdAt, cutoffMs) {
  const timestamp = Date.parse(createdAt);
  return Number.isFinite(timestamp) && timestamp < cutoffMs;
}

function main() {
  if (!Number.isFinite(AGE_MS) || AGE_MS < 60 * 60 * 1000) {
    fail("CANARY_DB_SWEEP_AGE_MS must be at least one hour");
  }
  if (!fs.existsSync(dbPath)) fail(`database not found at ${dbPath}`);

  const cutoffMs = Date.now() - AGE_MS;
  const cutoff = new Date(cutoffMs).toISOString();
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA busy_timeout = 10000;");

  try {
    const candidates = db
      .prepare(
        `SELECT id, email, created_at
         FROM users
         WHERE LOWER(email) LIKE '%@resend.dev' AND role = 'customer'
         ORDER BY created_at`,
      )
      .all()
      .filter((user) => isOld(user.created_at, cutoffMs))
      .slice(0, LIMIT);
    const outboxCandidates = db
      .prepare(
        `SELECT id, to_email, created_at
         FROM outbox_emails
         WHERE LOWER(to_email) LIKE '%@resend.dev'
         ORDER BY created_at`,
      )
      .all()
      .filter((row) => isOld(row.created_at, cutoffMs))
      .slice(0, LIMIT);

    const userIds = candidates.map((user) => user.id);
    const emails = [
      ...new Set([
        ...candidates.map((user) => user.email.toLowerCase()),
        ...outboxCandidates.map((row) => row.to_email.toLowerCase()),
      ]),
    ];
    const emailPlaceholders = placeholders(emails.length);
    const userPlaceholders = placeholders(userIds.length);

    const counts = {
      users: userIds.length,
      outboxEmails: emails.length
        ? count(db, `SELECT COUNT(*) AS c FROM outbox_emails WHERE LOWER(to_email) IN (${emailPlaceholders})`, emails)
        : 0,
      subscriptions: userIds.length
        ? count(db, `SELECT COUNT(*) AS c FROM subscriptions WHERE user_id IN (${userPlaceholders})`, userIds)
        : 0,
      subscriptionEvents: userIds.length
        ? count(db, `SELECT COUNT(*) AS c FROM subscription_events WHERE user_id IN (${userPlaceholders})`, userIds)
        : 0,
      supportTickets: emails.length
        ? count(db, `SELECT COUNT(*) AS c FROM support_tickets WHERE LOWER(email) IN (${emailPlaceholders})`, emails)
        : 0,
      contractRequests: emails.length
        ? count(db, `SELECT COUNT(*) AS c FROM contract_requests WHERE LOWER(email) IN (${emailPlaceholders})`, emails)
        : 0,
      contactMessages: emails.length
        ? count(db, `SELECT COUNT(*) AS c FROM contact_messages WHERE LOWER(email) IN (${emailPlaceholders})`, emails)
        : 0,
      emailSuppressions: emails.length
        ? count(db, `SELECT COUNT(*) AS c FROM email_suppressions WHERE LOWER(email) IN (${emailPlaceholders})`, emails)
        : 0,
    };

    const auditClauses = [];
    const auditParams = [];
    if (emails.length) {
      auditClauses.push(`LOWER(actor_email) IN (${emailPlaceholders})`);
      auditParams.push(...emails);
    }
    if (userIds.length) {
      auditClauses.push(`target_id IN (${userPlaceholders})`);
      auditParams.push(...userIds);
    }
    const auditWhere = auditClauses.length ? auditClauses.join(" OR ") : "0";
    counts.auditLog = count(db, `SELECT COUNT(*) AS c FROM audit_log WHERE ${auditWhere}`, auditParams);

    const plan = {
      ok: true,
      dryRun: !APPLY,
      cutoff,
      users: candidates.map((user) => ({ id: user.id, email: user.email, created_at: user.created_at })),
      outboxRows: outboxCandidates.map((row) => ({ id: row.id, to_email: row.to_email, created_at: row.created_at })),
      counts,
    };

    if (!APPLY) {
      console.log(JSON.stringify(plan));
      return;
    }

    db.exec("BEGIN IMMEDIATE");
    try {
      deleteWhere(db, `DELETE FROM support_tickets WHERE LOWER(email) IN (${emailPlaceholders})`, emails);
      deleteWhere(db, `DELETE FROM contract_requests WHERE LOWER(email) IN (${emailPlaceholders})`, emails);
      deleteWhere(db, `DELETE FROM contact_messages WHERE LOWER(email) IN (${emailPlaceholders})`, emails);
      deleteWhere(db, `DELETE FROM email_suppressions WHERE LOWER(email) IN (${emailPlaceholders})`, emails);
      deleteWhere(db, `DELETE FROM outbox_emails WHERE LOWER(to_email) IN (${emailPlaceholders})`, emails);
      deleteWhere(db, `DELETE FROM subscription_events WHERE user_id IN (${userPlaceholders})`, userIds);
      deleteWhere(db, `DELETE FROM audit_log WHERE ${auditWhere}`, auditParams);
      deleteWhere(db, `DELETE FROM users WHERE id IN (${userPlaceholders})`, userIds);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }

    console.log(JSON.stringify({ ...plan, dryRun: false, deleted: counts }));
  } finally {
    db.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`[staging-canary-db-sweep] ${error.message}`);
    process.exitCode = 1;
  }
}
