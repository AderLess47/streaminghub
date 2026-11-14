/**
 * MFA-Login für Staff: Anmeldung mit ausstehendem zweiten Faktor, gesperrter
 * Adminzugriff, TOTP, Recovery-Code, Fehlversuche und Rate-Limit.
 *
 * Aufruf: npm run test:mfa-login
 */

import assert from "node:assert/strict";
import { lastSetSession, sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { get, nowIso, run } = await import("@/lib/db");
const { hashPassword, sha256 } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const { totpCode } = await import("@/lib/totp");
const { POST: login } = await import("@/app/api/auth/login/route");
const { POST: mfa } = await import("@/app/api/auth/mfa/route");
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

const PASSWORD = "SicheresPasswort123";
const EMAIL = "admin@example.test";
const SECRET = "JBSWY3DPEHPK3PXP";
const PASSWORD_HASH = hashPassword(PASSWORD);

function seedStaff(
  email = EMAIL,
  options: { role?: "admin" | "support"; recoveryCodes?: string[]; mfaConfirmed?: boolean } = {},
) {
  const at = nowIso();
  const id = `user-${email.split("@")[0]}`;
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
       created_at, updated_at)
     VALUES (?, ?, ?, 'Test', 'de', ?, 1, ?, ?)`,
    id,
    email,
    PASSWORD_HASH,
    options.role ?? "admin",
    at,
    at,
  );
  run(
    `INSERT INTO mfa_secrets (user_id, secret, confirmed_at, recovery_codes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    SECRET,
    options.mfaConfirmed === false ? null : at,
    JSON.stringify(options.recoveryCodes ?? []),
    at,
  );
  return id;
}

function post(path: string, body: unknown, options: { ip?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "streaminghub.org",
    "x-forwarded-for": options.ip ?? "192.0.2.10",
  };
  if (options.origin !== undefined) headers.origin = options.origin;
  return new Request(`https://streaminghub.org${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const loginRequest = (email = EMAIL, ip = "192.0.2.10") =>
  post("/api/auth/login", { email, password: PASSWORD }, { ip });

const mfaRequest = (code: string, options: { ip?: string; origin?: string } = {}) =>
  post("/api/auth/mfa", { code }, { ip: options.ip ?? "192.0.2.10", origin: options.origin });

function sessionState(token: string) {
  return get<{ mfa_ok: number }>(`SELECT mfa_ok FROM sessions WHERE token_hash = ?`, sha256(token));
}

function adminAction() {
  const form = new FormData();
  form.set("email", "kunde@example.test");
  return releaseEmailSuppressionAction(form);
}

async function actionRedirect(): Promise<string> {
  try {
    await adminAction();
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Aktion muss weiterleiten");
    return error.digest;
  }
  return "";
}

const adminId = seedStaff();
seedStaff("support@example.test", { role: "support" });
seedStaff("ohne-mfa@example.test", { mfaConfirmed: false });

await check("Staff-Login verlangt den zweiten Faktor", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM audit_log");
  sessionToken.value = null;
  lastSetSession.value = null;

  const response = await login(loginRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, mfaRequired: true });

  const token = lastSetSession.value;
  assert.ok(token, "Login muss ein Session-Cookie setzen");
  sessionToken.value = token;
  assert.equal(sessionState(token)?.mfa_ok, 0);
});

await check("Ohne zweiten Faktor bleibt der Adminzugriff gesperrt", async () => {
  const digest = await actionRedirect();
  assert.match(digest, /\/admin\/login\?step=mfa/);
  assert.equal(
    get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'admin.email_suppression_released'`)?.c,
    0,
  );
});

await check("Falscher Code wird abgelehnt und protokolliert", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM audit_log");
  const response = await mfa(mfaRequest("000000"));
  assert.equal(response.status, 400);

  const audit = get<{ action: string; actor_id: string }>(
    `SELECT action, actor_id FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "auth.mfa_failed");
  assert.equal(audit?.actor_id, adminId);
  assert.equal(sessionState(sessionToken.value as string)?.mfa_ok, 0);
});

await check("Gueltiger TOTP entsperrt die Sitzung", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM audit_log");
  const response = await mfa(mfaRequest(totpCode(SECRET)));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, redirectTo: "/admin" });

  const audit = get<{ action: string }>(
    `SELECT action FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "auth.mfa_success");
  assert.equal(sessionState(sessionToken.value as string)?.mfa_ok, 1);
});

await check("Nach dem zweiten Faktor greift der Adminzugriff", async () => {
  const digest = await actionRedirect();
  assert.match(digest, /\/admin\/emails\?ok=suppression/);
});

await check("Recovery-Code funktioniert genau einmal", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM audit_log");
  seedStaff("recovery@example.test", { recoveryCodes: ["AAAAA-BBBBB"] });

  sessionToken.value = await createSession(
    get<{ id: string }>(`SELECT id FROM users WHERE email = 'recovery@example.test'`)!.id,
    { mfaOk: false },
  );

  const first = await mfa(mfaRequest(" aaaaa-bbbbb "));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { ok: true, redirectTo: "/admin" });

  const codes = JSON.parse(
    get<{ recovery_codes: string }>(`SELECT recovery_codes FROM mfa_secrets WHERE user_id = ?`, "user-recovery")!
      .recovery_codes,
  );
  assert.deepEqual(codes, [], "verbrauchter Code muss entfernt werden");

  sessionToken.value = await createSession("user-recovery", { mfaOk: false });
  const second = await mfa(mfaRequest("AAAAA-BBBBB"));
  assert.equal(second.status, 400);
});

await check("Support wird nach MFA nach /admin geleitet", async () => {
  run("DELETE FROM rate_limits");
  sessionToken.value = await createSession("user-support", { mfaOk: false });
  const response = await mfa(mfaRequest(totpCode(SECRET)));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, redirectTo: "/admin" });
});

await check("Ohne angemeldete Sitzung 401", async () => {
  run("DELETE FROM rate_limits");
  sessionToken.value = null;
  const response = await mfa(mfaRequest(totpCode(SECRET)));
  assert.equal(response.status, 401);
});

await check("Konto ohne eingerichtete MFA erhaelt einen Hinweis", async () => {
  run("DELETE FROM rate_limits");
  sessionToken.value = await createSession("user-ohne-mfa");
  const response = await mfa(mfaRequest(totpCode(SECRET)));
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { message?: string } };
  assert.match(body.error?.message ?? "", /keine MFA/);
});

await check("Fremde Herkunft wird abgelehnt", async () => {
  run("DELETE FROM rate_limits");
  sessionToken.value = await createSession(adminId, { mfaOk: false });
  const response = await mfa(mfaRequest(totpCode(SECRET), { origin: "https://evil.example" }));
  assert.equal(response.status, 403);
});

await check("Neun Fehlversuche werden begrenzt", async () => {
  run("DELETE FROM rate_limits");
  sessionToken.value = await createSession(adminId, { mfaOk: false });
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await mfa(mfaRequest("000000", { ip: `192.0.2.${30 + attempt}` }));
    assert.equal(response.status, 400, `Versuch ${attempt + 1}`);
  }
  const limited = await mfa(mfaRequest(totpCode(SECRET), { ip: "192.0.2.50" }));
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
