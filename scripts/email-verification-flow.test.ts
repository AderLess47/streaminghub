/**
 * E-Mail-Verifizierung von der Registrierung bis zum ersten Login:
 * Registrierung, Verifikationsmail, Link, Einmalverwendung, erneuter Versand.
 *
 * Aufruf: npm run test:email-verification
 */

import assert from "node:assert/strict";
import { sessionToken } from "./fakes/next-headers.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { all, get, nowIso, run } = await import("@/lib/db");
const { createSession } = await import("@/lib/session");
const { issueAuthToken } = await import("@/lib/auth");
const { POST: register } = await import("@/app/api/auth/register/route");
const { GET: verify } = await import("@/app/api/auth/verify/route");
const { POST: resendVerification } = await import("@/app/api/auth/resend-verification/route");
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

const PASSWORD = "SicheresPasswort123";
const EMAIL = "neu@example.test";

function post(path: string, body: unknown, options: { ip?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "streaminghub.org",
    "x-forwarded-for": options.ip ?? "198.51.100.10",
    "user-agent": "test-suite",
  };
  if (options.origin !== undefined) headers.origin = options.origin;
  return new Request(`https://streaminghub.org${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

function registerRequest(
  email = EMAIL,
  options: { ip?: string; password?: string; displayName?: string; origin?: string } = {},
) {
  return post(
    "/api/auth/register",
    {
      email,
      password: options.password ?? PASSWORD,
      displayName: options.displayName ?? "Neue Kundin",
      locale: "de",
      acceptTerms: true,
    },
    options,
  );
}

function verificationMails() {
  return all<{ body_text: string; status: string; to_email: string }>(
    `SELECT body_text, status, to_email FROM outbox_emails WHERE kind = 'verify_email' ORDER BY rowid`,
  ).map((row) => ({ ...row }));
}

function latestVerifyToken(): string {
  const mails = verificationMails();
  assert.ok(mails.length > 0, "keine Verifikationsmail geschrieben");
  const match = mails[mails.length - 1].body_text.match(/token=([A-Za-z0-9_%.-]+)/);
  assert.ok(match, "kein Token in der Mail");
  return decodeURIComponent(match[1]);
}

function userRow(email = EMAIL) {
  return get<{ id: string; email_verified: number }>(
    `SELECT id, email_verified FROM users WHERE email = ?`,
    email,
  );
}

function verifyUrl(token: string) {
  return `https://streaminghub.org/api/auth/verify?token=${encodeURIComponent(token)}`;
}

await check("Registrierung legt Konto, Mail und Sitzung an", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  run("DELETE FROM audit_log");

  const response = await register(registerRequest());
  const body = (await response.json()) as {
    ok: boolean;
    userId: string;
    emailVerificationRequired: boolean;
    redirectTo: string;
    delivered: boolean;
  };
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.emailVerificationRequired, true);
  assert.equal(body.redirectTo, "/dashboard");
  assert.equal(body.delivered, false, "ohne Anbieter nur in der Outbox");

  const user = userRow();
  assert.ok(user);
  assert.equal(user.email_verified, 0);
  assert.equal(body.userId, user.id);

  const mails = verificationMails();
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to_email, EMAIL);
  assert.match(mails[0].body_text, /\/api\/auth\/verify\?token=/);

  const session = get<{ c: number }>(`SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?`, user.id);
  assert.equal(session?.c, 1, "nach der Registrierung ist man angemeldet");

  const audit = get<{ action: string }>(
    `SELECT action FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "auth.register");
});

await check("Login vor der Verifizierung meldet emailVerified=false", async () => {
  run("DELETE FROM rate_limits");
  const response = await login(
    post("/api/auth/login", { email: EMAIL, password: PASSWORD }, { ip: "198.51.100.30" }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { emailVerified: boolean };
  assert.equal(body.emailVerified, false);
});

await check("Verifikationslink bestaetigt die Adresse", async () => {
  const token = latestVerifyToken();
  const response = await verify(new Request(verifyUrl(token)));
  assert.equal(response.status, 307);
  const location = response.headers.get("location") ?? "";
  assert.match(location, /\/login\?verified=1/);
  assert.equal(userRow()?.email_verified, 1);

  const audit = get<{ action: string }>(
    `SELECT action FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "auth.email_verified");
});

