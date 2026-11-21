/**
 * Datenexport und Löschungsanfrage im Kundenkonto: Passwortprüfung, Anfrage-
 * zeilen, Audit, Exportinhalt, Abschluss des Exports und Rate-Limit.
 *
 * Aufruf: npm run test:data-requests
 */

import assert from "node:assert/strict";
import { sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { all, get, nowIso, run } = await import("@/lib/db");
const { hashPassword } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const { dataRequestAction } = await import("@/lib/actions/dashboard");
const { GET: exportData } = await import("@/app/api/account/export/route");

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

const PASSWORD = "SicheresPasswort123";
const PASSWORD_HASH = hashPassword(PASSWORD);

function seedUser(id: string, email: string) {
  const at = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
       marketing_opt_in, created_at, updated_at)
     VALUES (?, ?, ?, 'Testkunde', 'de', 'customer', 1, 1, ?, ?)`,
    id,
    email,
    PASSWORD_HASH,
    at,
    at,
  );
  run(
    `INSERT INTO devices (id, user_id, name, platform, status, activated_at, last_seen_at, created_at)
     VALUES (?, ?, 'Wohnzimmer', 'firetv', 'active', ?, ?, ?)`,
    `device-${id}`,
    id,
    at,
    at,
    at,
  );
  run(
    `INSERT INTO legal_acceptances (id, user_id, document, version, accepted_at)
     VALUES (?, ?, 'terms_and_privacy', '2026-11-01', ?)`,
    `legal-${id}`,
    id,
    at,
  );
}

function requestForm(options: {
  kind?: string;
  confirm?: boolean;
  password?: string;
}) {
  const form = new FormData();
  if (options.kind !== undefined) form.set("kind", options.kind);
  if (options.confirm !== false) form.set("confirm", "on");
  if (options.password !== undefined) form.set("password", options.password);
  return form;
}

function dataRequests(userId: string) {
  return all<{ kind: string; status: string }>(
    `SELECT kind, status FROM data_requests WHERE user_id = ? ORDER BY created_at`,
    userId,
  ).map((row) => ({ kind: row.kind, status: row.status }));
}

function auditCount(action: string) {
  return get<{ c: number }>(
    `SELECT COUNT(*) AS c FROM audit_log WHERE action = ?`,
    action,
  )?.c ?? 0;
}

function exportRequest(ip = "203.0.113.60") {
  return new Request("https://streaminghub.org/api/account/export", {
    headers: { host: "streaminghub.org", "x-forwarded-for": ip },
  });
}

seedUser("kunde-1", "kunde@example.test");
seedUser("kunde-2", "andere@example.test");

await check("Export ohne Anmeldung wird abgelehnt", async () => {
  sessionToken.value = null;
  const response = await exportData(exportRequest());
  assert.equal(response.status, 401);
});

await check("Exportanfrage verlangt das Passwort", async () => {
  run("DELETE FROM audit_log");
  sessionToken.value = await createSession("kunde-1");

  const result = await dataRequestAction(
    null,
    requestForm({ kind: "export", password: "falsch123" }),
  );
  assert.equal(result?.ok, false);
  assert.equal(result?.fieldErrors?.password, "Das Passwort ist falsch.");
  assert.deepEqual(dataRequests("kunde-1"), []);
  assert.equal(auditCount("privacy.export_requested"), 0);
});

await check("Exportanfrage ohne Bestaetigung wird abgelehnt", async () => {
  const result = await dataRequestAction(
    null,
    requestForm({ kind: "export", confirm: false, password: PASSWORD }),
  );
  assert.equal(result?.ok, false);
  assert.equal(result?.fieldErrors?.confirm, "Bitte bestätige die Anfrage.");
  assert.deepEqual(dataRequests("kunde-1"), []);
});

await check("Exportanfrage wird erfasst", async () => {
  run("DELETE FROM audit_log");
  const result = await dataRequestAction(
    null,
    requestForm({ kind: "export", password: PASSWORD }),
  );
  assert.equal(result?.ok, true);
  assert.match(result?.message ?? "", /Exportanfrage/);
  assert.deepEqual(dataRequests("kunde-1"), [{ kind: "export", status: "requested" }]);

  const audit = get<{ action: string; actor_id: string }>(
    `SELECT action, actor_id FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "privacy.export_requested");
  assert.equal(audit?.actor_id, "kunde-1");
});

