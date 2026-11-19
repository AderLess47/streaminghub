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