await check("Verifikationslink ist nur einmal gueltig", async () => {
  const token = latestVerifyToken();
  const response = await verify(new Request(verifyUrl(token)));
  const location = response.headers.get("location") ?? "";
  assert.match(location, /verified=0/);
});

await check("Login nach der Verifizierung meldet emailVerified=true", async () => {
  run("DELETE FROM rate_limits");
  const response = await login(
    post("/api/auth/login", { email: EMAIL, password: PASSWORD }, { ip: "198.51.100.31" }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { emailVerified: boolean; redirectTo: string };
  assert.equal(body.emailVerified, true);
  assert.equal(body.redirectTo, "/dashboard");
});

await check("Doppelte Registrierung wird abgelehnt", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  const response = await register(registerRequest(EMAIL, { ip: "198.51.100.11" }));
  assert.equal(response.status, 409);
  const body = (await response.json()) as { error?: { code?: string } };
  assert.equal(body.error?.code, "conflict");
  assert.equal(verificationMails().length, 0);
});

await check("Fremde Herkunft wird abgelehnt", async () => {
  run("DELETE FROM rate_limits");
  const response = await register(
    registerRequest("fremd@example.test", { ip: "198.51.100.12", origin: "https://evil.example" }),
  );
  assert.equal(response.status, 403);
  assert.equal(userRow("fremd@example.test"), undefined);
});

await check("Schwaches Passwort wird abgelehnt", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  const response = await register(
    registerRequest("schwach@example.test", { ip: "198.51.100.13", password: "kurz1" }),
  );
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error?: { fields?: { path: string }[] } };
  assert.equal(body.error?.fields?.[0]?.path, "password");
  assert.equal(verificationMails().length, 0);
});

await check("Abgelaufener Verifikationslink bestaetigt nichts", async () => {
  const user = userRow();
  assert.ok(user);
  run(`UPDATE users SET email_verified = 0 WHERE id = ?`, user.id);
  const { raw } = issueAuthToken(user.id, "verify_email", -60);
  const response = await verify(new Request(verifyUrl(raw)));
  assert.match(response.headers.get("location") ?? "", /verified=0/);
  assert.equal(userRow()?.email_verified, 0);
});

await check("Erneuter Versand ohne Anmeldung wird abgelehnt", async () => {
  run("DELETE FROM rate_limits");
  sessionToken.value = null;
  const response = await resendVerification(
    post("/api/auth/resend-verification", {}, { ip: "198.51.100.14" }),
  );
  assert.equal(response.status, 401);
});

await check("Erneuter Versand mailt einen neuen Link", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  const user = userRow();
  assert.ok(user);
  sessionToken.value = await createSession(user.id);

  const response = await resendVerification(
    post("/api/auth/resend-verification", {}, { ip: "198.51.100.15" }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { ok: boolean; delivered: boolean };
  assert.equal(body.ok, true);
  assert.equal(verificationMails().length, 1);

  const token = latestVerifyToken();
  const verified = await verify(new Request(verifyUrl(token)));
  assert.match(verified.headers.get("location") ?? "", /verified=1/);
  assert.equal(userRow()?.email_verified, 1);
});

await check("Bereits verifiziert: kein erneuter Versand", async () => {
  run("DELETE FROM rate_limits");
  run("DELETE FROM outbox_emails");
  const response = await resendVerification(
    post("/api/auth/resend-verification", {}, { ip: "198.51.100.16" }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, alreadyVerified: true });
  assert.equal(verificationMails().length, 0);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
