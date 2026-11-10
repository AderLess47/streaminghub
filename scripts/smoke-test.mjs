#!/usr/bin/env node
/**
 * End-to-end smoke test against a running StreamingHub instance.
 *
 *   npm start &
 *   npm run smoke
 *
 * Requires the seeded administrator (ADMIN_EMAIL / ADMIN_PASSWORD) and access to
 * the SQLite database file to enrol a known TOTP secret for the admin flow.
 */
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");

// A full end-to-end run intentionally repeats pairing/registration flows. Clear
// only the rate-limit buckets this suite consumes so repeated local runs stay
// meaningful; the app's own limits are still exercised between these keys.
try {
  const setupDb = new DatabaseSync(dbPath);
  setupDb.exec(
    "DELETE FROM rate_limits WHERE key LIKE 'pairing:ip%' OR key LIKE 'register:ip%' OR key LIKE 'contact:ip%' OR key LIKE 'forgot:%' OR key LIKE 'login:%'",
  );
  setupDb.close();
} catch {
  /* database not created yet – the first request initialises it */
}
const cookies = new Map();
let failures = 0;
let checks = 0;

function ok(condition, label, detail = "") {
  checks++;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` – ${detail}` : ""}`);
  }
}

/** Removes serialised script payloads (i18n dictionaries) before text assertions. */
function visible(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "");
}

function cookieHeader() {
  return [...cookies.entries()].map(([key, value]) => `${key}=${value}`).join("; ");
}

function storeCookies(response) {
  const list = response.headers.getSetCookie?.() ?? [];
  for (const raw of list) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (value) cookies.set(name, value);
    else cookies.delete(name);
  }
}

async function request(method, route, options = {}) {
  const headers = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.cookie !== false && cookies.size > 0) headers.cookie = cookieHeader();
  if (options.origin !== false) headers.origin = BASE;
  const response = await fetch(`${BASE}${route}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    redirect: "manual",
  });
  storeCookies(response);
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: response.status, text, json, headers: response.headers };
}

/* --------------------------------- TOTP ---------------------------------- */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Decode(secret) {
  let bits = "";
  for (const char of secret.toUpperCase().replace(/=+$/, "")) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) continue;
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(binary % 1000000).padStart(6, "0");
}

