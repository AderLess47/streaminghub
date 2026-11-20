import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";

/**
 * Trial-Jobs: Erinnerung vor Ablauf, Ablaufmarkierung, Idempotenz und Zugang.
 *
 * Die Datenbank entsteht wie in `trial.test.ts` im Stand vor dem Abo-Modell;
 * der erste Zugriff startet die echte Migration aus `src/lib/db.ts`. Damit ist
 * auch geprüft, dass eine bestehende Produktionsdatenbank die Marker-Spalten
 * der Jobs erhält.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-trial-jobs-"));
const databasePath = path.join(directory, "test.db");

const legacy = new DatabaseSync(databasePath);
legacy.exec(`
  CREATE TABLE subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    plan TEXT NOT NULL DEFAULT 'premium',
    status TEXT NOT NULL DEFAULT 'none',
    channel TEXT NOT NULL DEFAULT 'web',
    provider TEXT NOT NULL DEFAULT 'none',
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    current_period_end TEXT,
    cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);
legacy.close();

process.env.DATABASE_PATH = databasePath;
process.env.APP_URL = "http://localhost:3000";
delete process.env.RESEND_API_KEY;
delete process.env.EMAIL_API_KEY;

const { all, nowIso, run } = await import("./db.ts");
const { REMINDER_WINDOW_HOURS, authorizeJob, runTrialJobs } = await import("./trial-jobs.ts");

after(() => rmSync(directory, { recursive: true, force: true }));

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const JOB_COLUMNS = ["trial_reminder_sent_at", "trial_ended_at"];

type TrialRow = {
  status: string;
  trial_ends_at: string | null;
  trial_reminder_sent_at: string | null;
  trial_ended_at: string | null;
  trial_converted_at: string | null;
};

function seedUser(id: string, options: { disabled?: boolean } = {}) {
  const now = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, email_verified,
                        disabled_at, created_at, updated_at)
     VALUES (?, ?, 'x', 'Testkonto', 'de', 1, ?, ?, ?)`,
    id,
    `${id}@example.test`,
    options.disabled ? now : null,
    now,
    now,
  );
}

function seedTrial(
  userId: string,
  options: { endsInMs: number; status?: string; periodEnd?: string | null } = { endsInMs: 0 },
) {
  const now = Date.now();
  run(
    `INSERT INTO subscriptions
       (id, user_id, plan, status, channel, provider, provider_customer_id,
        provider_subscription_id, current_period_end, cancel_at_period_end,
        trial_started_at, trial_ends_at, trial_used_at, updated_at, created_at)
     VALUES (?, ?, 'premium', ?, 'web', 'none', NULL, NULL, ?, 0, ?, ?, ?, ?, ?)`,
    `sub-${userId}`,
    userId,
    options.status ?? "none",
    options.periodEnd ?? null,
    new Date(now - DAY).toISOString(),
    new Date(now + options.endsInMs).toISOString(),
    new Date(now - DAY).toISOString(),
    nowIso(),
    nowIso(),
  );
}

function row(userId: string): TrialRow | undefined {
  return all<TrialRow>(`SELECT * FROM subscriptions WHERE user_id = ?`, userId)[0];
}

function mailsTo(email: string) {
  return all<{ subject: string; body_text: string }>(
    `SELECT subject, body_text FROM outbox_emails WHERE to_email = ? ORDER BY created_at`,
    email,
  );
}

test("migrate() adds the job markers to an existing subscriptions table", () => {
  const columns = all<{ name: string }>(`SELECT name FROM pragma_table_info('subscriptions')`).map(
    (column) => column.name,
  );
  for (const column of JOB_COLUMNS) {
    assert.ok(columns.includes(column), `subscriptions.${column} fehlt nach der Migration`);
  }
});

test("a trial ending inside the window gets exactly one reminder", async () => {
  seedUser("job-soon");
  seedTrial("job-soon", { endsInMs: 10 * HOUR });

  const first = await runTrialJobs();
  assert.equal(first.reminders, 1);
  assert.equal(first.failed, 0);
  assert.ok(row("job-soon")?.trial_reminder_sent_at, "die Erinnerung braucht einen Marker");
  assert.equal(row("job-soon")?.trial_ended_at, null, "ein laufender Trial ist nicht beendet");

  const mails = mailsTo("job-soon@example.test");
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /endet bald/);
  assert.match(mails[0].body_text, /2 Geräten/);
  assert.match(mails[0].body_text, /abgemeldet/);
  assert.doesNotMatch(mails[0].body_text, /bleiben gekoppelt/);
  assert.match(mails[0].body_text, /monatlich kündbar/);

  // Zweiter Lauf am selben Tag: kein zweiter Versand.
  const second = await runTrialJobs();
  assert.equal(second.reminders, 0);
  assert.equal(mailsTo("job-soon@example.test").length, 1);
});

test("a trial that is still days away waits for the reminder window", async () => {
  seedUser("job-later");
  seedTrial("job-later", { endsInMs: 6 * DAY });

  const summary = await runTrialJobs();
  assert.equal(summary.reminders, 0);
  assert.equal(row("job-later")?.trial_reminder_sent_at, null);
  assert.equal(mailsTo("job-later@example.test").length, 0);

  // Genau an der Fenstergrenze wird erinnert.
  const justInside = await runTrialJobs({
    now: Date.now() + 6 * DAY - (REMINDER_WINDOW_HOURS - 1) * HOUR,
  });
  assert.equal(justInside.reminders, 1);
  assert.equal(mailsTo("job-later@example.test").length, 1);
});

test("an ended trial is marked once and gets one closing mail", async () => {
  seedUser("job-ended");
  seedTrial("job-ended", { endsInMs: -2 * HOUR });

  const first = await runTrialJobs();
  assert.equal(first.expired, 1);
  assert.equal(first.skipped, 0);
  assert.ok(row("job-ended")?.trial_ended_at, "der Ablauf braucht einen Marker");
  assert.equal(row("job-ended")?.trial_converted_at, null, "ohne Zahlung keine Umwandlung");
  assert.equal(row("job-ended")?.status, "none", "der Abo-Status bleibt unverändert");
  assert.equal(mailsTo("job-ended@example.test").length, 1);
  assert.match(mailsTo("job-ended@example.test")[0].subject, /beendet/);

  const second = await runTrialJobs();
  assert.equal(second.expired, 0);
  assert.equal(mailsTo("job-ended@example.test").length, 1);
});

test("an ended trial that was converted is marked without a closing mail", async () => {
  seedUser("job-converted");
  seedTrial("job-converted", {
    endsInMs: -HOUR,
    status: "active",
    periodEnd: new Date(Date.now() + 20 * DAY).toISOString(),
  });

  const summary = await runTrialJobs();
  assert.equal(summary.expired, 0);
  assert.equal(summary.skipped, 1);
  assert.ok(row("job-converted")?.trial_ended_at);
  assert.ok(row("job-converted")?.trial_converted_at, "die Umwandlung wird festgehalten");
  assert.equal(mailsTo("job-converted@example.test").length, 0);
  assert.equal(row("job-converted")?.trial_reminder_sent_at, null);
});

test("dryRun reports the work without writing or sending", async () => {
  seedUser("job-dry");
  seedTrial("job-dry", { endsInMs: 4 * HOUR });

  const summary = await runTrialJobs({ dryRun: true });
  assert.equal(summary.dryRun, true);
  assert.equal(summary.reminders, 1);
  assert.equal(row("job-dry")?.trial_reminder_sent_at, null);
  assert.equal(mailsTo("job-dry@example.test").length, 0);

  const after = await runTrialJobs();
  assert.equal(after.reminders, 1, "nach dem Probelauf läuft die echte Erinnerung");
});

test("a disabled account gets no mail and no marker", async () => {
  seedUser("job-disabled", { disabled: true });
  seedTrial("job-disabled", { endsInMs: 5 * HOUR });

  const summary = await runTrialJobs();
  assert.equal(summary.reminders, 0);
  assert.equal(summary.expired, 0);
  assert.equal(row("job-disabled")?.trial_reminder_sent_at, null);
  assert.equal(mailsTo("job-disabled@example.test").length, 0);
});

test("the job token is required, compared exactly and never empty", () => {
  assert.equal(authorizeJob("secret", ""), "not_configured");
  assert.equal(authorizeJob(null, ""), "not_configured");
  assert.equal(authorizeJob(null, "secret"), "forbidden");
  assert.equal(authorizeJob("", "secret"), "forbidden");
  assert.equal(authorizeJob("secre", "secret"), "forbidden");
  assert.equal(authorizeJob("secret2", "secret"), "forbidden");
  assert.equal(authorizeJob("secret", "secret"), "ok");
});

function seedDevice(userId: string, id: string, seenHoursAgo: number, status = "active") {
  const base = Date.now();
  run(
    `INSERT INTO devices (id, user_id, name, platform, status, activated_at, last_seen_at, created_at)
     VALUES (?, ?, ?, 'android', ?, ?, ?, ?)`,
    id,
    userId,
    id,
    status,
    new Date(base - 30 * DAY).toISOString(),
    new Date(base - seenHoursAgo * HOUR).toISOString(),
    new Date(base - 30 * DAY).toISOString(),
  );
}

function activeDevices(userId: string) {
  return all<{ id: string }>(
    `SELECT id FROM devices WHERE user_id = ? AND status = 'active' ORDER BY id`,
    userId,
  ).map((device) => device.id);
}

test("an ended trial keeps only the most recently used devices", async () => {
  seedUser("job-devices");
  seedTrial("job-devices", { endsInMs: -HOUR });
  seedDevice("job-devices", "dev-new", 1);
  seedDevice("job-devices", "dev-mid", 5);
  seedDevice("job-devices", "dev-old", 40);
  seedDevice("job-devices", "dev-oldest", 400);
  seedDevice("job-devices", "dev-gone", 0, "revoked");

  const summary = await runTrialJobs();
  assert.equal(summary.devicesRevoked, 2);
  assert.deepEqual(activeDevices("job-devices"), ["dev-mid", "dev-new"]);

  const mail = mailsTo("job-devices@example.test")[0];
  assert.match(mail.body_text, /2 Geräten/);
  assert.match(mail.body_text, /2 weitere Geräte wurden deshalb abgemeldet/);
  assert.doesNotMatch(mail.body_text, /bleiben gekoppelt/);

  // Zweiter Lauf meldet nichts erneut ab.
  const second = await runTrialJobs();
  assert.equal(second.devicesRevoked, 0);
  assert.deepEqual(activeDevices("job-devices"), ["dev-mid", "dev-new"]);
});

test("a trial that converts keeps every device", async () => {
  seedUser("job-devices-paid");
  seedTrial("job-devices-paid", {
    endsInMs: -HOUR,
    status: "active",
    periodEnd: new Date(Date.now() + 20 * DAY).toISOString(),
  });
  for (const [index, id] of ["paid-1", "paid-2", "paid-3", "paid-4"].entries()) {
    seedDevice("job-devices-paid", id, index + 1);
  }

  const summary = await runTrialJobs();
  assert.equal(summary.devicesRevoked, 0);
  assert.equal(activeDevices("job-devices-paid").length, 4);
});

test("dryRun counts surplus devices without unlinking them", async () => {
  seedUser("job-devices-dry");
  seedTrial("job-devices-dry", { endsInMs: -HOUR });
  for (const [index, id] of ["dry-1", "dry-2", "dry-3"].entries()) {
    seedDevice("job-devices-dry", id, index + 1);
  }

  const summary = await runTrialJobs({ dryRun: true });
  assert.equal(summary.devicesRevoked, 1);
  assert.equal(activeDevices("job-devices-dry").length, 3);
  assert.equal(mailsTo("job-devices-dry@example.test").length, 0);
  assert.equal(row("job-devices-dry")?.trial_ended_at, null);
});

test("the closing mail reads correctly with and without device revisions", async () => {
  const { trialEndedMail } = await import("./mail.ts");

  const one = trialEndedMail({ name: "Max", locale: "de", priceEur: 3.49, deviceLimit: 2, devicesRevoked: 1 });
  assert.match(one.text, /ein weiteres Gerät wurde deshalb abgemeldet/);

  const many = trialEndedMail({ name: "Max", locale: "de", priceEur: 3.49, deviceLimit: 2, devicesRevoked: 3 });
  assert.match(many.text, /die 2 zuletzt genutzten aktiv; 3 weitere Geräte wurden deshalb abgemeldet/);
  assert.doesNotMatch(many.text, /Im Konto kannst du Geräte entfernen/);

  const none = trialEndedMail({ name: "Max", locale: "de", priceEur: 3.49, deviceLimit: 2, devicesRevoked: 0 });
  assert.match(none.text, /Deine Geräte bleiben gekoppelt, und deine Playlist bleibt gespeichert/);
  assert.doesNotMatch(none.text, /gekoppelt Deine/);
  assert.doesNotMatch(none.text, /abgemeldet/);
});
