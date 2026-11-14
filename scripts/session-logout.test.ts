/**
 * Logout und Sitzungsablauf: Cookie löschen, Sitzung entfernen, andere Geräte
 * unberührt lassen und abgelaufene Sitzungen sperren.
 *
 * Aufruf: npm run test:session-logout
 */

import assert from "node:assert/strict";
import { lastSetSession, sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { get, nowIso, run } = await import("@/lib/db");
const { hashPassword, sha256 } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const { POST: logout } = await import("@/app/api/auth/logout/route");
const { releaseEmailSuppressionAction, retryEmailAction } = await import("@/lib/actions/admin");

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

function seedAdmin() {
  const at = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
       created_at, updated_at)
     VALUES ('admin-1', 'admin@example.test', ?, 'Test', 'de', 'admin', 1, ?, ?)`,
    PASSWORD_HASH,
    at,
    at,
  );
  run(
    `INSERT INTO mfa_secrets (user_id, secret, confirmed_at, created_at)
     VALUES ('admin-1', 'JBSWY3DPEHPK3PXP', ?, ?)`,
    at,
    at,
  );
}

function logoutRequest(origin?: string) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "streaminghub.org",
  };
  if (origin !== undefined) headers.origin = origin;
  return new Request("https://streaminghub.org/api/auth/logout", {
    method: "POST",
    headers,
  });
}

function sessionCount(userId = "admin-1") {
  return get<{ c: number }>(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?`, userId)?.c ?? 0;
}

function hasSession(token: string) {
  return Boolean(get(`SELECT 1 FROM sessions WHERE token_hash = ?`, sha256(token)));
}

function expire(token: string) {
  const past = new Date(Date.now() - 60_000).toISOString();
  run(`UPDATE sessions SET expires_at = ? WHERE token_hash = ?`, past, sha256(token));
}

async function actionRedirect(action: "release" | "retry"): Promise<string> {
  try {
    if (action === "release") {
      const form = new FormData();
      form.set("email", "kunde@example.test");
      await releaseEmailSuppressionAction(form);
    } else {
      const form = new FormData();
      form.set("emailId", "mail-1");
      await retryEmailAction(form);
    }
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Aktion muss weiterleiten");
    return error.digest;
  }
  return "";
}

seedAdmin();

await check("Gueltige Sitzung erreicht den Adminbereich", async () => {
  sessionToken.value = await createSession("admin-1");
  const digest = await actionRedirect("retry");
  assert.match(digest, /\/admin\/emails\?ok=/);
});

await check("Logout entfernt Sitzung und loescht das Cookie", async () => {
  lastSetSession.value = "unveraendert";
  const token = sessionToken.value as string;
  assert.equal(hasSession(token), true);

  const response = await logout(logoutRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(hasSession(token), false, "Sitzungszeile muss geloescht sein");
  assert.equal(lastSetSession.value, "", "Cookie muss geleert werden");
  assert.equal(lastSetSession.options?.maxAge, 0);
});

await check("Nach dem Logout ist der Adminbereich gesperrt", async () => {
  const digest = await actionRedirect("retry");
  assert.match(digest, /\/login\?next=/);
});

await check("Logout loescht nur die eigene Sitzung", async () => {
  const first = await createSession("admin-1");
  const second = await createSession("admin-1");
  assert.equal(sessionCount(), 2);

  sessionToken.value = first;
  const response = await logout(logoutRequest());
  assert.equal(response.status, 200);
  assert.equal(hasSession(first), false);
  assert.equal(hasSession(second), true, "andere Geraete bleiben angemeldet");

  sessionToken.value = second;
  const digest = await actionRedirect("retry");
  assert.match(digest, /\/admin\/emails\?ok=/);
});

await check("Logout ohne Sitzung antwortet trotzdem ok", async () => {
  sessionToken.value = null;
  const response = await logout(logoutRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

await check("Fremde Herkunft darf nicht ausloggen", async () => {
  const token = await createSession("admin-1");
  sessionToken.value = token;
  const response = await logout(logoutRequest("https://evil.example"));
  assert.equal(response.status, 403);
  assert.equal(hasSession(token), true, "Sitzung bleibt bestehen");
});

await check("Abgelaufene Sitzung wird gesperrt und geloescht", async () => {
  const token = await createSession("admin-1");
  sessionToken.value = token;
  expire(token);

  const digest = await actionRedirect("retry");
  assert.match(digest, /\/login\?next=/);
  assert.equal(hasSession(token), false, "abgelaufene Sitzung wird aufgeraeumt");
});

await check("Geloeschter Nutzer verliert die Sitzung", async () => {
  const token = await createSession("admin-1");
  sessionToken.value = token;
  run(`UPDATE users SET disabled_at = ? WHERE id = 'admin-1'`, nowIso());

  const digest = await actionRedirect("retry");
  assert.match(digest, /\/login\?next=/);
  assert.equal(hasSession(token), true, "die Zeile bleibt, gilt aber nicht mehr");

  run(`UPDATE users SET disabled_at = NULL WHERE id = 'admin-1'`);
  const again = await actionRedirect("retry");
  assert.match(again, /\/admin\/emails\?ok=/, "nach Reaktivierung gilt die Sitzung wieder");
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
