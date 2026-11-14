/**
 * Widerruf und Kündigung: Erklärung ohne Anmeldung, Bestätigungsreferenz,
 * Mails, Store-/Web-Fälle, Rate-Limit und der Admin-Vermerk.
 *
 * Aufruf: npm run test:withdrawal-cancellation
 */

import assert from "node:assert/strict";
import { sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { all, get, nowIso, run } = await import("@/lib/db");
const { hashPassword } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const { findContractRequest, contractLabel } = await import("@/lib/contract-requests");
const { POST: withdrawal } = await import("@/app/api/withdrawal/route");
const { POST: cancellation } = await import("@/app/api/cancellation/route");
const { setContractRequestHandledAction } = await import("@/lib/actions/admin");

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
     VALUES (?, ?, ?, 'Testkunde', 'de', ?, 1, ?, ?)`,
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

function seedSubscription(
  id: string,
  userId: string,
  channel: "web" | "apple" | "amazon",
  periodEnd: string,
) {
  const at = nowIso();
  run(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, provider_subscription_id,
       current_period_end, updated_at, created_at)
     VALUES (?, ?, 'premium', 'active', ?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    channel,
    // Kein Anbieter: der Web-Fall soll ohne Netzwerkaufruf als Fehlschlag enden.
    "none",
    null,
    periodEnd,
    at,
    at,
  );
}

function post(path: string, body: unknown, options: { ip?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "streaminghub.org",
    "x-forwarded-for": options.ip ?? "198.51.100.70",
  };
  if (options.origin !== undefined) headers.origin = options.origin;
  return new Request(`https://streaminghub.org${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const withdrawalBody = (overrides: Record<string, unknown> = {}) => ({
  name: "Erika Muster",
  email: "widerruf@example.test",
  contract: "web",
  note: "Bitte bestätigen.",
  privacyAccepted: true,
  website: "",
  renderedAt: Date.now() - 5_000,
  ...overrides,
});

const cancellationBody = (email: string, ip = "198.51.100.80") => ({
  email,
  website: "",
  renderedAt: Date.now() - 5_000,
  ip,
});

function contractRequests() {
  return all<{ kind: string; status: string; reference: string; email: string; effective_at: string | null }>(
    `SELECT kind, status, reference, email, effective_at FROM contract_requests ORDER BY rowid`,
  ).map((row) => ({
    kind: row.kind,
    status: row.status,
    reference: row.reference,
    email: row.email,
    effective_at: row.effective_at,
  }));
}

function mails() {
  return all<{ to_email: string; subject: string }>(
    `SELECT to_email, subject FROM outbox_emails ORDER BY rowid`,
  ).map((row) => ({ to_email: row.to_email, subject: row.subject }));
}

function latestAudit() {
  return get<{ action: string; target_id: string; meta: string | null }>(
    `SELECT action, target_id, meta FROM audit_log ORDER BY created_at DESC LIMIT 1`,
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

seedUser("kunde-1", "store@example.test");
seedUser("kunde-2", "ohne-abo@example.test");
seedUser("kunde-3", "web@example.test");
seedUser("admin-1", "admin@example.test", "admin");
seedSubscription("sub-apple", "kunde-1", "apple", "2026-12-01T00:00:00.000Z");
seedSubscription("sub-web", "kunde-3", "web", "2026-12-15T00:00:00.000Z");

let withdrawalReference = "";

await check("Widerruf wird ohne Anmeldung angenommen", async () => {
  run("DELETE FROM outbox_emails");
  run("DELETE FROM audit_log");

  const response = await withdrawal(post("/api/withdrawal", withdrawalBody()));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; reference: string };
  assert.equal(body.ok, true);
  assert.match(body.reference, /^W-/);
  withdrawalReference = body.reference;

  const record = findContractRequest(withdrawalReference);
  assert.ok(record);
  assert.equal(record?.kind, "withdrawal");
  assert.equal(record?.status, "received");
  assert.equal(record?.email, "widerruf@example.test");
  assert.equal(record?.contract, "web");

  const sent = mails();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].to_email, "widerruf@example.test");
  assert.match(sent[0].subject, /Widerruf/i);
  assert.equal(sent[1].to_email, "service@streaminghub.org");
  assert.match(sent[1].subject, /Widerruf/i);

  const audit = latestAudit();
  assert.equal(audit?.action, "withdrawal.submitted");
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), {
    reference: withdrawalReference,
    contract: "web",
  });
});

await check("Bestaetigungsseite findet den Widerruf, unbekannte Referenz nicht", async () => {
  const record = findContractRequest(withdrawalReference);
  assert.equal(record?.reference, withdrawalReference);
  assert.equal(contractLabel(record?.contract ?? "", "de"), "Premium-Abo über die Website");
  assert.equal(findContractRequest("W-gibtesnicht"), undefined);
});

await check("Gefuelltes Honeypot-Feld wird abgelehnt", async () => {
  run("DELETE FROM outbox_emails");
  const before = contractRequests().length;

  // Das Schema erlaubt nur ein leeres Feld, deshalb endet Spam bereits mit 400.
  const response = await withdrawal(
    post("/api/withdrawal", withdrawalBody({ website: "https://spam.example" })),
  );
  assert.equal(response.status, 400);
  assert.equal(contractRequests().length, before);
  assert.equal(mails().length, 0);
});

