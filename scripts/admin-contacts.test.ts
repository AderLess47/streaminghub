/**
 * Admin-Posteingang für Kontaktanfragen: Liste, Filter, Statuswechsel, Löschen
 * und Audit. Geprüft werden die Datenschicht und die Server Actions.
 *
 * Aufruf: npm run test:admin-contacts
 */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";
import { revalidated } from "./fakes/next-cache.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { get, nowIso, run } = await import("@/lib/db");
const { hashPassword } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const {
  CONTACT_RETENTION_DAYS,
  contactMessageStats,
  lastContactRetentionRun,
  listContactMessages,
  purgeExpiredContactMessages,
} = await import("@/lib/contact-messages");
const {
  deleteContactMessageAction,
  setContactMessageStatusAction,
} = await import("@/lib/actions/admin");

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

const PASSWORD_HASH = hashPassword("SicheresPasswort123");

function seedUser(id: string, email: string, role: "customer" | "admin" = "customer") {
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
  if (role === "admin") {
    run(
      `INSERT INTO mfa_secrets (user_id, secret, confirmed_at, created_at)
       VALUES (?, 'JBSWY3DPEHPK3PXP', ?, ?)`,
      id,
      at,
      at,
    );
  }
}

let sequence = 0;
function seedMessage(
  subject: string,
  status: "new" | "read" | "handled",
  email = "kunde@example.test",
  createdAt = new Date(Date.UTC(2026, 10, 14, 10, sequence)).toISOString(),
) {
  sequence += 1;
  const id = `contact-${sequence}`;
  run(
    `INSERT INTO contact_messages (id, name, email, subject, message, status, ip, created_at)
     VALUES (?, 'Erika Muster', ?, ?, 'Bitte helfen Sie mir bei der Aktivierung.', ?, '203.0.113.5', ?)`,
    id,
    email,
    subject,
    status,
    createdAt,
  );
  return id;
}

function statusOf(id: string) {
  return get<{ status: string }>(`SELECT status FROM contact_messages WHERE id = ?`, id)?.status;
}

function exists(id: string) {
  return Boolean(get(`SELECT 1 FROM contact_messages WHERE id = ?`, id));
}

function auditRows(action: string) {
  return get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_log WHERE action = ?`, action)?.c ?? 0;
}

function latestAudit() {
  return get<{ action: string; target_id: string; actor_id: string; meta: string | null }>(
    `SELECT action, target_id, actor_id, meta FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
}

async function redirectOf(action: () => Promise<unknown>): Promise<string> {
  try {
    await action();
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Aktion muss weiterleiten");
    return error.digest;
  }
  return "";
}

function form(id: string, extra: Record<string, string> = {}) {
  const data = new FormData();
  data.set("id", id);
  for (const [key, value] of Object.entries(extra)) data.set(key, value);
  return data;
}

seedUser("admin-1", "admin@example.test", "admin");
seedUser("kunde-1", "kunde@example.test");

const newId = seedMessage("Neue Anfrage", "new");
const readId = seedMessage("Gelesene Anfrage", "read");
const handledId = seedMessage("Erledigte Anfrage", "handled");

await check("Liste zeigt offene Anfragen zuerst", async () => {
  const rows = listContactMessages();
  assert.deepEqual(
    rows.map((row) => row.id),
    [newId, readId, handledId],
  );
  assert.equal(rows[0].message, "Bitte helfen Sie mir bei der Aktivierung.");
});

await check("Filter liefert nur den gewaehlten Status", async () => {
  assert.deepEqual(
    listContactMessages({ status: "new" }).map((row) => row.id),
    [newId],
  );
  assert.deepEqual(
    listContactMessages({ status: "handled" }).map((row) => row.id),
    [handledId],
  );
  assert.equal(listContactMessages({ limit: 2 }).length, 2);
});

await check("Zaehler stimmen", async () => {
  assert.deepEqual(contactMessageStats(), { new: 1, read: 1, handled: 1, total: 3 });
});

await check("Aufbewahrungsfrist ist 24 Monate", async () => {
  assert.equal(CONTACT_RETENTION_DAYS, 730);
});

await check("Anfragen aelter als die Frist werden geloescht", async () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const expiredId = seedMessage("Uralte Anfrage", "handled", "alt@example.test", daysAgo(731));
  const recentId = seedMessage("Knapp junge Anfrage", "handled", "jung@example.test", daysAgo(700));
  run("DELETE FROM audit_log");

  assert.equal(purgeExpiredContactMessages(), 1);
  assert.equal(exists(expiredId), false);
  assert.equal(exists(recentId), true);

  const audit = latestAudit();
  assert.equal(audit?.action, "contact_messages.purged");
  assert.equal(audit?.actor_id, null);
  const meta = JSON.parse(audit?.meta ?? "{}");
  assert.equal(meta.deleted, 1);
  assert.equal(meta.retentionDays, 730);
  assert.ok(
    Math.abs(Date.parse(meta.cutoff) - (Date.now() - 730 * 24 * 60 * 60 * 1000)) < 5000,
    "Cutoff muss 730 Tage vor dem Lauf liegen",
  );
  run("DELETE FROM contact_messages WHERE id = ?", recentId);
});

await check("Zweiter Lauf loescht nichts und protokolliert nicht", async () => {
  run("DELETE FROM audit_log");
  assert.equal(purgeExpiredContactMessages(), 0);
  assert.equal(auditRows("contact_messages.purged"), 0);
});

