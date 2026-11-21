/**
 * Passwort-Reset von der Anfrage bis zum Login: Token-Ausgabe per Mail,
 * Einlösen, Sitzungsinvalidierung, Einmalverwendung, Rechte und Rate-Limit.
 *
 * Aufruf: npm run test:password-reset
 */

import assert from "node:assert/strict";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { all, get, nowIso, run } = await import("@/lib/db");
const { hashPassword, issueAuthToken } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const { POST: forgotPassword } = await import("@/app/api/auth/forgot-password/route");
const { POST: resetPassword } = await import("@/app/api/auth/reset-password/route");
const { POST: login } = await import("@/app/api/auth/login/route");

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

const OLD_PASSWORD = "AltesPasswort123";
const NEW_PASSWORD = "NeuesPasswort456";
const EMAIL = "kunde@example.test";

function seedUser(
  email = EMAIL,
  options: { id?: string; password?: string; disabled?: boolean } = {},
) {
  const at = nowIso();
  const id = options.id ?? `user-${email.split("@")[0]}`;
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
       created_at, updated_at, disabled_at)
     VALUES (?, ?, ?, 'Test', 'de', 'customer', 1, ?, ?, ?)`,
    id,
    email,
    hashPassword(options.password ?? OLD_PASSWORD),
    at,
    at,
    options.disabled ? at : null,
  );
  return id;
}

function post(path: string, body: unknown, options: { ip?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "streaminghub.org",
    "x-forwarded-for": options.ip ?? "203.0.113.10",
  };
  if (options.origin !== undefined) headers.origin = options.origin;
  return new Request(`https://streaminghub.org${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const forgotRequest = (email = EMAIL, ip = "203.0.113.10", origin?: string) =>
  post("/api/auth/forgot-password", { email }, { ip, origin });

const resetRequest = (token: string, password = NEW_PASSWORD, ip = "203.0.113.10") =>
  post("/api/auth/reset-password", { token, password }, { ip });

const loginRequest = (password: string, email = EMAIL, ip = "203.0.113.30") =>
  post("/api/auth/login", { email, password }, { ip });

function resetMails() {
  return all<{ body_text: string; status: string }>(
    `SELECT body_text, status FROM outbox_emails WHERE kind = 'reset_password' ORDER BY rowid`,
  ).map((row) => ({ body_text: row.body_text, status: row.status }));
}

function latestToken(): string {
  const mails = resetMails();
  assert.ok(mails.length > 0, "keine Reset-Mail geschrieben");
  const match = mails[mails.length - 1].body_text.match(/token=([A-Za-z0-9_-]+)/);
  assert.ok(match, "kein Token in der Mail");
  return match[1];
}

const userId = seedUser();

await check("Anfrage schreibt eine Reset-Mail mit Token", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  const response = await forgotPassword(forgotRequest());
  const body = (await response.json()) as { ok: boolean };
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);

  const mails = resetMails();
  assert.equal(mails.length, 1);
  assert.match(mails[0].body_text, /\/reset-password\?token=/);
  assert.equal(latestToken().length >= 20, true);
});

