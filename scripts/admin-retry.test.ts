/**
 * Headless-Tests für `retryEmailAction`: erneuter Versand aus der Admin-
 * Oberfläche, Ergebnis-Weiterleitung und Audit-Metadaten.
 *
 * Aufruf: npm run test:admin-retry
 */

import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";

const provider = createServer((request, response) => {
  requests += 1;
  if (failProvider) {
    response.writeHead(500, { "content-type": "text/plain" }).end("provider down");
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ id: "provider-message-retry" }));
});
let requests = 0;
let failProvider = false;
await new Promise<void>((resolve) => provider.listen(0, "127.0.0.1", resolve));
const { port } = provider.address() as AddressInfo;

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "test-key";
process.env.EMAIL_API_BASE = `http://127.0.0.1:${port}`;
process.env.EMAIL_FROM = "StreamingHub <service@example.test>";
process.env.EMAIL_TIMEOUT_MS = "2000";

const { get, nowIso, run } = await import("@/lib/db");
const { createSession } = await import("@/lib/session");
const { retryEmailAction } = await import("@/lib/actions/admin");

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
  sessionToken.value = await createSession(userId);
}

function seedFailedMail(id = "mail-1") {
  const at = nowIso();
  run(
    `INSERT INTO outbox_emails (id, to_email, subject, body_text, kind, status, attempts,
       error, last_attempt_at, created_at)
     VALUES (?, 'kunde@example.test', 'Test', 'Hallo', 'system', 'failed', 2,
       'HTTP 500: provider down', ?, ?)`,
    id,
    at,
    at,
  );
}

function outbox(id = "mail-1") {
  return get<{ status: string; attempts: number; provider_id: string | null; error: string | null }>(
    `SELECT status, attempts, provider_id, error FROM outbox_emails WHERE id = ?`,
    id,
  );
}

function latestAudit() {
  return get<{
    action: string;
    actor_email: string;
    target_type: string;
    target_id: string;
    meta: string | null;
  }>(`SELECT action, actor_email, target_type, target_id, meta FROM audit_log
      ORDER BY created_at DESC LIMIT 1`);
}

function auditCount() {
  return get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_log`)?.c ?? 0;
}

async function runAction(emailId: string) {
  const form = new FormData();
  form.set("emailId", emailId);
  try {
    await retryEmailAction(form);
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Aktion muss weiterleiten");
    return error.digest;
  }
  return "";
}

const adminId = seedUser("admin@example.test", "admin");

await check("Erfolgreicher Retry liefert ok=sent und Audit-Meta", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM outbox_emails");
  seedFailedMail();
  failProvider = false;
  requests = 0;
  await loginAs(adminId);

  const digest = await runAction("mail-1");
  assert.match(digest, /\/admin\/emails\?ok=sent/);
  assert.equal(requests, 1);

  const row = outbox();
  assert.equal(row?.status, "sent");
  assert.equal(row?.attempts, 3);
  assert.equal(row?.provider_id, "provider-message-retry");
  assert.equal(row?.error, null);

  const audit = latestAudit();
  assert.equal(audit?.action, "admin.email_retry");
  assert.equal(audit?.actor_email, "admin@example.test");
  assert.equal(audit?.target_type, "outbox_email");
  assert.equal(audit?.target_id, "mail-1");
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), { delivered: true, reason: null });
});

await check("Fehlschlag beim Retry liefert ok=failed und Grund", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM outbox_emails");
  seedFailedMail();
  failProvider = true;
  requests = 0;
  await loginAs(adminId);

  const digest = await runAction("mail-1");
  assert.match(digest, /\/admin\/emails\?ok=failed/);
  assert.equal(requests, 2, "ein Retry versucht es zweimal");

  const row = outbox();
  assert.equal(row?.status, "failed");
  assert.equal(row?.attempts, 4);
  assert.match(row?.error ?? "", /HTTP 500/);

  const audit = latestAudit();
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), {
    delivered: false,
    reason: "provider_error",
  });
});

await check("Unbekannte Mail-ID wird als Fehlschlag protokolliert", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM outbox_emails");
  failProvider = false;
  requests = 0;
  await loginAs(adminId);

  const digest = await runAction("gibt-es-nicht");
  assert.match(digest, /\/admin\/emails\?ok=failed/);
  assert.equal(requests, 0);

  const audit = latestAudit();
  assert.equal(audit?.target_id, "gibt-es-nicht");
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), {
    delivered: false,
    reason: "provider_error",
  });
});

await check("Support darf keinen Retry ausloesen", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM outbox_emails");
  seedFailedMail();
  failProvider = false;
  requests = 0;
  await loginAs(seedUser("support@example.test", "support"));

  const digest = await runAction("mail-1");
  assert.match(digest, /\/admin\?error=forbidden/);
  assert.equal(requests, 0);
  assert.equal(outbox()?.attempts, 2);
  assert.equal(auditCount(), 0);
  sessionToken.value = null;
});

await check("Ohne Anmeldung kein Retry", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM outbox_emails");
  seedFailedMail();
  requests = 0;
  sessionToken.value = null;

  const digest = await runAction("mail-1");
  assert.match(digest, /\/login\?next=/);
  assert.equal(requests, 0);
  assert.equal(outbox()?.attempts, 2);
  assert.equal(auditCount(), 0);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
provider.close();
if (failed.length > 0) process.exitCode = 1;
