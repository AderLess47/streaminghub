#!/usr/bin/env node
/**
 * End-to-end test of the transactional email pipeline against a local stub
 * provider. It never sends real mail.
 *
 *   EMAIL_API_KEY=test EMAIL_API_BASE=http://127.0.0.1:4025 \
 *   EMAIL_WEBHOOK_SECRET=whsec_MDEyMzQ1Njc4OWFiY2RlZg== npm run dev
 *
 *   EMAIL_WEBHOOK_SECRET=whsec_MDEyMzQ1Njc4OWFiY2RlZg== npm run email:smoke
 */
import http from "node:http";
import { createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const STUB_PORT = Number(process.env.EMAIL_STUB_PORT ?? 4025);
const SECRET = process.env.EMAIL_WEBHOOK_SECRET ?? "";
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");

let checks = 0;
let failures = 0;

function ok(condition, label, detail = "") {
  checks++;
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` – ${detail}` : ""}`);
  }
}

if (!SECRET) {
  console.error("EMAIL_WEBHOOK_SECRET is required (same value as the running server).");
  process.exit(1);
}

const requests = [];
const stub = http.createServer((request, response) => {
  let raw = "";
  request.on("data", (chunk) => (raw += chunk));
  request.on("end", () => {
    let body = {};
    try {
      body = JSON.parse(raw);
    } catch {
      /* keep empty */
    }
    const recipient = Array.isArray(body.to) ? body.to[0] : "";
    const record = { headers: request.headers, body, providerId: null };
    requests.push(record);

    if (String(recipient).startsWith("fail")) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "stub provider failure" }));
      return;
    }

    const id = `stub-${requests.length}`;
    record.providerId = id;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id }));
  });
});

await new Promise((resolve, reject) => {
  stub.once("error", reject);
  stub.listen(STUB_PORT, "127.0.0.1", resolve);
});
console.log(`Email pipeline test → ${BASE} (stub provider on :${STUB_PORT})\n`);

const db = new DatabaseSync(dbPath);
db.exec(
  "DELETE FROM rate_limits WHERE key LIKE 'register:ip%' OR key LIKE 'contact:ip%' OR key LIKE 'forgot:%'",
);

async function post(route, body, headers = {}) {
  const response = await fetch(`${BASE}${route}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE, ...headers },
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

const stamp = Date.now();
const email = `mailtest+${stamp}@example.com`;
const password = "MailTest-2026!Ab";

console.log("Verification mail");
const register = await post("/api/auth/register", {
  displayName: "Mail Test",
  email,
  password,
  locale: "de",
  acceptTerms: true,
});
ok(register.status === 200, `registration accepted (${register.status})`, register.text.slice(0, 200));
ok(register.json?.delivered === true, "provider accepted the verification mail");
ok(register.json?.devLink === undefined, "no dev link exposed when a provider is configured");

const verifyRequest = requests.find((entry) => entry.body?.to?.[0] === email);
ok(Boolean(verifyRequest), "verification mail reached the provider");
ok(String(verifyRequest?.body?.from ?? "").includes("StreamingHub"), "sender configured");
ok(String(verifyRequest?.body?.reply_to ?? "").includes("@"), "reply-to configured");
ok(/bestätige/i.test(String(verifyRequest?.body?.text ?? "")), "localised plain-text part");
ok(String(verifyRequest?.body?.html ?? "").includes("<html"), "HTML part sent");
ok(Boolean(verifyRequest?.headers?.["idempotency-key"]), "idempotency key sent");
ok(
  !/[\u0000-\u0008]/.test(JSON.stringify(verifyRequest?.body ?? {})),
  "no unescaped control characters in payload",
);

console.log("\nPassword reset mail");
const forgot = await post("/api/auth/forgot-password", { email });
ok(forgot.status === 200, `forgot-password accepted (${forgot.status})`);
const resetRequest = requests.find(
  (entry) => entry.body?.to?.[0] === email && String(entry.body?.subject).includes("Passwort"),
);
ok(Boolean(resetRequest), "reset mail reached the provider");