await check("Einloesen setzt das Passwort, entwertet Sitzungen und protokolliert", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM audit_log");
  const oldSession = await createSession(userId);
  assert.ok(oldSession);
  assert.equal(sessions(userId), 1);

  const token = latestToken();
  const response = await resetPassword(resetRequest(token));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });

  assert.equal(sessions(userId), 0, "bestehende Sitzungen muessen enden");

  const audit = get<{ action: string; actor_id: string }>(
    `SELECT action, actor_id FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "auth.password_reset");
  assert.equal(audit?.actor_id, userId);
});

await check("Token ist nur einmal verwendbar", async () => {
  const token = latestToken();
  const response = await resetPassword(resetRequest(token));
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { code?: string } };
  assert.equal(body.error?.code, "invalid_request");
});

await check("Altes Passwort scheitert, neues funktioniert", async () => {
  run("DELETE FROM rate_limits");
  const oldLogin = await login(loginRequest(OLD_PASSWORD));
  assert.equal(oldLogin.status, 400);

  const newLogin = await login(loginRequest(NEW_PASSWORD));
  assert.equal(newLogin.status, 200);
  const body = (await newLogin.json()) as { ok: boolean; redirectTo: string };
  assert.equal(body.ok, true);
  assert.equal(body.redirectTo, "/dashboard");
  assert.equal(sessions(userId), 1);
});

await check("Unbekannte Adresse antwortet identisch und mailt nicht", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  const response = await forgotPassword(forgotRequest("niemand@example.test", "203.0.113.11"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(resetMails().length, 0);
});

await check("Deaktiviertes Konto bekommt keine Mail", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  seedUser("gesperrt@example.test", { disabled: true });
  const response = await forgotPassword(forgotRequest("gesperrt@example.test", "203.0.113.12"));
  assert.equal(response.status, 200);
  assert.equal(resetMails().length, 0);
});

await check("Zu kurzes Passwort wird abgelehnt, Token bleibt gueltig", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  seedUser("kurz@example.test", { password: OLD_PASSWORD });
  await forgotPassword(forgotRequest("kurz@example.test", "203.0.113.13"));
  const token = latestToken();

  const response = await resetPassword(resetRequest(token, "kurz1", "203.0.113.13"));
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { fields?: { path: string }[] } };
  assert.equal(body.error?.fields?.[0]?.path, "password");

  const retry = await resetPassword(resetRequest(token, NEW_PASSWORD, "203.0.113.13"));
  assert.equal(retry.status, 200, "der Token darf nach dem Schemafehler noch gelten");
});

await check("Abgelaufener Token wird abgelehnt", async () => {
  run("DELETE FROM rate_limits");
  const { raw } = issueAuthToken(userId, "reset_password", -60);
  const response = await resetPassword(resetRequest(raw, "NochEinPasswort789", "203.0.113.14"));
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { code?: string } };
  assert.equal(body.error?.code, "invalid_request");
});

await check("Fremde Herkunft wird abgelehnt", async () => {
  run("DELETE FROM rate_limits");
  const response = await forgotPassword(forgotRequest(EMAIL, "203.0.113.15", "https://evil.example"));
  assert.equal(response.status, 403);
});

await check("Vierte Anfrage pro Adresse wird begrenzt", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await forgotPassword(forgotRequest(EMAIL, `203.0.113.${20 + attempt}`));
    assert.equal(response.status, 200);
  }
  const limited = await forgotPassword(forgotRequest(EMAIL, "203.0.113.40"));
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
  assert.equal(resetMails().length, 3);
});

await check("Reset-Link gilt eine Stunde", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  await forgotPassword(forgotRequest(EMAIL, "203.0.113.50"));

  const row = get<{ id: string; created_at: string; expires_at: string }>(
    `SELECT id, created_at, expires_at FROM auth_tokens WHERE kind = 'reset_password' ORDER BY rowid DESC LIMIT 1`,
  );
  assert.ok(row, "kein Reset-Token gespeichert");
  assert.equal(
    Math.round((new Date(row.expires_at).getTime() - new Date(row.created_at).getTime()) / 1000),
    3600,
    "Reset-Link muss eine Stunde gelten",
  );

  // Grenzfall: eine Sekunde vor Ablauf gilt der Link noch.
  run(
    `UPDATE auth_tokens SET expires_at = ? WHERE id = ?`,
    new Date(new Date(row.created_at).getTime() + 3600_000 - 1000).toISOString(),
    row.id,
  );
  const justInTime = await resetPassword(
    resetRequest(latestToken(), "GrenzfallPasswort123", "203.0.113.50"),
  );
  assert.equal(justInTime.status, 200, "kurz vor Ablauf muss der Link gelten");

  // Eine Sekunde nach Ablauf gilt er nicht mehr; die gespeicherte Frist bleibt 3600 s.
  await forgotPassword(forgotRequest(EMAIL, "203.0.113.51"));
  const expiredRow = get<{ id: string }>(
    `SELECT id FROM auth_tokens WHERE kind = 'reset_password' ORDER BY rowid DESC LIMIT 1`,
  );
  assert.ok(expiredRow);
  run(
    `UPDATE auth_tokens SET created_at = ?, expires_at = ? WHERE id = ?`,
    new Date(Date.now() - 3601_000).toISOString(),
    new Date(Date.now() - 1000).toISOString(),
    expiredRow.id,
  );
  const tooLate = await resetPassword(
    resetRequest(latestToken(), "GrenzfallPasswort456", "203.0.113.51"),
  );
  assert.equal(tooLate.status, 400, "nach Ablauf darf der Link nicht mehr gelten");
});

await check("Reset-Anfragen sind auf zehn pro Stunde begrenzt", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  for (let attempt = 1; attempt <= 10; attempt++) {
    const response = await forgotPassword(
      forgotRequest(`unbekannt${attempt}@example.test`, "203.0.113.90"),
    );
    assert.equal(response.status, 200, `Anfrage ${attempt} von 10 muss durchgehen`);
  }
  const limited = await forgotPassword(forgotRequest("unbekannt11@example.test", "203.0.113.90"));
  assert.equal(limited.status, 429, "die elfte Anfrage derselben Adresse wird begrenzt");
  const retryAfter = Number(limited.headers.get("retry-after"));
  assert.ok(
    retryAfter >= 3500 && retryAfter <= 3600,
    `retry-after muss im Stundenfenster liegen, war ${retryAfter}`,
  );
});

function sessions(id: string) {
  return get<{ c: number }>(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?`, id)?.c ?? 0;
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
