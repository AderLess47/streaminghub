#!/usr/bin/env node
/**
 * Live check of the mail pipeline against the real Resend API using the
 * official simulated recipients:
 *   delivered@resend.dev, bounced@resend.dev, complained@resend.dev
 *
 * Prerequisites:
 *   - a Resend test/sending key and a verified EMAIL_FROM
 *   - the app running with the same key (it sends the mails and records the
 *     provider message id in the outbox)
 *   - local access to the SQLite database
 *
 * Run:
 *   set -a; . ./.env.email-test; set +a
 *   npm run email:resend-test
 *
 * The script never mails a real person. It exits with code 2 when no key is
 * configured, 1 on a failed assertion and 0 on success.
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const apiKey = process.env.EMAIL_API_KEY ?? process.env.RESEND_API_KEY ?? "";
const apiBase = (process.env.EMAIL_API_BASE ?? "https://api.resend.com").replace(/\/$/, "");
const from = process.env.EMAIL_FROM ?? "";
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");

let checks = 0;
let failures = 0;
const ok = (condition, label, detail = "") => {
  checks++;
  if (condition) console.log(`  ✓ ${label}`);
  else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` – ${detail}` : ""}`);
  }
};

if (!apiKey) {
  console.error(
    "SKIPPED: no Resend key. Set EMAIL_API_KEY (re_...) in .env.email-test and start the app with it.",
  );
  process.exit(2);
}
if (!from.includes("@")) {
  console.error("SKIPPED: EMAIL_FROM is missing. A verified sender is required.");
  process.exit(2);
}
if (apiBase !== "https://api.resend.com") {
  console.log(`Note: using non-default API base ${apiBase}.`);
}

const db = new DatabaseSync(dbPath);
db.exec(
  "DELETE FROM rate_limits WHERE key LIKE 'register:ip%' OR key LIKE 'forgot:%'",
);

async function post(route, body) {
  const response = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* html */
  }
  return { status: response.status, json, text };
}

async function providerEvent(providerId) {
  const response = await fetch(`${apiBase}/emails/${encodeURIComponent(providerId)}`, {
    headers: { authorization: `Bearer ${apiKey}` },
  });
  const json = await response.json().catch(() => null);
  return {
    status: response.status,
    event: json?.last_event ?? json?.status ?? null,
    json,
  };
}

const stamp = Date.now();
const cases = [
  { name: "delivered", address: `delivered+sh${stamp}@resend.dev`, expect: "delivered" },
  { name: "bounced", address: `bounced+sh${stamp}@resend.dev`, expect: "bounced" },
  { name: "complained", address: `complained+sh${stamp}@resend.dev`, expect: "complained" },
];

console.log(`Live Resend test → app ${BASE}, API ${apiBase}\n`);
console.log("Sending verification mail through the app to simulated recipients");

for (const testCase of cases) {
  // Unique address per run, so suppression from a previous run cannot hide it.
  db.prepare("DELETE FROM email_suppressions WHERE email = ?").run(testCase.address);

  const register = await post("/api/auth/register", {
    displayName: `Resend ${testCase.name}`,
    email: testCase.address,
    password: "MailTest-2026!Ab",
    locale: "de",
    acceptTerms: true,
  });
  ok(register.status === 200, `${testCase.name}: registration accepted (${register.status})`, register.text.slice(0, 160));
  ok(register.json?.delivered === true, `${testCase.name}: provider accepted the mail`);
  if (register.json?.devLink) {
    console.error("  ! The app is running without EMAIL_API_KEY (dev link returned).");
  }

  const row = db
    .prepare("SELECT provider_id, status FROM outbox_emails WHERE to_email = ? ORDER BY created_at DESC")
    .get(testCase.address);
  ok(Boolean(row?.provider_id), `${testCase.name}: provider message id stored`);
  if (!row?.provider_id) continue;

  let event = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    const result = await providerEvent(row.provider_id);
    if (result.status !== 200) {
      console.error(`  ! Resend API ${result.status}: ${JSON.stringify(result.json).slice(0, 200)}`);
      break;
    }
    event = result.event;
    if (event === testCase.expect) break;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  ok(
    event === testCase.expect,
    `${testCase.name}: provider reports "${testCase.expect}" (got ${event ?? "none"})`,
  );
}

console.log(`
Webhook processing (suppression) is verified locally by \`npm run email:smoke\`.
For real webhook delivery, expose /api/webhooks/resend publicly and configure the
signing secret; then check Admin → Email outbox for provider_status and the
suppression list.`);

db.close();
console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) process.exitCode = 1;