console.log("\nContact form mail");
const contact = await post("/api/contact", {
  name: "Mail Test",
  email,
  subject: "Test der E-Mail-Zustellung",
  message: "Diese Nachricht prüft den Versand aus dem Kontaktformular.",
  privacyAccepted: true,
  website: "",
  renderedAt: Date.now() - 5000,
});
ok(contact.status === 200, `contact accepted (${contact.status})`, contact.text.slice(0, 200));
const contactTo = process.env.CONTACT_TO_EMAIL ?? "service@streaminghub.org";
const contactRequest = requests.find((entry) => entry.body?.to?.[0] === contactTo);
ok(Boolean(contactRequest), `contact mail sent to ${contactTo}`);
ok(
  String(contactRequest?.body?.subject ?? "").includes("[Kontakt]"),
  "contact subject tagged for the inbox",
);

console.log("\nProvider failure and retry bookkeeping");
const failEmail = `fail+${stamp}@example.com`;
const failRegister = await post("/api/auth/register", {
  displayName: "Fail Test",
  email: failEmail,
  password,
  locale: "de",
  acceptTerms: true,
});
ok(failRegister.status === 200, "registration still succeeds when mail fails");
ok(failRegister.json?.delivered === false, "delivery failure reported to the caller");
const failedRow = db
  .prepare("SELECT status, attempts, error FROM outbox_emails WHERE to_email = ? ORDER BY created_at DESC")
  .get(failEmail);
ok(failedRow?.status === "failed", "outbox marks the message failed");
ok(failedRow?.attempts === 2, `transient failure retried once (attempts=${failedRow?.attempts})`);
ok(String(failedRow?.error ?? "").includes("500"), "provider error stored for staff");

console.log("\nSigned delivery webhook");
const providerId = verifyRequest?.providerId;
ok(Boolean(providerId), "provider message id captured");

