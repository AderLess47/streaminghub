#!/usr/bin/env node
/**
 * Prüft die Geräte-Vorwarnung im Konto auf einer laufenden Instanz.
 *
 * Geprüft wird genau das, was der Kunde sieht: Titel „Beim Ablauf bleiben N
 * Geräte aktiv", die Markierungen „bleibt"/„wird abgemeldet" und die Datumszeile
 * – Trial-Ende und Stripe-Ende mit Datum, Verlängerung als Verlängerung, und bei
 * Store-Abos ohne Periodenende gar kein Datum.
 *
 * Das Skript läuft in der Maschine, deren Seite geprüft werden soll (Staging
 * oder Produktion, `flyctl ssh console`), und legt dort ein Wegwerf-Konto mit
 * Abo und Geräten an; danach ruft es `/dashboard` über HTTP auf und räumt alles
 * wieder ab. Keine Secrets, keine echten Konten – der Dienst muss auf Loopback
 * laufen, damit der Lauf nur die eigene Instanz trifft.
 *
 *   SMOKE_BASE_URL  Standard http://127.0.0.1:3001 (Next hinter dem Cache-Proxy)
 *   DATABASE_PATH   Standard data/streaminghub.db
 *
 * Exit-Codes: 0 alles bestanden, 1 Abweichung, 2 Aufruf/Konfiguration falsch.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";

const BASE = (process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3001").replace(/\/+$/, "");
const DB_PATH = process.env.DATABASE_PATH ?? "data/streaminghub.db";
const EMAIL_PREFIX = "device-notice-smoke+";
const EMAIL_DOMAIN = "@example.invalid";
const DEVICES_OVER_FREE = 2;

let baseUrl;
try {
  baseUrl = new URL(BASE);
} catch {
  console.error(`SMOKE_BASE_URL ist keine gültige URL: ${BASE}`);
  process.exit(2);
}

// Nur Loopback: der Lauf schreibt in die Datenbank der Instanz, gegen die er
// spricht. Eine öffentliche Adresse könnte eine echte Umgebung treffen.
const LOOPBACK = ["127.0.0.1", "localhost", "::1", "[::1]"];
if (!LOOPBACK.includes(baseUrl.hostname)) {
  console.error(
    `SMOKE_BASE_URL muss auf Loopback zeigen (erlaubt: ${LOOPBACK.join(", ")}), nicht auf ${baseUrl.hostname}.`,
  );
  process.exit(2);
}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const newId = () => randomBytes(9).toString("base64url");
const nowIso = () => new Date().toISOString();
const count = (haystack, needle) => haystack.split(needle).length - 1;

/** HTML-Kommentare und Whitespace vereinheitlichen, damit Textvergleiche halten. */
const normalize = (html) => html.replace(/<!--[\s\S]*?-->/g, "").replace(/\s+/g, " ").trim();

const deDate = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" });
const formatDate = (iso) => deDate.format(new Date(iso));

/** Mittags UTC, damit ein Zeitzonenunterschied nicht den Tag verschiebt. */
function inDays(days) {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setUTCHours(12, 0, 0, 0);
  return date.toISOString();
}

let db;
try {
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA busy_timeout = 10000;");
  const users = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  if (!users) {
    console.error(`Keine StreamingHub-Datenbank unter ${DB_PATH} (Tabelle users fehlt).`);
    process.exit(2);
  }
} catch (error) {
  console.error(`Datenbank ${DB_PATH} nicht lesbar: ${error.message}`);
  process.exit(2);
}

/** Limit wie die Seite: Einstellung, sonst derselbe Default wie im Code. */
function setting(key, fallback) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  const value = Number(row?.value);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

const freeLimit = setting("free_device_limit", 2);
const deviceCount = freeLimit + DEVICES_OVER_FREE;

