import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Der einmalige Lauf für den Altbestand: Wer ohne Premium-Zugang mehr Geräte
 * hat als der kostenlose Tarif erlaubt, verliert die überzähligen – und zwar
 * ohne Mail. Zahlende Konten und laufende Trials bleiben unangetastet.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-cleanup-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
delete process.env.RESEND_API_KEY;

const { all, nowIso, run } = await import("./db.ts");
const { cleanupOverLimitDevices, countOverLimitAccounts, overLimitAccounts } = await import(
  "./device-cleanup.ts"
);

const NOW = Date.now();

function seedUser(
  id: string,
  opts: { status?: string; periodEnd?: string | null; trialEndsAt?: string | null } = {},
) {
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, created_at, updated_at)
     VALUES (?, ?, 'x', 'Testkonto', 'de', ?, ?)`,
    id,
    `${id}@example.test`,
    nowIso(),
    nowIso(),
  );
  if (opts.status) {
    run(
      `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider,
         current_period_end, trial_ends_at, cancel_at_period_end, updated_at, created_at)
       VALUES (?, ?, 'premium', ?, 'web', 'stripe', ?, ?, 0, ?, ?)`,
      `sub-${id}`,
      id,
      opts.status,
      opts.periodEnd ?? null,
      opts.trialEndsAt ?? null,
      nowIso(),
      nowIso(),
    );
  }
}

function seedDevices(userId: string, count: number) {
  for (let i = 0; i < count; i += 1) {
    // Das erste Gerät wurde zuletzt genutzt und muss bleiben.
    const seen = new Date(NOW - i * 60_000).toISOString();
    run(
      `INSERT INTO devices (id, user_id, name, platform, status, activated_at, last_seen_at, created_at)
       VALUES (?, ?, ?, 'web', 'active', ?, ?, ?)`,
      `${userId}-d${i}`,
      userId,
      `Gerät ${i}`,
      seen,
      seen,
      seen,
    );
  }
}

function activeDeviceIds(userId: string) {
  return all<{ id: string }>(
    `SELECT id FROM devices WHERE user_id = ? AND status = 'active' ORDER BY id`,
    userId,
  ).map((row) => row.id);
}

const PAYING = new Date(NOW + 14 * 86_400_000).toISOString();
const LAPSED = new Date(NOW - 14 * 86_400_000).toISOString();

test("dry run counts the legacy accounts and changes nothing", () => {
  seedUser("legacy");
  seedDevices("legacy", 4);

  const result = cleanupOverLimitDevices({ dryRun: true, limit: 2 });
  assert.equal(result.dryRun, true);
  assert.equal(result.accounts, 1);
  assert.equal(result.devices, 2);
  assert.equal(activeDeviceIds("legacy").length, 4);
});

test("the run unlinks the surplus and keeps the most recently used", () => {
  const result = cleanupOverLimitDevices({ limit: 2 });
  assert.equal(result.accounts, 1);
  assert.equal(result.devices, 2);
  assert.deepEqual(activeDeviceIds("legacy"), ["legacy-d0", "legacy-d1"]);

  // Wiederholbar: beim zweiten Lauf gibt es nichts mehr zu tun.
  const again = cleanupOverLimitDevices({ limit: 2 });
  assert.equal(again.accounts, 0);
  assert.equal(again.devices, 0);
});

test("paying accounts, running trials and accounts within the limit stay untouched", () => {
  seedUser("zahlt", { status: "active", periodEnd: PAYING });
  seedDevices("zahlt", 5);
  seedUser("trial", { status: "none", trialEndsAt: PAYING });
  seedDevices("trial", 5);
  seedUser("klein", { status: "canceled", periodEnd: LAPSED });
  seedDevices("klein", 2);

  const accounts = overLimitAccounts(2).map((row) => row.userId);
  assert.deepEqual(accounts, []);

  const result = cleanupOverLimitDevices({ limit: 2 });
  assert.equal(result.accounts, 0);
  assert.equal(activeDeviceIds("zahlt").length, 5);
  assert.equal(activeDeviceIds("trial").length, 5);
  assert.equal(activeDeviceIds("klein").length, 2);
});

test("an account without any subscription row is cleaned up too", () => {
  seedUser("ohne-abo");
  seedDevices("ohne-abo", 3);
  assert.equal(countOverLimitAccounts(2), 1);

  const result = cleanupOverLimitDevices({ limit: 2 });
  assert.equal(result.accounts, 1);
  assert.equal(result.devices, 1);
  assert.deepEqual(activeDeviceIds("ohne-abo"), ["ohne-abo-d0", "ohne-abo-d1"]);
});

test("the cleanup sends no email", () => {
  const mails = all<{ c: number }>(`SELECT COUNT(*) AS c FROM outbox_emails`)[0].c;
  assert.equal(mails, 0);
});

test("the cleanup marks its own reason and keeps the account notice clean", async () => {
  const { devicesRevokedByEnding } = await import("./device-access.ts");

  const reasons = all<{ revoked_reason: string | null }>(
    `SELECT revoked_reason FROM devices WHERE status = 'revoked'`,
  ).map((row) => row.revoked_reason);
  assert.ok(reasons.length > 0);
  assert.ok(reasons.every((reason) => reason === "legacy_cleanup"));

  // Aufräumen ist keine Erklärung im Konto: nur Trial- und Abo-Ende zählen.
  assert.deepEqual(devicesRevokedByEnding("legacy"), []);

  run(
    `UPDATE devices SET revoked_reason = 'subscription_ended' WHERE id = 'legacy-d2'`,
  );
  const notice = devicesRevokedByEnding("legacy");
  assert.equal(notice.length, 1);
  assert.match(notice[0].name, /Gerät 2/);
});
