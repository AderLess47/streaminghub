#!/usr/bin/env node
/**
 * Live-Prüfung des Admin-Bereichs ohne Passwort im Chat.
 *
 * Meldet sich mit einem eigenen Prüf-Konto an (E-Mail, Passwort und
 * TOTP-Secret kommen aus der Umgebung bzw. aus GitHub-Secrets) und prüft,
 * dass Zähler und Widerrufsliste auf der laufenden Seite erscheinen.
 *
 *   ADMIN_SMOKE_EMAIL / ADMIN_SMOKE_PASSWORD / ADMIN_SMOKE_TOTP_SECRET
 *   SMOKE_BASE_URL (Standard: https://streaminghub.org)
 *
 * Das Skript druckt nie Passwort, Secret oder Cookie – nur Ergebnisse.
 */
import { createHmac } from "node:crypto";

const BASE = (process.env.SMOKE_BASE_URL ?? "https://streaminghub.org").replace(/\/+$/, "");
const EMAIL = process.env.ADMIN_SMOKE_EMAIL?.trim() ?? "";
const PASSWORD = process.env.ADMIN_SMOKE_PASSWORD ?? "";
const TOTP_SECRET = (process.env.ADMIN_SMOKE_TOTP_SECRET ?? "").replace(/\s+/g, "").toUpperCase();

const missing = [
  ["ADMIN_SMOKE_EMAIL", EMAIL],
  ["ADMIN_SMOKE_PASSWORD", PASSWORD],
  ["ADMIN_SMOKE_TOTP_SECRET", TOTP_SECRET],
]
  .filter(([, value]) => !value)
  .map(([name]) => name);

if (missing.length > 0) {
  console.error(`Fehlende Secrets: ${missing.join(", ")}`);
  console.error("Anlegen unter GitHub → Settings → Secrets and variables → Actions.");
  process.exit(2);
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of input.replace(/=+$/, "")) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) throw new Error("TOTP-Secret enthält ungültige Zeichen");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, at = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

const maskEmail = (address) => address.replace(/^(.{2})[^@]*(@.*)$/, "$1***$2");
const failures = [];
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` – ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

async function request(path, init = {}) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
    headers: { accept: "text/html", "user-agent": "streaminghub-admin-smoke", ...(init.headers ?? {}) },
  });
  const body = response.status === 200 ? await response.text() : "";
  return { status: response.status, body, headers: response.headers };
}

const cookies = new Map();

function storeCookies(headers) {
  const list = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  for (const raw of list) {
    const [pair] = raw.split(";");
    const index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

const cookieHeader = () =>
  [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join("; ");

async function main() {
  console.log(`Ziel: ${BASE}`);
  console.log(`Konto: ${maskEmail(EMAIL)}`);

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    headers: { "content-type": "application/json", accept: "application/json", "user-agent": "streaminghub-admin-smoke" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, mfaCode: totp(TOTP_SECRET) }),
  });

  storeCookies(login.headers);

  let loginBody = null;
  try {
    loginBody = await login.json();
  } catch {
    loginBody = null;
  }

  const loggedIn = login.status === 200 && loginBody?.ok === true && cookies.size > 0;
  check(
    "Anmeldung mit Zwei-Faktor",
    loggedIn,
    loggedIn ? "Sitzung erhalten" : `HTTP ${login.status}${loginBody?.error?.code ? ` (${loginBody.error.code})` : ""}`,
  );
  if (!loggedIn) {
    report();
    return;
  }

  const overview = await request("/admin", { headers: { cookie: cookieHeader() } });
  const overviewOk = overview.status === 200;
  check("Admin-Übersicht erreichbar", overviewOk, `HTTP ${overview.status}`);
  if (overviewOk) {
    check(
      "Zähler „Offene Erklärungen“ sichtbar",
      overview.body.includes("Offene Erklärungen") || overview.body.includes("Open declarations"),
      "",
    );
  }

  const list = await request("/admin/contracts", { headers: { cookie: cookieHeader() } });
  const listOk = list.status === 200;
  check("Widerrufsliste erreichbar", listOk, `HTTP ${list.status}`);
  if (listOk) {
    check(
      "Liste trägt ihre Überschrift",
      list.body.includes("Widerrufe und Kündigungen") || list.body.includes("Withdrawals and cancellations"),
      "",
    );
    const hasAction =
      list.body.includes("Als erledigt markieren") || list.body.includes("Mark as done");
    const empty =
      list.body.includes("Keine Erklärungen in dieser Auswahl") ||
      list.body.includes("No declarations in this selection");
    check("Liste zeigt Vorgänge oder den Leerzustand", hasAction || empty, hasAction ? "Vorgänge vorhanden" : "Leerzustand");
  }

  const audit = await request("/admin/audit", { headers: { cookie: cookieHeader() } });
  check("Sicherheitsprotokoll erreichbar", audit.status === 200, `HTTP ${audit.status}`);

  report();
}

function report() {
  const passed = results.filter((entry) => entry.ok).length;
  console.log(`\n${passed}/${results.length} Prüfungen bestanden.`);
  if (failures.length > 0) {
    console.error(`Fehlgeschlagen: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`Prüfung abgebrochen: ${error.message}`);
  process.exit(1);
});
