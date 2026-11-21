import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { SubscriptionEntitlementRow } from "./entitlements.ts";

// `getEntitlements` liest Abo und Einstellungen aus SQLite, und env.ts liest
// DATABASE_PATH beim Laden. Deshalb steht der Pfad vor dem Import fest.
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-entitlements-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

const {
  DEFAULT_FREE_DEVICE_LIMIT,
  DEFAULT_PREMIUM_DEVICE_LIMIT,
  getEntitlements,
  hasPremiumAccess,
  resolveEntitlements,
} = await import("./entitlements.ts");
const { nowIso, run } = await import("./db.ts");

after(() => rmSync(directory, { recursive: true, force: true }));

const NOW = Date.parse("2026-11-19T12:00:00.000Z");
const inDays = (days: number) => new Date(NOW + days * 86_400_000).toISOString();

function subscription(
  overrides: Partial<SubscriptionEntitlementRow> = {},
): SubscriptionEntitlementRow {
  return {
    status: "none",
    channel: "web",
    provider: "none",
    current_period_end: null,
    cancel_at_period_end: 0,
    plan: "premium",
    billing_interval: null,
    trial_ends_at: null,
    ...overrides,
  };
}

function resolve(
  status: SubscriptionEntitlementRow["status"],
  row: SubscriptionEntitlementRow | null,
  limits: { free?: number; premium?: number } = {},
) {
  return resolveEntitlements({
    status,
    subscription: row,
    freeDeviceLimit: limits.free ?? DEFAULT_FREE_DEVICE_LIMIT,
    premiumDeviceLimit: limits.premium ?? DEFAULT_PREMIUM_DEVICE_LIMIT,
    now: NOW,
  });
}

test("an account without a subscription is free with the free device limit", () => {
  assert.deepEqual(resolve("none", null), {
    plan: "free",
    source: "none",
    premium: false,
    trialActive: false,
    trialEndsAt: null,
    billingInterval: null,
    deviceLimit: 2,
    cloudBackup: false,
    progressSync: false,
  });
});

test("an active web subscription unlocks every premium right", () => {
  const entitlements = resolve(
    "active",
    subscription({
      status: "active",
      provider: "stripe",
      current_period_end: inDays(20),
    }),
  );

  assert.equal(entitlements.plan, "standard");
  assert.equal(entitlements.source, "stripe");
  assert.equal(entitlements.premium, true);
  assert.equal(entitlements.trialActive, false);
  assert.equal(entitlements.deviceLimit, 5);
  assert.equal(entitlements.cloudBackup, true);
  assert.equal(entitlements.progressSync, true);
});

test("a yearly subscription reports its interval", () => {
  const entitlements = resolve(
    "active",
    subscription({ status: "active", provider: "stripe", billing_interval: "year" }),
  );
  assert.equal(entitlements.billingInterval, "year");
});

test("store channels keep their source", () => {
  assert.equal(resolve("active", subscription({ status: "active", channel: "amazon" })).source, "amazon");
  assert.equal(resolve("active", subscription({ status: "active", channel: "apple" })).source, "apple");
  // Ein von Hand freigeschaltetes Abo hat keinen Zahlungsanbieter.
  assert.equal(resolve("active", subscription({ status: "active" })).source, "manual");
});

test("a running trial behaves like premium without touching the status", () => {
  const entitlements = resolve(
    "none",
    subscription({ trial_ends_at: inDays(3) }),
  );

  assert.equal(entitlements.premium, true);
  assert.equal(entitlements.trialActive, true);
  assert.equal(entitlements.trialEndsAt, inDays(3));
  assert.equal(entitlements.source, "trial");
  assert.equal(entitlements.plan, "standard");
  assert.equal(entitlements.deviceLimit, 5);
  assert.equal(entitlements.cloudBackup, true);
});

test("an expired trial falls back to free and hides its end date", () => {
  const entitlements = resolve("none", subscription({ trial_ends_at: inDays(-1) }));

  assert.equal(entitlements.premium, false);
  assert.equal(entitlements.trialActive, false);
  assert.equal(entitlements.trialEndsAt, null);
  assert.equal(entitlements.source, "none");
  assert.equal(entitlements.deviceLimit, 2);
  assert.equal(entitlements.cloudBackup, false);
});

test("a paid subscription wins over a trial that is still running", () => {
  const entitlements = resolve(
    "active",
    subscription({ status: "active", provider: "stripe", trial_ends_at: inDays(5) }),
  );

  assert.equal(entitlements.trialActive, false);
  assert.equal(entitlements.trialEndsAt, null);
  assert.equal(entitlements.source, "stripe");
});

test("past_due keeps premium off, exactly like before", () => {
  const entitlements = resolve("past_due", subscription({ status: "past_due" }));
  assert.equal(entitlements.premium, false);
  assert.equal(entitlements.deviceLimit, 2);
});

test("broken trial dates and invalid limits fall back safely", () => {
  const broken = resolve("none", subscription({ trial_ends_at: "not-a-date" }));
  assert.equal(broken.premium, false);

  const limits = resolveEntitlements({
    status: "active",
    subscription: subscription({ status: "active" }),
    freeDeviceLimit: Number.NaN,
    premiumDeviceLimit: -4,
    now: NOW,
  });
  assert.equal(limits.deviceLimit, 5, "ungueltige Limits fallen auf 5 zurueck");
});

test("getEntitlements reads subscription and live settings from the database", () => {
  const userId = randomUUID();
  const now = nowIso();
  const end = new Date(Date.now() + 86_400_000).toISOString();

  run(
    `INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    userId,
    `${userId}@example.test`,
    "hash",
    now,
    now,
  );
  run(
    `INSERT INTO subscriptions
       (id, user_id, plan, status, channel, provider, current_period_end, updated_at, created_at)
     VALUES (?, ?, 'premium', 'active', 'web', 'stripe', ?, ?, ?)`,
    randomUUID(),
    userId,
    end,
    now,
    now,
  );

  const paid = getEntitlements(userId);
  assert.equal(paid.premium, true);
  assert.equal(paid.plan, "standard");
  assert.equal(paid.deviceLimit, 5);
  assert.equal(hasPremiumAccess(userId), true);

  // Die Limits kommen live aus den Einstellungen, nicht aus einer Konstante.
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES ('premium_device_limit', '9', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    now,
  );
  assert.equal(getEntitlements(userId).deviceLimit, 9);

  // Ohne Abo bleibt derselbe Nutzer kostenlos – mit dem Free-Limit.
  run(`DELETE FROM subscriptions WHERE user_id = ?`, userId);
  const free = getEntitlements(userId);
  assert.equal(free.premium, false);
  assert.equal(free.deviceLimit, 2);
  assert.equal(hasPremiumAccess(userId), false);
});
