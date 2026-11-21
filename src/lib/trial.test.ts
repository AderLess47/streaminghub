import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";

/**
 * Trial: Migration, Missbrauchsschutz, Startmail und Rechte.
 *
 * Die Datenbank wird bewusst im Stand vor dem Abo-Modell angelegt – ohne
 * Trial- und Abrechnungsspalten. Der erste Zugriff auf SQLite startet die
 * echte Migration aus `src/lib/db.ts`, sodass dieselben Tests auch beweisen,
 * dass eine bestehende Produktionsdatenbank die Spalten erhält.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-trial-"));
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

const { all, nowIso, run } = await import("./db.ts");
const { getEntitlements } = await import("./entitlements.ts");
const { DEFAULT_TRIAL_DAYS, startTrial, trialDays } = await import("./trial.ts");

after(() => rmSync(directory, { recursive: true, force: true }));

const DAY = 86_400_000;

const TRIAL_COLUMNS = [
  "trial_started_at",
  "trial_ends_at",
  "trial_source",
  "trial_used_at",
  "trial_converted_at",
  "billing_interval",
  "provider_price_id",
  "price_cents",
  "started_at",
  "canceled_at",
];

type SubscriptionRow = {
  status: string;
  provider_subscription_id: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  trial_source: string | null;
  trial_used_at: string | null;
};

function seedUser(id: string, options: { verified?: boolean } = {}) {
  const now = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, email_verified, created_at, updated_at)
     VALUES (?, ?, 'x', 'Testkonto', 'de', ?, ?, ?)`,
    id,
    `${id}@example.test`,
    options.verified === false ? 0 : 1,
    now,
    now,
  );
}

function setFlag(enabled: boolean) {
  setSetting("trial_enabled", enabled ? "1" : "0");
}

function setSetting(key: string, value: string) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
    nowIso(),
  );
}

function seedSubscription(
  userId: string,
  values: {
    status?: string;
    provider?: string;
    providerSubscriptionId?: string | null;
    providerCustomerId?: string | null;
    currentPeriodEnd?: string | null;
  } = {},
) {
  const now = nowIso();
  run(
    `INSERT INTO subscriptions
       (id, user_id, plan, status, channel, provider, provider_customer_id,
        provider_subscription_id, current_period_end, cancel_at_period_end, updated_at, created_at)
     VALUES (?, ?, 'premium', ?, 'web', ?, ?, ?, ?, 0, ?, ?)`,
    `sub-${userId}`,
    userId,
    values.status ?? "none",
    values.provider ?? "none",
    values.providerCustomerId ?? null,
    values.providerSubscriptionId ?? null,
    values.currentPeriodEnd ?? null,
    now,
    now,
  );
}

function subscriptionRow(userId: string): SubscriptionRow | undefined {
  return all<SubscriptionRow>(`SELECT * FROM subscriptions WHERE user_id = ?`, userId)[0];
}

function mailsTo(email: string) {
  return all<{ subject: string; body_text: string }>(
    `SELECT subject, body_text FROM outbox_emails WHERE to_email = ? ORDER BY created_at`,
    email,
  );
}

test("migrate() adds the trial and billing columns to an existing subscriptions table", () => {
  // Der erste Zugriff führt SCHEMA_SQL und migrate() aus.
  const columns = all<{ name: string }>(
    `SELECT name FROM pragma_table_info('subscriptions')`,
  ).map((row) => row.name);

  for (const column of TRIAL_COLUMNS) {
    assert.ok(columns.includes(column), `subscriptions.${column} fehlt nach der Migration`);
  }
});

test("a disabled feature flag rejects the trial and writes nothing", async () => {
  setFlag(false);
  seedUser("trial-off");

  const outcome = await startTrial({ userId: "trial-off" });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.code, "disabled");
  assert.equal(subscriptionRow("trial-off"), undefined);
  assert.equal(mailsTo("trial-off@example.test").length, 0);
});

test("an unconfirmed email cannot start the trial", async () => {
  setFlag(true);
  seedUser("trial-unverified", { verified: false });

  const outcome = await startTrial({ userId: "trial-unverified" });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.code, "email_unverified");
  assert.equal(subscriptionRow("trial-unverified"), undefined);
});

test("a verified account starts a 14 day trial, becomes premium and gets one mail", async () => {
  setFlag(true);
  seedUser("trial-ok");
  const before = Date.now();
  assert.equal(DEFAULT_TRIAL_DAYS, 14, "der zugesagte Default sind 14 Tage");

  const outcome = await startTrial({ userId: "trial-ok" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.trialDays, 14);

  const row = subscriptionRow("trial-ok");
  assert.ok(row, "der Trial braucht eine Abo-Zeile");
  assert.equal(row.status, "none", "der Status bleibt unverändert");
  assert.equal(row.trial_source, "web");
  assert.equal(row.trial_used_at, row.trial_started_at);
  assert.ok(row.trial_started_at);

  const end = Date.parse(row.trial_ends_at ?? "");
  assert.ok(Number.isFinite(end));
  const expected = 14 * DAY;
  assert.ok(
    Math.abs(end - before - expected) < 5_000,
    "Trial-Ende liegt nicht 14 Tage in der Zukunft",
  );
  assert.equal(outcome.trialEndsAt, row.trial_ends_at);

  const entitlements = getEntitlements("trial-ok");
  assert.equal(entitlements.premium, true);
  assert.equal(entitlements.trialActive, true);
  assert.equal(entitlements.source, "trial");
  assert.equal(entitlements.plan, "standard");
  assert.equal(entitlements.deviceLimit, 5);
  assert.equal(entitlements.cloudBackup, true);

  const mails = mailsTo("trial-ok@example.test");
  assert.equal(mails.length, 1);
  assert.match(mails[0].subject, /Testzeitraum/);
});

test("a second start is idempotent and sends no second mail", async () => {
  const first = subscriptionRow("trial-ok");

  const outcome = await startTrial({ userId: "trial-ok" });
  assert.equal(outcome.ok, true);
  if (!outcome.ok) return;
  assert.equal(outcome.trialEndsAt, first?.trial_ends_at);
  assert.equal(outcome.trialDays, DEFAULT_TRIAL_DAYS);
  assert.equal(subscriptionRow("trial-ok")?.trial_ends_at, first?.trial_ends_at);
  assert.equal(mailsTo("trial-ok@example.test").length, 1);
});

test("an ended trial cannot be restarted and the account falls back to free", async () => {
  run(
    `UPDATE subscriptions SET trial_ends_at = ? WHERE user_id = ?`,
    new Date(Date.now() - DAY).toISOString(),
    "trial-ok",
  );

  const outcome = await startTrial({ userId: "trial-ok" });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.code, "already_used");
  assert.equal(mailsTo("trial-ok@example.test").length, 1);

  const entitlements = getEntitlements("trial-ok");
  assert.equal(entitlements.premium, false);
  assert.equal(entitlements.trialActive, false);
  assert.equal(entitlements.deviceLimit, 2);
});

test("a running subscription blocks the trial", async () => {
  setFlag(true);
  seedUser("trial-active");
  seedSubscription("trial-active", {
    status: "active",
    provider: "stripe",
    providerSubscriptionId: "sub_live",
    currentPeriodEnd: new Date(Date.now() + 10 * DAY).toISOString(),
  });

  const outcome = await startTrial({ userId: "trial-active" });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.code, "already_active");
  assert.equal(subscriptionRow("trial-active")?.trial_used_at, null);
});

test("an open checkout keeps a second checkout from starting a trial", async () => {
  seedUser("trial-pending");
  seedSubscription("trial-pending", { status: "pending", provider: "stripe" });

  const outcome = await startTrial({ userId: "trial-pending" });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.ok ? null : outcome.code, "checkout_pending");
  assert.equal(subscriptionRow("trial-pending")?.trial_used_at, null);
});

test("a previous subscription or payment event blocks a new trial", async () => {
  seedUser("trial-previous-sub");
  seedSubscription("trial-previous-sub", {
    status: "canceled",
    provider: "stripe",
    providerSubscriptionId: "sub_old",
  });
  const withSubscription = await startTrial({ userId: "trial-previous-sub" });
  assert.equal(withSubscription.ok, false);
  assert.equal(withSubscription.ok ? null : withSubscription.code, "payment_history");

  // Auch ohne gespeicherte Abo-ID belegt ein Zahlungsereignis die Historie.
  seedUser("trial-previous-payment");
  seedSubscription("trial-previous-payment", { status: "canceled", provider: "stripe" });
  run(
    `INSERT INTO subscription_events
       (id, user_id, provider, event_type, provider_event_id, payload, created_at)
     VALUES (?, ?, 'stripe', 'checkout.session.completed', ?, '{}', ?)`,
    "evt-trial-payment",
    "trial-previous-payment",
    "evt-trial-payment",
    nowIso(),
  );
  const withEvent = await startTrial({ userId: "trial-previous-payment" });
  assert.equal(withEvent.ok, false);
  assert.equal(withEvent.ok ? null : withEvent.code, "payment_history");
  assert.equal(subscriptionRow("trial-previous-payment")?.trial_used_at, null);
});

test("the trial length comes from settings and is clamped", async () => {
  setSetting("trial_days", "30");
  assert.equal(trialDays(), 30);
  seedUser("trial-thirty");
  const thirty = await startTrial({ userId: "trial-thirty" });
  assert.equal(thirty.ok, true);
  assert.equal(thirty.ok ? thirty.trialDays : null, 30);

  setSetting("trial_days", "999");
  assert.equal(trialDays(), 60);

  setSetting("trial_days", "0");
  assert.equal(trialDays(), 1);

  setSetting("trial_days", "keine Zahl");
  assert.equal(trialDays(), 14, "ohne gueltige Einstellung gelten 14 Tage");
});
