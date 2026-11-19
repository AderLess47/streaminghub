import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";

/**
 * Kündigungs-Rettung und Conversion-Coupon.
 *
 * Die Datenbank startet wie in den anderen Abo-Tests im Stand vor dem
 * Abo-Modell, damit die Migration der neuen Spalten mitgeprüft wird. Der
 * Zahlungsanbieter wird nicht angefasst: `acceptRetentionOffer` nimmt die
 * Coupon-Funktion als Parameter, der Test reicht eine Attrappe hinein.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-retention-"));
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
process.env.STRIPE_WINBACK_COUPON_ID = "coupon_winback";
process.env.STRIPE_CONVERSION_COUPON_ID = "coupon_conversion";
delete process.env.RESEND_API_KEY;

const { all, nowIso, run } = await import("./db.ts");
const { trialConversionCoupon } = await import("./conversion.ts");
const { acceptRetentionOffer, declineRetentionOffer, retentionOffer } = await import(
  "./retention.ts"
);

after(() => rmSync(directory, { recursive: true, force: true }));

const DAY = 86_400_000;

const NEW_COLUMNS = ["coupon_id", "retention_outcome", "retention_decided_at"];

type Row = {
  status: string;
  channel: string;
  provider: string;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: number;
  trial_used_at: string | null;
  coupon_id: string | null;
  retention_outcome: string | null;
  retention_decided_at: string | null;
};

function setFlag(flag: string, enabled: boolean) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    flag,
    enabled ? "1" : "0",
    nowIso(),
  );
}

function seedUser(id: string) {
  const now = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, email_verified, created_at, updated_at)
     VALUES (?, ?, 'x', 'Testkonto', 'de', 1, ?, ?)`,
    id,
    `${id}@example.test`,
    now,
    now,
  );
}

function seedSubscription(
  userId: string,
  values: {
    status?: string;
    channel?: string;
    provider?: string;
    providerSubscriptionId?: string | null;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: number;
    trialUsedAt?: string | null;
  } = {},
) {
  const now = nowIso();
  run(
    `INSERT INTO subscriptions
       (id, user_id, plan, status, channel, provider, provider_customer_id,
        provider_subscription_id, current_period_end, cancel_at_period_end,
        trial_used_at, updated_at, created_at)
     VALUES (?, ?, 'premium', ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
    `sub-${userId}`,
    userId,
    values.status ?? "none",
    values.channel ?? "web",
    values.provider ?? "none",
    values.providerSubscriptionId ?? null,
    values.currentPeriodEnd ?? null,
    values.cancelAtPeriodEnd ?? 0,
    values.trialUsedAt ?? null,
    now,
    now,
  );
}

function row(userId: string): Row | undefined {
  return all<Row>(`SELECT * FROM subscriptions WHERE user_id = ?`, userId)[0];
}

/** Laufendes Web-Abo, wie es vor einer Kündigung aussieht. */
function seedActive(userId: string, overrides: Parameters<typeof seedSubscription>[1] = {}) {
  seedUser(userId);
  seedSubscription(userId, {
    status: "active",
    provider: "stripe",
    providerSubscriptionId: `sub_stripe_${userId}`,
    currentPeriodEnd: new Date(Date.now() + 12 * DAY).toISOString(),
    ...overrides,
  });
}

test("migrate() adds the coupon and retention columns", () => {
  const columns = all<{ name: string }>(`SELECT name FROM pragma_table_info('subscriptions')`).map(
    (column) => column.name,
  );
  for (const column of NEW_COLUMNS) {
    assert.ok(columns.includes(column), `subscriptions.${column} fehlt nach der Migration`);
  }
});

test("without the flag the offer stays off", () => {
  setFlag("retention_enabled", false);
  seedActive("ret-off");

  const offer = retentionOffer("ret-off");
  assert.equal(offer.available, false);
  assert.equal(offer.available ? null : offer.reason, "disabled");
});

test("without a configured coupon nothing is offered", () => {
  setFlag("retention_enabled", true);
  seedActive("ret-nocoupon");

  const offer = retentionOffer("ret-nocoupon", { couponId: "" });
  assert.equal(offer.available, false);
  assert.equal(offer.available ? null : offer.reason, "not_configured");
});

test("a running web subscription gets an offer with the configured coupon", () => {
  const offer = retentionOffer("ret-off"); // vom Test oben: aktives Web-Abo
  assert.equal(offer.available, true);
  assert.equal(offer.available ? offer.couponId : null, "coupon_winback");
});