await check("Fehlende Datenschutzbestaetigung wird abgelehnt", async () => {
  const response = await withdrawal(
    post("/api/withdrawal", withdrawalBody({ privacyAccepted: false })),
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { fields?: { path: string }[] } };
  assert.ok(body.error?.fields?.some((field) => field.path === "privacyAccepted"));
});

await check("Zu schnelles Absenden wird abgelehnt", async () => {
  const response = await withdrawal(
    post("/api/withdrawal", withdrawalBody({ renderedAt: Date.now() })),
  );
  assert.equal(response.status, 400);
});

await check("Fremde Herkunft wird abgelehnt", async () => {
  const response = await withdrawal(
    post("/api/withdrawal", withdrawalBody(), { origin: "https://evil.example" }),
  );
  assert.equal(response.status, 403);
});

await check("Kuendigung eines Store-Abos wird belegt", async () => {
  run("DELETE FROM outbox_emails");
  run("DELETE FROM audit_log");

  const response = await cancellation(post("/api/cancellation", cancellationBody("store@example.test")));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; reference: string };
  assert.match(body.reference, /^K-/);

  const record = findContractRequest(body.reference);
  assert.equal(record?.status, "store_channel");
  assert.equal(record?.channel, "apple");
  assert.equal(record?.effectiveAt, "2026-12-01T00:00:00.000Z");

  const sent = mails();
  assert.equal(sent.length, 2);
  assert.equal(sent[0].to_email, "store@example.test");
  assert.equal(sent[1].to_email, "service@streaminghub.org");

  const audit = latestAudit();
  assert.equal(audit?.action, "cancellation.submitted");
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), {
    reference: body.reference,
    status: "store_channel",
    channel: "apple",
  });
});

await check("Unbekannte Adresse und fehlendes Abo werden unterschieden", async () => {
  const unknown = await cancellation(
    post("/api/cancellation", cancellationBody("niemand@example.test", "198.51.100.81")),
  );
  const unknownBody = (await unknown.json()) as { reference: string };
  assert.equal(findContractRequest(unknownBody.reference)?.status, "no_account");

  const without = await cancellation(
    post("/api/cancellation", cancellationBody("ohne-abo@example.test", "198.51.100.82")),
  );
  const withoutBody = (await without.json()) as { reference: string };
  assert.equal(findContractRequest(withoutBody.reference)?.status, "no_subscription");
});

await check("Web-Abo ohne Zahlungsanbieter endet als Fehlschlag", async () => {
  const response = await cancellation(
    post("/api/cancellation", cancellationBody("web@example.test", "198.51.100.83")),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { reference: string };
  const record = findContractRequest(body.reference);
  assert.equal(record?.status, "failed");
  assert.match(record?.note ?? "", /kein aktiver Zahlungsanbieter/);
});

await check("Widerruf ist pro Stunde begrenzt", async () => {
  run("DELETE FROM rate_limits");
  const ip = "198.51.100.90";
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await withdrawal(
      post("/api/withdrawal", withdrawalBody({ privacyAccepted: false }), { ip }),
    );
    assert.equal(response.status, 400, `Versuch ${attempt + 1}`);
  }
  const limited = await withdrawal(
    post("/api/withdrawal", withdrawalBody({ privacyAccepted: false }), { ip }),
  );
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
});

await check("Admin setzt den Erledigt-Vermerk mit Audit", async () => {
  run("DELETE FROM audit_log");
  const record = findContractRequest(withdrawalReference);
  assert.ok(record);
  sessionToken.value = await createSession("admin-1");

  const form = new FormData();
  form.set("id", record.id);
  form.set("handled", "1");
  const digest = await redirectOf(() => setContractRequestHandledAction(form));
  assert.match(digest, /\/admin\/contracts\?ok=handled/);

  const handled = get<{ handled_at: string | null; handled_by: string | null }>(
    `SELECT handled_at, handled_by FROM contract_requests WHERE id = ?`,
    record.id,
  );
  assert.ok(handled?.handled_at);
  assert.equal(handled?.handled_by, "admin@example.test");

  const audit = latestAudit();
  assert.equal(audit?.action, "admin.contract_request_handled");
  assert.equal(audit?.target_id, record.id);
});

await check("Admin oeffnet den Vorgang wieder", async () => {
  run("DELETE FROM audit_log");
  const record = findContractRequest(withdrawalReference);
  assert.ok(record);

  const form = new FormData();
  form.set("id", record.id);
  form.set("handled", "0");
  const digest = await redirectOf(() => setContractRequestHandledAction(form));
  assert.match(digest, /\/admin\/contracts\?ok=reopened/);

  const handled = get<{ handled_at: string | null; handled_by: string | null }>(
    `SELECT handled_at, handled_by FROM contract_requests WHERE id = ?`,
    record.id,
  );
  assert.equal(handled?.handled_at, null);
  assert.equal(handled?.handled_by, null);
  assert.equal(latestAudit()?.action, "admin.contract_request_reopened");
});

await check("Kunde darf keinen Admin-Vermerk setzen", async () => {
  const record = findContractRequest(withdrawalReference);
  assert.ok(record);
  sessionToken.value = await createSession("kunde-1");

  const form = new FormData();
  form.set("id", record.id);
  form.set("handled", "1");
  const digest = await redirectOf(() => setContractRequestHandledAction(form));
  assert.match(digest, /\/dashboard\?error=forbidden/);

  const handled = get<{ handled_at: string | null }>(
    `SELECT handled_at FROM contract_requests WHERE id = ?`,
    record.id,
  );
  assert.equal(handled?.handled_at, null);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
