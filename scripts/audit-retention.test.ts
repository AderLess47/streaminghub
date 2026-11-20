/**
 * Aufbewahrung des Sicherheitsprotokolls: Einträge älter als 90 Tage werden
 * gelöscht, der Löschvorgang selbst wird protokolliert.
 *
 * Aufruf: npm run test:audit-retention
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const { get, run } = await import("@/lib/db");
const { AUDIT_RETENTION_DAYS, purgeExpiredAuditLog } = await import("@/lib/audit");

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, body: () => Promise<void> | void) {
  try {
    await body();
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  \u2717 ${name}\n      ${detail.split("\n")[0]}`);
  }
}

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function seedAudit(action: string, createdAt: string) {
  const id = `audit-${Math.random().toString(36).slice(2, 10)}`;
  run(
    `INSERT INTO audit_log
       (id, actor_id, actor_email, action, target_type, target_id, ip, user_agent, meta, created_at)
     VALUES (?, NULL, NULL, ?, NULL, NULL, NULL, '', NULL, ?)`,
    id,
    action,
    createdAt,
  );
  return id;
}

function exists(id: string) {
  return Boolean(get(`SELECT 1 FROM audit_log WHERE id = ?`, id));
}

function purgeEvents() {
  return get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM audit_log WHERE action = 'audit.purged'`,
  )?.c ?? 0;
}

function latestPurge() {
  return get<{ meta: string | null }>(
    `SELECT meta FROM audit_log WHERE action = 'audit.purged' ORDER BY created_at DESC LIMIT 1`,
  );
}

await check("Aufbewahrungsfrist ist 90 Tage", async () => {
  assert.equal(AUDIT_RETENTION_DAYS, 90);
});

await check("Eintraege aelter als 90 Tage werden geloescht", async () => {
  run("DELETE FROM audit_log");
  const expired = seedAudit("test.expired", daysAgo(91));
  const recent = seedAudit("test.recent", daysAgo(89));

  assert.equal(purgeExpiredAuditLog(), 1);
  assert.equal(exists(expired), false);
  assert.equal(exists(recent), true);

  assert.equal(purgeEvents(), 1);
  assert.deepEqual(JSON.parse(latestPurge()?.meta ?? "{}").deleted, 1);
});

await check("Zweiter Lauf loescht nichts und protokolliert nicht erneut", async () => {
  assert.equal(purgeExpiredAuditLog(), 0);
  assert.equal(purgeEvents(), 1);
});

await check("Laengere Frist schuetzt aeltere Eintraege", async () => {
  run("DELETE FROM audit_log");
  const hundredDays = seedAudit("test.hundred", daysAgo(100));

  assert.equal(purgeExpiredAuditLog(120), 0);
  assert.equal(exists(hundredDays), true);
  assert.equal(purgeExpiredAuditLog(90), 1);
  assert.equal(exists(hundredDays), false);
});

await check("Taeglicher Container-Lauf loescht per Skript", async () => {
  run("DELETE FROM audit_log");
  const expired = seedAudit("test.script-expired", daysAgo(120));
  const recent = seedAudit("test.script-recent", daysAgo(10));

  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "scripts", "audit-retention.mjs")],
    { env: { ...process.env, DATABASE_PATH: process.env.DATABASE_PATH }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);

  const output = JSON.parse(result.stdout.trim().split("\n").pop() ?? "{}");
  assert.equal(output.deleted, 1);
  assert.equal(output.retentionDays, 90);
  assert.equal(exists(expired), false);
  assert.equal(exists(recent), true);
  assert.equal(purgeEvents(), 1);
  assert.deepEqual(JSON.parse(latestPurge()?.meta ?? "{}").deleted, 1);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