await check("Export liefert eigene Daten ohne Geheimnisse", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM rate_limits");
  sessionToken.value = await createSession("kunde-1");

  const response = await exportData(exportRequest());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.match(
    response.headers.get("content-disposition") ?? "",
    /attachment; filename="streaminghub-datenexport-kunde-1\.json"/,
  );
  assert.equal(response.headers.get("cache-control"), "no-store");

  const body = (await response.json()) as Record<string, unknown> & {
    account: Record<string, unknown>;
    devices: { id: string }[];
    legalAcceptances: unknown[];
    dataRequests: { kind: string; status: string }[];
  };
  assert.equal(body.account.email, "kunde@example.test");
  assert.equal(body.account.id, "kunde-1");
  assert.equal("password_hash" in body.account, false);
  assert.equal(body.devices.length, 1);
  assert.equal(body.devices[0].id, "device-kunde-1");
  assert.equal(body.legalAcceptances.length, 1);
  assert.deepEqual(
    body.dataRequests.map((row) => ({ kind: row.kind, status: row.status })),
    [{ kind: "export", status: "requested" }],
  );

  const raw = JSON.stringify(body);
  assert.equal(raw.includes(PASSWORD_HASH), false, "Passwort-Hash darf nicht im Export stehen");
  assert.equal(raw.includes("scrypt$"), false, "keine Hashfragmente im Export");

  assert.deepEqual(dataRequests("kunde-1"), [{ kind: "export", status: "completed" }]);
  assert.equal(auditCount("privacy.export_downloaded"), 1);
});

await check("Export enthaelt keine Daten anderer Konten", async () => {
  sessionToken.value = await createSession("kunde-2");
  const response = await exportData(exportRequest("203.0.113.61"));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { account: { id: string }; devices: unknown[] };
  assert.equal(body.account.id, "kunde-2");
  assert.equal(body.devices.length, 1);
  assert.equal(JSON.stringify(body).includes("kunde-1"), false);
});

await check("Export ist pro Stunde begrenzt", async () => {
  run("DELETE FROM rate_limits");
  sessionToken.value = await createSession("kunde-1");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await exportData(exportRequest(`203.0.113.${70 + attempt}`));
    assert.equal(response.status, 200, `Export ${attempt}`);
  }
  const limited = await exportData(exportRequest("203.0.113.80"));
  assert.equal(limited.status, 429);
  const retryAfter = Number(limited.headers.get("retry-after"));
  assert.ok(
    retryAfter >= 3500 && retryAfter <= 3600,
    `retry-after muss im Stundenfenster liegen, war ${retryAfter}`,
  );
});

await check("Loeschungsanfrage mit falschem Passwort wird abgelehnt", async () => {
  run("DELETE FROM audit_log");
  run("DELETE FROM data_requests");
  sessionToken.value = await createSession("kunde-1");

  const result = await dataRequestAction(
    null,
    requestForm({ kind: "deletion", password: "falsch123" }),
  );
  assert.equal(result?.ok, false);
  assert.equal(result?.fieldErrors?.password, "Das Passwort ist falsch.");
  assert.deepEqual(dataRequests("kunde-1"), []);
  assert.equal(auditCount("privacy.deletion_requested"), 0);
});

await check("Loeschungsanfrage wird erfasst und protokolliert", async () => {
  run("DELETE FROM audit_log");
  const result = await dataRequestAction(
    null,
    requestForm({ kind: "deletion", password: PASSWORD }),
  );
  assert.equal(result?.ok, true);
  assert.match(result?.message ?? "", /Löschungsanfrage/);
  assert.deepEqual(dataRequests("kunde-1"), [{ kind: "deletion", status: "requested" }]);

  const audit = get<{ action: string; actor_email: string }>(
    `SELECT action, actor_email FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "privacy.deletion_requested");
  assert.equal(audit?.actor_email, "kunde@example.test");
});

await check("Ohne Anmeldung wird keine Anfrage erfasst", async () => {
  run("DELETE FROM data_requests");
  sessionToken.value = null;
  let digest = "";
  try {
    await dataRequestAction(null, requestForm({ kind: "deletion", password: PASSWORD }));
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Anmeldung muss erzwungen werden");
    digest = error.digest;
  }
  assert.match(digest, /\/login\?next=/);
  assert.deepEqual(dataRequests("kunde-1"), []);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
