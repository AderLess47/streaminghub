/**
 * Headless-Tests für `/api/webhooks/resend`: Svix-Signatur, Zustellereignisse
 * und Sperrung von Adressen. Nur `next/server` ist ersetzt.
 *
 * Aufruf: npm run test:resend-webhook
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

const SECRET_KEY = Buffer.from("streaminghub-test-webhook-key-32").toString("base64");
process.env.EMAIL_WEBHOOK_SECRET = `whsec_${SECRET_KEY}`;
process.env.APP_URL = "https://streaminghub.org";
delete process.env.RESEND_WEBHOOK_SECRET;

const { all, get, nowIso, run } = await import("@/lib/db");
const { POST: resendWebhook } = await import("@/app/api/webhooks/resend/route");

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

function resetDb() {
  run("DELETE FROM outbox_emails");
  run("DELETE FROM email_suppressions");
}

function seedOutbox(providerId = "msg_1", to = "kunde@example.test") {
  const at = nowIso();
  run(
    `INSERT INTO outbox_emails (id, to_email, subject, body_text, kind, status, provider_id,
       provider_status, attempts, created_at, sent_at)
     VALUES (?, ?, 'Test', 'Hallo', 'system', 'sent', ?, 'sent', 1, ?, ?)`,
    `outbox-${providerId}`,
    to,
    providerId,
    at,
    at,
  );
}

function sign(payload: string, id: string, timestamp = Math.floor(Date.now() / 1000)) {
  const key = Buffer.from(SECRET_KEY, "base64");
  const signature = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${payload}`)
    .digest("base64");
  return `v1,${signature}`;
}

function webhookRequest(
  payload: string,
  options: { id?: string; timestamp?: number; signature?: string | null } = {},
) {
  const id = options.id ?? "msg_hook_1";
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = options.signature === undefined ? sign(payload, id, timestamp) : options.signature;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "app.example",
    "svix-id": id,
    "svix-timestamp": String(timestamp),
  };
  if (signature) headers["svix-signature"] = signature;
  return new Request("https://app.example/api/webhooks/resend", {
    method: "POST",
    headers,
    body: payload,
  });
}

function outbox(providerId = "msg_1") {
  return get<{ status: string; provider_status: string }>(
    `SELECT status, provider_status FROM outbox_emails WHERE provider_id = ?`,
    providerId,
  );
}

function suppressions() {
  // node:sqlite liefert Objekte ohne Prototyp; für deepEqual in einfache Objekte wandeln.
  return all<{ email: string; reason: string }>(`SELECT email, reason FROM email_suppressions`).map(
    (row) => ({ email: row.email, reason: row.reason }),
  );
}

const delivered = JSON.stringify({
  type: "email.delivered",
  data: { email_id: "msg_1", to: ["kunde@example.test"] },
});

await check("gueltige Signatur: delivered setzt provider_status", async () => {
  resetDb();
  seedOutbox();
  const response = await resendWebhook(webhookRequest(delivered));
  assert.equal(response.status, 200);
  const row = outbox();
  assert.equal(row?.status, "sent");
  assert.equal(row?.provider_status, "delivered");
  assert.equal(suppressions().length, 0);
});

await check("falsche Signatur 401, keine Aenderung", async () => {
  resetDb();
  seedOutbox();
  const response = await resendWebhook(
    webhookRequest(delivered, { signature: "v1,AAAA" }),
  );
  assert.equal(response.status, 401);
  assert.equal(outbox()?.provider_status, "sent");
});

await check("fehlende Signatur 401", async () => {
  resetDb();
  seedOutbox();
  const response = await resendWebhook(webhookRequest(delivered, { signature: null }));
  assert.equal(response.status, 401);
  assert.equal(outbox()?.provider_status, "sent");
});

await check("alter Zeitstempel 401", async () => {
  resetDb();
  seedOutbox();
  const stale = Math.floor(Date.now() / 1000) - 600;
  const payload = delivered;
  const response = await resendWebhook(
    webhookRequest(payload, {
      timestamp: stale,
      signature: sign(payload, "msg_hook_1", stale),
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(outbox()?.provider_status, "sent");
});

await check("ungueltiges JSON mit gueltiger Signatur 400", async () => {
  resetDb();
  seedOutbox();
  const payload = "{kein json";
  const response = await resendWebhook(webhookRequest(payload));
  assert.equal(response.status, 400);
});

await check("harter Bounce sperrt die Adresse", async () => {
  resetDb();
  seedOutbox();
  const payload = JSON.stringify({
    type: "email.bounced",
    data: {
      email_id: "msg_1",
      to: ["Kunde@Example.test"],
      bounce: { type: "Permanent", message: "mailbox does not exist" },
    },
  });
  const response = await resendWebhook(webhookRequest(payload));
  assert.equal(response.status, 200);
  const row = outbox();
  assert.equal(row?.status, "failed");
  assert.equal(row?.provider_status, "bounced");
  assert.deepEqual(suppressions(), [{ email: "kunde@example.test", reason: "bounce" }]);
});

await check("temporaerer Bounce sperrt nicht", async () => {
  resetDb();
  seedOutbox();
  const payload = JSON.stringify({
    type: "email.bounced",
    data: {
      email_id: "msg_1",
      to: ["kunde@example.test"],
      bounce: { type: "Temporary", message: "mailbox full" },
    },
  });
  const response = await resendWebhook(webhookRequest(payload));
  assert.equal(response.status, 200);
  assert.equal(outbox()?.provider_status, "bounced");
  assert.equal(suppressions().length, 0);
});

await check("Beschwerde sperrt die Adresse", async () => {
  resetDb();
  seedOutbox();
  const payload = JSON.stringify({
    type: "email.complained",
    data: { email_id: "msg_1", to: ["kunde@example.test"] },
  });
  const response = await resendWebhook(webhookRequest(payload));
  assert.equal(response.status, 200);
  assert.deepEqual(suppressions(), [{ email: "kunde@example.test", reason: "complaint" }]);
});

await check("unbekannter Typ wird quittiert", async () => {
  resetDb();
  seedOutbox();
  const payload = JSON.stringify({
    type: "email.opened",
    data: { email_id: "msg_1", to: ["kunde@example.test"] },
  });
  const response = await resendWebhook(webhookRequest(payload));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { updated: number };
  assert.equal(body.updated, 0);
  assert.equal(outbox()?.provider_status, "sent");
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  process.exitCode = 1;
}
