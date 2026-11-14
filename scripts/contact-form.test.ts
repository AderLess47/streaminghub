/**
 * Kontaktformular: Spamschutz (Honeypot, Zeitfenster), Validierung, Mail an den
 * Support, Datensatz und Audit sowie das Rate-Limit.
 *
 * Aufruf: npm run test:contact-form
 */

import assert from "node:assert/strict";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { all, get, run } = await import("@/lib/db");
const { POST: contact } = await import("@/app/api/contact/route");

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

const body = (overrides: Record<string, unknown> = {}) => ({
  name: "Erika Muster",
  email: "Kunde@Example.TEST",
  subject: "Frage zur Aktivierung",
  message: "Mein Fire-TV-Gerät lässt sich seit heute nicht mehr aktivieren.",
  privacyAccepted: true,
  website: "",
  renderedAt: Date.now() - 5_000,
  ...overrides,
});

function post(payload: unknown, options: { ip?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "streaminghub.org",
    "x-forwarded-for": options.ip ?? "203.0.113.20",
  };
  if (options.origin !== undefined) headers.origin = options.origin;
  return new Request("https://streaminghub.org/api/contact", {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
}

function messages() {
  return all<{
    name: string;
    email: string;
    subject: string;
    status: string;
    ip: string;
  }>(`SELECT name, email, subject, status, ip FROM contact_messages ORDER BY rowid`).map((row) => ({
    name: row.name,
    email: row.email,
    subject: row.subject,
    status: row.status,
    ip: row.ip,
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

await check("Gueltige Anfrage wird gespeichert, gemailt und protokolliert", async () => {
  run("DELETE FROM contact_messages");
  run("DELETE FROM outbox_emails");
  run("DELETE FROM audit_log");

  const response = await contact(post(body()));
  assert.equal(response.status, 200);
  const result = (await response.json()) as { ok: boolean; reference: string };
  assert.equal(result.ok, true);
  assert.match(result.reference, /^[0-9a-f-]{36}$/);

  const rows = messages();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Erika Muster");
  assert.equal(rows[0].email, "kunde@example.test", "Adresse wird klein gespeichert");
  assert.equal(rows[0].status, "new");
  assert.equal(rows[0].ip, "203.0.113.20");

  const sent = mails();
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to_email, "service@streaminghub.org");
  assert.equal(sent[0].subject, "[Kontakt] Frage zur Aktivierung");

  const audit = latestAudit();
  assert.equal(audit?.action, "contact.submitted");
  assert.equal(audit?.target_id, result.reference);
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), { subject: "Frage zur Aktivierung" });
});

await check("Zu kurze Nachricht wird abgelehnt", async () => {
  run("DELETE FROM contact_messages");
  run("DELETE FROM outbox_emails");

  const response = await contact(post(body({ message: "zu kurz" })));
  assert.equal(response.status, 400);
  const result = (await response.json()) as { error?: { fields?: { path: string }[] } };
  assert.ok(result.error?.fields?.some((field) => field.path === "message"));
  assert.equal(messages().length, 0);
  assert.equal(mails().length, 0);
});

await check("Fehlende Datenschutzbestaetigung wird abgelehnt", async () => {
  const response = await contact(post(body({ privacyAccepted: false })));
  assert.equal(response.status, 400);
  const result = (await response.json()) as { error?: { fields?: { path: string }[] } };
  assert.ok(result.error?.fields?.some((field) => field.path === "privacyAccepted"));
  assert.equal(messages().length, 0);
});

await check("Gefuelltes Honeypot-Feld wird abgelehnt", async () => {
  const response = await contact(post(body({ website: "https://spam.example" })));
  assert.equal(response.status, 400);
  assert.equal(messages().length, 0);
  assert.equal(mails().length, 0);
});

await check("Zu schnelles Absenden wird abgelehnt", async () => {
  const response = await contact(post(body({ renderedAt: Date.now() })));
  assert.equal(response.status, 400);
  assert.equal(messages().length, 0);
});

await check("Fremde Herkunft wird abgelehnt", async () => {
  const response = await contact(post(body(), { origin: "https://evil.example" }));
  assert.equal(response.status, 403);
  assert.equal(messages().length, 0);
});

await check("Sechste Anfrage pro Stunde wird begrenzt", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM contact_messages");
  const ip = "203.0.113.30";
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await contact(post(body({ message: "kurz" }), { ip }));
    assert.equal(response.status, 400, `Versuch ${attempt}`);
  }
  const limited = await contact(post(body({ message: "kurz" }), { ip }));
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
