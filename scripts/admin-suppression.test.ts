/**
 * Headless-Tests für `releaseEmailSuppressionAction`: Rechte, Löschung der
 * Sperre, Audit-Eintrag und Weiterleitung.
 *
 * Aufruf: npm run test:admin-suppression
 */

import assert from "node:assert/strict";
import { sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { all, get, nowIso, run } = await import("@/lib/db");
const { createSession } = await import("@/lib/session");
const { releaseEmailSuppressionAction } = await import("@/lib/actions/admin");

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

const PASSWORD_HASH = "scrypt$16384$8$1$c2FsdA==$a2V5";

function seedUser(email: string, role: "admin" | "support", id = `user-${role}`) {
  const at = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
       created_at, updated_at)
     VALUES (?, ?, ?, 'Test', 'de', ?, 1, ?, ?)`,
    id,
    email,
    PASSWORD_HASH,
    role,
    at,
    at,
  );
  run(
    `INSERT INTO mfa_secrets (user_id, secret, confirmed_at, created_at)
     VALUES (?, 'JBSWY3DPEHPK3PXP', ?, ?)`,
    id,
    at,
    at,
  );
  return id;
}

async function loginAs(userId: string) {
  const token = await createSession(userId);
  sessionToken.value = token;
  return token;
}

function seedSuppression(email = "kunde@example.test", reason = "bounce") {
  run(
    `INSERT INTO email_suppressions (email, reason, detail, created_at)
     VALUES (?, ?, 'mailbox does not exist', ?)`,
    email,
    reason,
    nowIso(),
  );
}

function suppressionCount(email = "kunde@example.test") {
  const row = get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM email_suppressions WHERE email = ?`,
    email,
  );
  return row?.c ?? 0;
}

function latestAudit() {
  return get<{
    actor_id: string;
    actor_email: string;
    action: string;
    target_type: string;
    target_id: string;
  }>(`SELECT actor_id, actor_email, action, target_type, target_id FROM audit_log
      ORDER BY created_at DESC LIMIT 1`);
}

function auditCount() {
  return get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_log`)?.c ?? 0;
}

const adminId = seedUser("admin@example.test", "admin");

await check("Admin hebt die Sperre auf und protokolliert sie", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM email_suppressions");
  seedSuppression("kunde@example.test", "bounce");
  await loginAs(adminId);

  const form = new FormData();
  form.set("email", "  Kunde@Example.TEST ");

  let redirectTarget = "";
  try {
    await releaseEmailSuppressionAction(form);
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Aktion muss weiterleiten");
    redirectTarget = error.digest;
  }

  assert.match(redirectTarget, /\/admin\/emails\?ok=suppression/);
  assert.equal(suppressionCount("kunde@example.test"), 0);

  const audit = latestAudit();
  assert.equal(audit?.action, "admin.email_suppression_released");
  assert.equal(audit?.actor_id, adminId);
  assert.equal(audit?.actor_email, "admin@example.test");
  assert.equal(audit?.target_type, "email");
  assert.equal(audit?.target_id, "kunde@example.test");
});

await check("Support darf keine Sperre aufheben", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM email_suppressions");
  seedSuppression();
  const supportId = seedUser("support@example.test", "support");
  await loginAs(supportId);

  const form = new FormData();
  form.set("email", "kunde@example.test");

  let redirectTarget = "";
  try {
    await releaseEmailSuppressionAction(form);
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Support muss umgeleitet werden");
    redirectTarget = error.digest;
  }

  assert.match(redirectTarget, /\/admin\?error=forbidden/);
  assert.equal(suppressionCount(), 1);
  assert.equal(auditCount(), 0);
  sessionToken.value = null;
});

await check("Ohne Anmeldung wird nichts geloescht", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM email_suppressions");
  seedSuppression();
  sessionToken.value = null;

  const form = new FormData();
  form.set("email", "kunde@example.test");

  let redirectTarget = "";
  try {
    await releaseEmailSuppressionAction(form);
  } catch (error) {
    assert.ok(error instanceof RedirectError);
    redirectTarget = error.digest;
  }

  assert.match(redirectTarget, /\/login\?next=/);
  assert.equal(suppressionCount(), 1);
  assert.equal(auditCount(), 0);
});

await check("Leere Adresse wird ohne Loeschung quittiert", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM email_suppressions");
  seedSuppression();
  await loginAs(adminId);

  const form = new FormData();
  form.set("email", "   ");

  await releaseEmailSuppressionAction(form);

  assert.equal(suppressionCount(), 1);
  assert.equal(auditCount(), 0);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