test("store subscriptions, ended ones and already scheduled cancellations are excluded", () => {
  seedActive("ret-amazon", { channel: "amazon", provider: "amazon" });
  assert.equal(retentionOffer("ret-amazon").available, false);

  seedActive("ret-ended", { status: "canceled" });
  assert.equal(retentionOffer("ret-ended").available, false);

  seedActive("ret-scheduled", { cancelAtPeriodEnd: 1 });
  const scheduled = retentionOffer("ret-scheduled");
  assert.equal(scheduled.available, false);
  assert.equal(scheduled.available ? null : scheduled.reason, "already_scheduled");

  seedUser("ret-none");
  const none = retentionOffer("ret-none");
  assert.equal(none.available, false);
  assert.equal(none.available ? null : none.reason, "not_active");
});

test("accepting applies the coupon and records the decision", async () => {
  const calls: { userId: string; couponId: string }[] = [];
  const decide = await acceptRetentionOffer("ret-off", {
    apply: async (userId, couponId) => {
      calls.push({ userId, couponId });
      return { ok: true };
    },
    now: Date.parse("2026-03-01T10:00:00.000Z"),
  });

  assert.equal(decide.ok, true);
  assert.equal(decide.ok ? decide.outcome : null, "accepted");
  assert.deepEqual(calls, [{ userId: "ret-off", couponId: "coupon_winback" }]);

  const stored = row("ret-off");
  assert.equal(stored?.retention_outcome, "accepted");
  assert.equal(stored?.retention_decided_at, "2026-03-01T10:00:00.000Z");
  assert.equal(stored?.coupon_id, "coupon_winback");
  assert.equal(stored?.status, "active", "der Status bleibt unverändert");
});

test("a failed provider call leaves the offer open for another try", async () => {
  const decide = await acceptRetentionOffer("ret-nocoupon", {
    couponId: "coupon_winback",
    apply: async () => ({ ok: false, message: "Anbieter nicht erreichbar." }),
  });

  assert.equal(decide.ok, false);
  assert.equal(decide.ok ? null : decide.reason, "provider_error");
  assert.equal(decide.ok ? null : decide.message, "Anbieter nicht erreichbar.");
  assert.equal(row("ret-nocoupon")?.retention_outcome, null);
  assert.equal(row("ret-nocoupon")?.coupon_id, null);
});

test("accepting twice is refused once the decision is stored", async () => {
  const decide = await acceptRetentionOffer("ret-off", {
    apply: async () => ({ ok: true }),
  });
  assert.equal(decide.ok, false);
  assert.equal(decide.ok ? null : decide.reason, "already_decided");
});

test("declining records the decision without touching the coupon", () => {
  seedActive("ret-decline");

  const decide = declineRetentionOffer("ret-decline");
  assert.equal(decide.ok, true);
  assert.equal(decide.ok ? decide.outcome : null, "declined");
  assert.equal(row("ret-decline")?.retention_outcome, "declined");
  assert.equal(row("ret-decline")?.coupon_id, null);

  // Zweiter Aufruf ist kein Fehler: das Angebot ist bereits entschieden.
  const second = declineRetentionOffer("ret-decline");
  assert.equal(second.ok, false);
  assert.equal(second.ok ? null : second.reason, "already_decided");
});

test("a cancellation after the offer is recorded as decline", () => {
  seedActive("ret-cancel");
  assert.equal(retentionOffer("ret-cancel").available, true);

  // Reihenfolge der Action: erst kündigen, dann festhalten.
  run(
    `UPDATE subscriptions SET cancel_at_period_end = 1, updated_at = ? WHERE user_id = ?`,
    nowIso(),
    "ret-cancel",
  );
  assert.equal(retentionOffer("ret-cancel").available, false, "vorgemerkte Kündigung zeigt nichts");

  const decide = declineRetentionOffer("ret-cancel");
  assert.equal(decide.ok, true);
  assert.equal(row("ret-cancel")?.retention_outcome, "declined");
});

test("the conversion coupon only applies to trials that did not pay yet", () => {
  setFlag("conversion_coupon_enabled", false);
  seedUser("conv-off");
  seedSubscription("conv-off", { trialUsedAt: nowIso() });
  assert.equal(trialConversionCoupon("conv-off"), null, "Flag aus bedeutet kein Coupon");

  setFlag("conversion_coupon_enabled", true);
  assert.equal(
    trialConversionCoupon("conv-off"),
    "coupon_conversion",
    "Trial ohne Zahlung bekommt den Coupon",
  );

  seedUser("conv-nopatrial");
  seedSubscription("conv-nopatrial");
  assert.equal(trialConversionCoupon("conv-nopatrial"), null, "ohne Trial kein Coupon");

  seedUser("conv-paid");
  seedSubscription("conv-paid", {
    status: "active",
    provider: "stripe",
    providerSubscriptionId: "sub_stripe_conv_paid",
    currentPeriodEnd: new Date(Date.now() + 10 * DAY).toISOString(),
    trialUsedAt: nowIso(),
  });
  assert.equal(trialConversionCoupon("conv-paid"), null, "laufendes Abo bekommt keinen Coupon");

  assert.equal(trialConversionCoupon("conv-unknown"), null, "unbekanntes Konto bekommt nichts");
});