function sign(id, timestamp, body) {
  const key = Buffer.from(SECRET.replace(/^whsec_/, ""), "base64");
  return createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

async function sendWebhook(event) {
  const eventId = `msg_${Math.random().toString(36).slice(2)}_${Date.now()}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const body = JSON.stringify(event);
  const response = await fetch(`${BASE}/api/webhooks/resend`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "svix-id": eventId,
      "svix-timestamp": timestamp,
      "svix-signature": `v1,${sign(eventId, timestamp, body)}`,
    },
    body,
  });
  return {
    status: response.status,
    json: await response.json().catch(() => null),
  };
}

const eventId = `msg_${stamp}`;
const timestamp = String(Math.floor(Date.now() / 1000));
const eventBody = JSON.stringify({ type: "email.delivered", data: { email_id: providerId } });
const signed = await fetch(`${BASE}/api/webhooks/resend`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "svix-id": eventId,
    "svix-timestamp": timestamp,
    "svix-signature": `v1,${sign(eventId, timestamp, eventBody)}`,
  },
  body: eventBody,
});
ok(signed.status === 200, `valid signature accepted (${signed.status})`);
const deliveredRow = db
  .prepare("SELECT status, provider_status FROM outbox_emails WHERE provider_id = ?")
  .get(providerId);
ok(deliveredRow?.provider_status === "delivered", "webhook updates delivery status");

const forged = await fetch(`${BASE}/api/webhooks/resend`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "svix-id": eventId,
    "svix-timestamp": timestamp,
    "svix-signature": "v1,AAAA",
  },
  body: eventBody,
});
ok(forged.status === 401, `forged signature rejected (${forged.status})`);
const unchanged = db
  .prepare("SELECT provider_status FROM outbox_emails WHERE provider_id = ?")
  .get(providerId);
ok(unchanged?.provider_status === "delivered", "forged event does not change state");

const duplicate = await sendWebhook({ type: "email.delivered", data: { email_id: providerId } });
ok(duplicate.status === 200, "duplicate delivery event accepted (idempotent)");
const unknown = await sendWebhook({ type: "email.opened", data: { email_id: providerId } });
ok(
  unknown.status === 200 && unknown.json?.updated === 0,
  "unknown event acknowledged without state change",
);

console.log("\nBounce and complaint suppression");
db.exec("DELETE FROM rate_limits WHERE key LIKE 'register:ip%' OR key LIKE 'forgot:%'");

async function registerMailbox(address) {
  return post("/api/auth/register", {
    displayName: "Mailbox Test",
    email: address,
    password,
    locale: "de",
    acceptTerms: true,
  });
}

async function mailboxProviderId(address) {
  return requests.find((entry) => entry.body?.to?.[0] === address)?.providerId;
}

const bounceEmail = `bounce+${stamp}@example.com`;
const bounceRegister = await registerMailbox(bounceEmail);
ok(bounceRegister.json?.delivered === true, "bounce test mail sent to the provider");
const bounceProviderId = await mailboxProviderId(bounceEmail);
const bounceEvent = await sendWebhook({
  type: "email.bounced",
  data: {
    email_id: bounceProviderId,
    to: [bounceEmail],
    bounce: { type: "Permanent", message: "550 5.1.1 unknown user" },
  },
});
ok(bounceEvent.status === 200, "permanent bounce event accepted");
const bounceRow = db
  .prepare("SELECT status, provider_status FROM outbox_emails WHERE provider_id = ?")
  .get(bounceProviderId);
ok(
  bounceRow?.status === "failed" && bounceRow?.provider_status === "bounced",
  "bounce marks the mail as failed",
);
const bounceSuppression = db
  .prepare("SELECT reason FROM email_suppressions WHERE email = ?")
  .get(bounceEmail);
ok(bounceSuppression?.reason === "bounce", "hard bounce added to the suppression list");

const stubCount = requests.length;
const suppressedSend = await post("/api/auth/forgot-password", { email: bounceEmail });
ok(suppressedSend.status === 200, "reset request for a suppressed address stays generic");
const suppressedRow = db
  .prepare("SELECT status, error FROM outbox_emails WHERE to_email = ? ORDER BY created_at DESC")
  .get(bounceEmail);
ok(suppressedRow?.status === "suppressed", "suppressed address is marked, not sent");
ok(requests.length === stubCount, "no provider request for a suppressed address");

const softEmail = `soft+${stamp}@example.com`;
await registerMailbox(softEmail);
const softProviderId = await mailboxProviderId(softEmail);
await sendWebhook({
  type: "email.bounced",
  data: { email_id: softProviderId, to: [softEmail], bounce: { type: "Temporary" } },
});
const softSuppression = db
  .prepare("SELECT email FROM email_suppressions WHERE email = ?")
  .get(softEmail);
ok(!softSuppression, "temporary bounce is not suppressed");
const softRow = db
  .prepare("SELECT provider_status FROM outbox_emails WHERE provider_id = ?")
  .get(softProviderId);
ok(softRow?.provider_status === "bounced", "temporary bounce is recorded for staff");

const complaintEmail = `complaint+${stamp}@example.com`;
await registerMailbox(complaintEmail);
const complaintProviderId = await mailboxProviderId(complaintEmail);
const complaintEvent = await sendWebhook({
  type: "email.complained",
  data: { email_id: complaintProviderId, to: [complaintEmail] },
});
ok(complaintEvent.status === 200, "complaint event accepted");
const complaintSuppression = db
  .prepare("SELECT reason FROM email_suppressions WHERE email = ?")
  .get(complaintEmail);
ok(complaintSuppression?.reason === "complaint", "spam complaint added to the suppression list");

stub.close();
db.close();

console.log(`\n${checks - failures}/${checks} checks passed.`);
if (failures > 0) process.exitCode = 1;
