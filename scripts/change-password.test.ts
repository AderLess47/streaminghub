/**
 * Passwort ändern im Kundenkonto: aktuelles Passwort, Regeln, Hash-Wechsel,
 * Abmeldung anderer Sitzungen und Audit.
 *
 * Aufruf: npm run test:change-password
 */

import assert from "node:assert/strict";
import { sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { get, nowIso, run } = await import("@/lib/db");
const { hashPassword, sha256, verifyPassword } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const { changePasswordAction } = await import("@/lib/actions/dashboard");
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

function seedUser() {
  const at = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
       created_at, updated_at)
     VALUES ('kunde-1', ?, ?, 'Test', 'de', 'customer', 1, ?, ?)`,
    EMAIL,
    hashPassword(OLD_PASSWORD),
    at,
    at,
  );
}

function passwordHash() {
  return get<{ password_hash: string }>(
    `SELECT password_hash FROM users WHERE id = 'kunde-1'`,
  )?.password_hash;
}

function sessions() {
  return get<{ c: number }>(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = 'kunde-1'`)?.c ?? 0;
}

function hasSession(token: string) {
  return Boolean(get(`SELECT 1 FROM sessions WHERE token_hash = ?`, sha256(token)));
}

function form(currentPassword: string, newPassword: string) {
  const data = new FormData();
  data.set("currentPassword", currentPassword);
  data.set("newPassword", newPassword);
  return data;
}

function loginRequest(password: string) {
  return new Request("https://streaminghub.org/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "streaminghub.org",
      "x-forwarded-for": "203.0.113.80",
    },
    body: JSON.stringify({ email: EMAIL, password }),
  });
}

seedUser();
const originalHash = passwordHash() as string;

await check("Ohne Anmeldung kein Passwortwechsel", async () => {
  sessionToken.value = null;
  let digest = "";
  try {
    await changePasswordAction(null, form(OLD_PASSWORD, NEW_PASSWORD));
  } catch (error) {
    assert.ok(error instanceof RedirectError);
    digest = error.digest;
  }
  assert.match(digest, /\/login\?next=/);
  assert.equal(passwordHash(), originalHash);
});

await check("Falsches aktuelles Passwort wird abgelehnt", async () => {
  sessionToken.value = await createSession("kunde-1");
  run("DELETE FROM audit_log");

  const result = await changePasswordAction(null, form("falsch123", NEW_PASSWORD));
  assert.equal(result?.ok, false);
  assert.equal(result?.fieldErrors?.currentPassword, "Das aktuelle Passwort ist falsch.");
  assert.equal(passwordHash(), originalHash);
  assert.equal(
    get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'account.password_changed'`)?.c,
    0,
  );
});

await check("Zu kurzes neues Passwort wird abgelehnt", async () => {
  const result = await changePasswordAction(null, form(OLD_PASSWORD, "kurz1"));
  assert.equal(result?.ok, false);
  assert.ok(result?.fieldErrors?.newPassword);
  assert.equal(passwordHash(), originalHash);
});

await check("Wechsel setzt den Hash und meldet andere Sitzungen ab", async () => {
  run("DELETE FROM audit_log");
  const other = await createSession("kunde-1");
  assert.equal(sessions(), 2);

  const current = sessionToken.value as string;
  const result = await changePasswordAction(null, form(OLD_PASSWORD, NEW_PASSWORD));
  assert.equal(result?.ok, true);
  assert.match(result?.message ?? "", /Passwort geändert/);

  const updated = passwordHash() as string;
  assert.notEqual(updated, originalHash);
  assert.equal(verifyPassword(NEW_PASSWORD, updated), true);
  assert.equal(verifyPassword(OLD_PASSWORD, updated), false);

  assert.equal(sessions(), 1, "nur die eigene Sitzung bleibt");
  assert.equal(hasSession(current), true);
  assert.equal(hasSession(other), false);

  const audit = get<{ action: string; actor_id: string }>(
    `SELECT action, actor_id FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "account.password_changed");
  assert.equal(audit?.actor_id, "kunde-1");
});

await check("Login mit altem Passwort scheitert, neues funktioniert", async () => {
  run("DELETE FROM rate_limits");
  const oldLogin = await login(loginRequest(OLD_PASSWORD));
  assert.equal(oldLogin.status, 400);

  const newLogin = await login(loginRequest(NEW_PASSWORD));
  assert.equal(newLogin.status, 200);
  const body = (await newLogin.json()) as { ok: boolean };
  assert.equal(body.ok, true);
});

await check("Altes Passwort bleibt nach dem Wechsel ungueltig", async () => {
  run("DELETE FROM rate_limits");
  const wrongOld = await changePasswordAction(null, form(OLD_PASSWORD, "DrittesPasswort789"));
  assert.equal(wrongOld?.ok, false);
  assert.equal(verifyPassword(NEW_PASSWORD, passwordHash() as string), true);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