/* --------------------------------- Tests --------------------------------- */
async function main() {
  console.log(`StreamingHub smoke test → ${BASE}\n`);

  console.log("Public pages");
  const pages = [
    ["/", "Deine Inhalte. Dein Erlebnis."],
    ["/premium", "Premium"],
    ["/download", "Download"],
    ["/activate", "Kopplungscode"],
    ["/help", "Hilfe-Center"],
    ["/faq", "Häufige Fragen"],
    ["/contact", "Kontakt"],
    ["/status", "Systemstatus"],
    ["/imprint", "Impressum"],
    ["/privacy", "Datenschutzerklärung"],
    ["/terms", "Nutzungsbedingungen"],
    ["/subscription-terms", "Abonnementbedingungen"],
    ["/withdrawal", "Widerruf"],
    ["/login", "Anmelden"],
    ["/register", "Konto erstellen"],
    ["/docs/api", "App-API"],
    ["/admin/login", "Administration"],
    ["/robots.txt", "sitemap"],
    ["/sitemap.xml", "<urlset"],
  ];
  for (const [route, needle] of pages) {
    const response = await request("GET", route);
    ok(response.status === 200 && response.text.includes(needle), `${route} (${response.status})`);
  }

  console.log("\nRoute protection");
  cookies.clear();
  const dashboardAnon = await request("GET", "/dashboard");
  ok([302, 307, 308].includes(dashboardAnon.status), `unauthenticated /dashboard redirects (${dashboardAnon.status})`);
  const adminAnon = await request("GET", "/admin");
  ok([302, 307, 308].includes(adminAnon.status), `unauthenticated /admin redirects (${adminAnon.status})`);

  console.log("\nRegistration, session and dashboard");
  const email = `smoke+${Date.now()}@example.com`;
  const password = "SmokeTest-2026!";
  const register = await request("POST", "/api/auth/register", {
    body: {
      displayName: "Smoke Tester",
      email,
      password,
      locale: "de",
      acceptTerms: true,
      marketingOptIn: false,
    },
  });
  ok(register.status === 200 && register.json?.ok, `register (${register.status})`, register.text.slice(0, 160));
  ok(Boolean(cookies.get("sh_session")), "session cookie issued");
  const dashboard = await request("GET", "/dashboard");
  ok(dashboard.status === 200 && dashboard.text.includes("Smoke Tester"), `dashboard renders (${dashboard.status})`);
  ok(visible(dashboard.text).includes("Bitte bestätige deine E-Mail-Adresse"), "unverified email banner shown");

  const verifyLink = register.json?.devLink;
  if (!verifyLink) console.log("  ↷ verification link hidden (production email mode) — skipped");
  if (verifyLink) {
    const parsed = new URL(verifyLink);
    const verify = await request("GET", `${parsed.pathname}${parsed.search}`);
    ok(
      verify.status === 307 && (verify.headers.get("location") ?? "").includes("verified=1"),
      `email verification link works (${verify.status})`,
    );
    const afterVerify = await request("GET", "/dashboard");
    ok(!visible(afterVerify.text).includes("Bitte bestätige deine E-Mail-Adresse"), "verified banner removed");
  }

  console.log("\nPairing flow (app → website → app)");
  const pairing = await request("POST", "/api/v1/pairing/request", {
    cookie: false,
    origin: false,
    body: { deviceName: "Smoke TV", platform: "firetv", appVersion: "9.9.9" },
  });
  ok(pairing.status === 201 && pairing.json?.code, `pairing request (${pairing.status})`, pairing.text.slice(0, 160));
  const { code, requestId, pollToken } = pairing.json ?? {};

  const claim = await request("POST", "/api/devices/activate", {
    body: { code, deviceName: "Smoke TV" },
  });
  ok(claim.status === 200 && claim.json?.ok, `activate device (${claim.status})`, claim.text.slice(0, 200));

  const claimAgain = await request("POST", "/api/devices/activate", { body: { code } });
  ok(claimAgain.status === 409, `code is single-use (${claimAgain.status})`);

  const status = await request("GET", `/api/v1/pairing/status?requestId=${requestId}`, {
    cookie: false,
    origin: false,
    headers: { authorization: `Bearer ${pollToken}` },
  });
  ok(status.status === 200 && status.json?.status === "claimed", `app receives claimed status (${status.status})`);
  const activationToken = status.json?.activationToken;
  ok(Boolean(activationToken), "activation token issued");

  const me = await request("GET", "/api/v1/me", {
    cookie: false,
    origin: false,
    headers: { authorization: `Bearer ${activationToken}` },
  });
  ok(me.status === 200 && me.json?.device?.activationStatus === "active", `device API status (${me.status})`);
  ok(me.json?.subscription?.premiumActive === false, "premium is not faked");

  const dashboardWithDevice = await request("GET", "/dashboard");
  ok(dashboardWithDevice.text.includes("Smoke TV"), "device visible in dashboard");

  for (let index = 2; index <= 3; index++) {
    const extra = await request("POST", "/api/v1/pairing/request", {
      cookie: false,
      origin: false,
      body: { deviceName: `Smoke TV ${index}`, platform: "android" },
    });
    const extraClaim = await request("POST", "/api/devices/activate", {
      body: { code: extra.json?.code },
    });
    if (index === 2) {
      ok(extraClaim.status === 200, `second device allowed on free plan (${extraClaim.status})`);
    } else {
      ok(extraClaim.status === 409, `free device limit enforced (${extraClaim.status})`, extraClaim.text.slice(0, 160));
    }
  }

  console.log("\nContact, export, billing guard");
  const contact = await request("POST", "/api/contact", {
    body: {
      name: "Smoke Tester",
      email,
      subject: "Smoke test",
      message: "This is an automated end-to-end smoke test message.",
      privacyAccepted: true,
      website: "",
      renderedAt: Date.now() - 5000,
    },
  });
  ok(contact.status === 200 && contact.json?.ok, `contact form (${contact.status})`, contact.text.slice(0, 160));

  const exportResponse = await request("GET", "/api/account/export");
  ok(exportResponse.status === 200 && exportResponse.headers.get("content-disposition")?.includes("attachment"), `data export (${exportResponse.status})`);

  const checkout = await request("POST", "/api/subscription/checkout", { body: {} });
  ok(
    checkout.status === 503 && checkout.json?.error?.code === "not_configured",
    `checkout reports not_configured (${checkout.status})`,
    checkout.text.slice(0, 160),
  );

  console.log("\nInternationalisation");
  const locale = await request("POST", "/api/locale", { body: { locale: "en" } });
  ok(locale.status === 200, "locale switch API");
  const english = await request("GET", "/");
  ok(english.text.includes("Your content. Your experience."), "English homepage renders");
  const arabic = await request("POST", "/api/locale", { body: { locale: "ar" } });
  ok(arabic.status === 200, "RTL locale accepted");
  const rtl = await request("GET", "/");
  ok(rtl.text.includes('dir="rtl"'), "Arabic renders with RTL direction");
  await request("POST", "/api/locale", { body: { locale: "de" } });

  console.log("\nPassword reset");
  const forgot = await request("POST", "/api/auth/forgot-password", { body: { email } });
  ok(forgot.status === 200, `forgot-password accepted (${forgot.status})`);
  if (!forgot.json?.devLink) console.log("  ↷ reset link hidden (production email mode) — skipped");
  if (forgot.json?.devLink) {
    const token = new URL(forgot.json.devLink).searchParams.get("token");
    const newPassword = "SmokeTest-2026-New!";
    const reset = await request("POST", "/api/auth/reset-password", {
      body: { token, password: newPassword },
    });
    ok(reset.status === 200, `password reset accepted (${reset.status})`, reset.text.slice(0, 160));

    cookies.clear();
    const oldLogin = await request("POST", "/api/auth/login", { body: { email, password } });
    ok(oldLogin.status === 400, `old password rejected (${oldLogin.status})`);
    const newLogin = await request("POST", "/api/auth/login", {
      body: { email, password: newPassword },
    });
    ok(newLogin.status === 200 && newLogin.json?.ok, `login with new password (${newLogin.status})`);
  }

  console.log("\nAdmin access (RBAC + MFA)");
  cookies.clear();
  const adminEmail = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD ?? "";
  if (!adminEmail || !adminPassword) {
    console.warn("  ! ADMIN_EMAIL/ADMIN_PASSWORD not set – skipping admin flow");
  } else {
    const db = new DatabaseSync(dbPath);
    const admin = db.prepare("SELECT id FROM users WHERE email = ?").get(adminEmail);
    if (!admin) {
      console.warn("  ! seeded admin not found – skipping admin flow");
    } else {
      const secret = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
      db.prepare(
        `INSERT INTO mfa_secrets (user_id, secret, confirmed_at, recovery_codes, created_at)
         VALUES (?, ?, ?, '[]', ?)
         ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, confirmed_at = excluded.confirmed_at`,
      ).run(admin.id, secret, new Date().toISOString(), new Date().toISOString());
      db.close();

      const adminLogin = await request("POST", "/api/auth/login", {
        body: { email: adminEmail, password: adminPassword },
      });
      ok(adminLogin.status === 200 && adminLogin.json?.mfaRequired === true, `admin login requires MFA (${adminLogin.status})`);

      const blocked = await request("GET", "/admin");
      ok([302, 307].includes(blocked.status), `admin blocked before MFA (${blocked.status})`);

      const mfa = await request("POST", "/api/auth/mfa", { body: { code: totp(secret) } });
      ok(mfa.status === 200 && mfa.json?.ok, `MFA verified (${mfa.status})`, mfa.text.slice(0, 160));

      for (const route of ["/admin", "/admin/customers", "/admin/devices", "/admin/subscriptions", "/admin/pairing", "/admin/tickets", "/admin/emails", "/admin/content", "/admin/roles", "/admin/status", "/admin/audit"]) {
        const response = await request("GET", route);
        ok(response.status === 200, `${route} (${response.status})`);
      }
      const customers = await request("GET", "/admin/customers");
      ok(customers.text.includes(email), "new customer visible in admin");
    }
  }

  console.log(`\n${checks - failures}/${checks} checks passed.`);
  if (failures > 0) {
    console.error(`${failures} check(s) failed.`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Smoke test crashed:", error);
  process.exit(1);
});