function runRetentionScript() {
  const result = spawnSync(
    process.execPath,
    [path.join(process.cwd(), "scripts", "contact-retention.mjs")],
    { env: { ...process.env, DATABASE_PATH: process.env.DATABASE_PATH }, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split("\n").pop() ?? "{}");
}

await check("Taeglicher Container-Lauf loescht abgelaufene Anfragen", async () => {
  const oldId = seedMessage(
    "Taeglicher Lauf",
    "handled",
    "cron@example.test",
    new Date(Date.now() - 800 * 24 * 60 * 60 * 1000).toISOString(),
  );
  run("DELETE FROM audit_log");

  const output = runRetentionScript();
  assert.equal(output.deleted, 1);
  assert.equal(output.retentionDays, 730);
  assert.equal(exists(oldId), false);

  const audit = latestAudit();
  assert.equal(audit?.action, "contact_messages.purged");
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}").deleted, 1);

  const lastRun = lastContactRetentionRun();
  assert.equal(lastRun?.deleted, 1);
  assert.equal(lastRun?.retentionDays, 730);
  assert.equal(lastRun?.source, "cron");
  assert.ok(Math.abs(Date.parse(lastRun?.at ?? "") - Date.now()) < 10_000);
});

await check("Taeglicher Lauf meldet beim zweiten Mal null", async () => {
  const output = runRetentionScript();
  assert.equal(output.deleted, 0);
  assert.equal(lastContactRetentionRun()?.deleted, 0);
});

await check("Eigene Frist wird beachtet", async () => {
  const tenDaysOld = seedMessage(
    "Zehn Tage alt",
    "new",
    "zehn@example.test",
    new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
  );
  assert.equal(purgeExpiredContactMessages(30), 0);
  assert.equal(exists(tenDaysOld), true);
  assert.equal(purgeExpiredContactMessages(7), 1);
  assert.equal(exists(tenDaysOld), false);
});

await check("Kunde darf den Status nicht aendern", async () => {
  run("DELETE FROM audit_log");
  sessionToken.value = await createSession("kunde-1");

  const digest = await redirectOf(() =>
    setContactMessageStatusAction(form(newId, { status: "handled" })),
  );
  assert.match(digest, /\/dashboard\?error=forbidden/);
  assert.equal(statusOf(newId), "new");
  assert.equal(auditRows("admin.contact_message_status_changed"), 0);
});

await check("Ohne Anmeldung kein Statuswechsel", async () => {
  sessionToken.value = null;
  const digest = await redirectOf(() =>
    setContactMessageStatusAction(form(newId, { status: "handled" })),
  );
  assert.match(digest, /\/login\?next=/);
  assert.equal(statusOf(newId), "new");
});

await check("Admin markiert als gelesen", async () => {
  run("DELETE FROM audit_log");
  revalidated.length = 0;
  sessionToken.value = await createSession("admin-1");

  const digest = await redirectOf(() =>
    setContactMessageStatusAction(form(newId, { status: "read" })),
  );
  assert.match(digest, /\/admin\/contacts\?ok=status/);
  assert.equal(statusOf(newId), "read");
  assert.ok(revalidated.includes("/admin/contacts"));

  const audit = latestAudit();
  assert.equal(audit?.action, "admin.contact_message_status_changed");
  assert.equal(audit?.target_id, newId);
  assert.equal(audit?.actor_id, "admin-1");
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), { status: "read" });
});

await check("Filter bleibt beim Statuswechsel erhalten", async () => {
  const digest = await redirectOf(() =>
    setContactMessageStatusAction(
      form(newId, { status: "handled", returnTo: "/admin/contacts?status=read" }),
    ),
  );
  assert.equal(digest, "NEXT_REDIRECT;replace;/admin/contacts?status=read&ok=status;307;");
  assert.equal(statusOf(newId), "handled");
});

await check("Ungueltiger Status wird ignoriert", async () => {
  run("DELETE FROM audit_log");
  const digest = await redirectOf(() =>
    setContactMessageStatusAction(form(newId, { status: "erledigt" })),
  );
  assert.equal(digest, "");
  assert.equal(statusOf(newId), "handled");
  assert.equal(auditRows("admin.contact_message_status_changed"), 0);
});

await check("Admin loescht eine Anfrage mit Audit", async () => {
  run("DELETE FROM audit_log");
  const digest = await redirectOf(() => deleteContactMessageAction(form(readId)));
  assert.match(digest, /\/admin\/contacts\?ok=deleted/);
  assert.equal(exists(readId), false);

  const audit = latestAudit();
  assert.equal(audit?.action, "admin.contact_message_deleted");
  assert.equal(audit?.target_id, readId);
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), {
    subject: "Gelesene Anfrage",
    email: "kunde@example.test",
  });
});

await check("Unbekannte Anfrage wird nicht protokolliert", async () => {
  run("DELETE FROM audit_log");
  const digest = await redirectOf(() => deleteContactMessageAction(form("gibt-es-nicht")));
  assert.equal(digest, "");
  assert.equal(auditRows("admin.contact_message_deleted"), 0);
});

await check("Kunde darf nicht loeschen", async () => {
  sessionToken.value = await createSession("kunde-1");
  run("DELETE FROM audit_log");
  const digest = await redirectOf(() => deleteContactMessageAction(form(handledId)));
  assert.match(digest, /\/dashboard\?error=forbidden/);
  assert.equal(exists(handledId), true);
  assert.equal(auditRows("admin.contact_message_deleted"), 0);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