const failures = [];
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok });
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` – ${detail}` : ""}`);
  if (!ok) failures.push(name);
}

/** Alte Reste eines abgebrochenen Laufs entfernen (nur unser Präfix). */
function cleanStaleAccounts() {
  const ids = db
    .prepare("SELECT id FROM users WHERE email LIKE ?")
    .all(`${EMAIL_PREFIX}%${EMAIL_DOMAIN}`)
    .map((row) => row.id);
  for (const id of ids) removeAccount(id);
  return ids.length;
}

function removeAccount(userId) {
  // Kinder zuerst: die Verbindung ist ohne `PRAGMA foreign_keys = ON`, also
  // greift ON DELETE CASCADE hier nicht.
  for (const table of ["sessions", "subscriptions", "devices"]) {
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).run(userId);
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(userId);
}

const stale = cleanStaleAccounts();
console.log(`Ziel: ${BASE}`);
console.log(`Datenbank: ${DB_PATH}`);
console.log(`Gratis-Limit: ${freeLimit}, angelegte Geräte: ${deviceCount}`);
if (stale > 0) console.log(`Aufgeräumt aus einem früheren Lauf: ${stale} Konto/Konten`);

const userId = newId();
const sessionToken = randomBytes(32).toString("base64url");
const email = `${EMAIL_PREFIX}${Date.now()}-${newId().slice(0, 6)}${EMAIL_DOMAIN}`.toLowerCase();
const cookie = `sh_session=${sessionToken}`;
const trialEnd = inDays(3);
const periodEnd = inDays(20);

function seedAccount() {
  const now = nowIso();
  db.prepare(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
                        marketing_opt_in, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'de', 'customer', 1, 0, ?, ?)`,
  ).run(userId, email, "scrypt$unused-by-device-notice-smoke", "Device Smoke", now, now);

  db.prepare(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at, mfa_ok, ip, user_agent)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
  ).run(
    sha256(sessionToken),
    userId,
    now,
    new Date(Date.now() + 3_600_000).toISOString(),
    now,
    "127.0.0.1",
    "streaminghub-device-notice-smoke",
  );

  // Trial-Zustand als Ausgangslage; die Szenarien schreiben das Abo um.
  db.prepare(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, current_period_end,
                                cancel_at_period_end, billing_interval, trial_started_at,
                                trial_ends_at, trial_source, updated_at, created_at)
     VALUES (?, ?, 'premium', 'none', 'web', 'none', NULL, 0, 'month', ?, ?, 'web', ?, ?)`,
  ).run(newId(), userId, inDays(-1), trialEnd, now, now);

  const device = db.prepare(
    `INSERT INTO devices (id, user_id, name, platform, status, activated_at, last_seen_at, created_at)
     VALUES (?, ?, ?, 'androidtv', 'active', ?, ?, ?)`,
  );
  for (let index = 0; index < deviceCount; index += 1) {
    const seen = new Date(Date.now() - index * 3_600_000).toISOString();
    device.run(newId(), userId, `Smoke-Gerät ${index + 1}`, seen, seen, seen);
  }
}

/** Abo-Zustand für ein Szenario setzen; nicht genannte Felder fallen zurück. */
function setSubscription(fields) {
  const row = {
    channel: "web",
    provider: "none",
    status: "active",
    current_period_end: null,
    cancel_at_period_end: 0,
    trial_ends_at: null,
    ...fields,
  };
  db.prepare(
    `UPDATE subscriptions
        SET channel = ?, provider = ?, status = ?, current_period_end = ?,
            cancel_at_period_end = ?, trial_ends_at = ?, updated_at = ?
      WHERE user_id = ?`,
  ).run(
    row.channel,
    row.provider,
    row.status,
    row.current_period_end,
    row.cancel_at_period_end,
    row.trial_ends_at,
    nowIso(),
    userId,
  );
}

async function dashboard() {
  const response = await fetch(`${BASE}/dashboard`, {
    redirect: "manual",
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
    headers: {
      accept: "text/html",
      "user-agent": "streaminghub-device-notice-smoke",
      cookie,
    },
  });
  const body = response.status === 200 ? normalize(await response.text()) : "";
  return { status: response.status, location: response.headers.get("location"), body };
}

const trialLine = `Dein Testzeitraum endet am ${formatDate(trialEnd)}.`;
const stripeEndLine = `Dein Abo endet am ${formatDate(periodEnd)}.`;
const stripeRenewLine = `Dein Abo verlängert sich am ${formatDate(periodEnd)} automatisch`;

/** Prüft eine Seite: Vorwarnung, Markierungen und genau die erwartete Datumszeile. */
function checkDashboard(label, page, expectedLine, forbiddenLines) {
  check(`${label}: Konto erreichbar`, page.status === 200, `HTTP ${page.status}${page.location ? ` → ${page.location}` : ""}`);
  if (page.status !== 200) return;

  const title = `Beim Ablauf bleiben ${freeLimit} Geräte aktiv`;
  check(`${label}: Vorwarnung sichtbar`, page.body.includes(title), title);
  check(
    `${label}: ${deviceCount} aktive Geräte genannt`,
    page.body.includes(`Du hast ${deviceCount} aktive Geräte.`),
    "",
  );
  // An der Markierung selbst zählen, nicht am Wort: Die RSC-Nutzlast enthält
  // denselben Text zusätzlich, ein reiner Textzähler wäre also dreifach.
  const unlink = count(page.body, ">wird abgemeldet</span>");
  const keep = count(page.body, ">bleibt</span>");
  check(
    `${label}: ${DEVICES_OVER_FREE} Geräte als „wird abgemeldet“ markiert`,
    unlink === DEVICES_OVER_FREE,
    `${unlink} Markierung(en)`,
  );
  check(
    `${label}: ${freeLimit} Geräte als „bleibt“ markiert`,
    keep === freeLimit,
    `${keep} Markierung(en)`,
  );

  if (expectedLine) {
    check(`${label}: Datumszeile`, page.body.includes(expectedLine), expectedLine);
  }
  for (const line of forbiddenLines) {
    check(`${label}: keine falsche Datumszeile`, !page.body.includes(line), line);
  }
}

async function run() {
  seedAccount();

  setSubscription({ status: "none", trial_ends_at: trialEnd });
  const trial = await dashboard();
  checkDashboard("Testzeitraum", trial, trialLine, [stripeEndLine, stripeRenewLine]);

  setSubscription({
    status: "active",
    provider: "stripe",
    provider_customer_id: "cus_smoke",
    provider_subscription_id: "sub_smoke",
    current_period_end: periodEnd,
    cancel_at_period_end: 1,
  });
  const canceled = await dashboard();
  checkDashboard("Stripe gekündigt", canceled, stripeEndLine, [trialLine, stripeRenewLine]);

  setSubscription({
    status: "active",
    provider: "stripe",
    provider_customer_id: "cus_smoke",
    provider_subscription_id: "sub_smoke",
    current_period_end: periodEnd,
    cancel_at_period_end: 0,
  });
  const renewing = await dashboard();
  checkDashboard("Stripe verlängert sich", renewing, stripeRenewLine, [trialLine, stripeEndLine]);

  // Store-Abos melden kein Periodenende: hier darf gar kein Datum stehen,
  // statt eines zu raten.
  setSubscription({
    status: "active",
    channel: "amazon",
    provider: "amazon",
    provider_customer_id: "amzn1.smoke",
    provider_subscription_id: "amzn1.smoke.sub",
    current_period_end: periodEnd,
  });
  const store = await dashboard();
  checkDashboard("Store-Abo", store, null, [trialLine, stripeEndLine, stripeRenewLine]);
}

try {
  await run();
} catch (error) {
  console.error(`Prüfung abgebrochen: ${error.message}`);
  failures.push("Abbruch");
} finally {
  try {
    removeAccount(userId);
  } catch (error) {
    console.error(`Aufräumen fehlgeschlagen: ${error.message}`);
    failures.push("Aufräumen");
  }
  db.close();
}

const passed = results.filter((entry) => entry.ok).length;
console.log(`\n${passed}/${results.length} Prüfungen bestanden.`);
if (failures.length > 0) {
  console.error(`Fehlgeschlagen: ${failures.join(", ")}`);
  process.exit(1);
}
