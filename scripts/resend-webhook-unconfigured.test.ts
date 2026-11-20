/**
 * Resend-Webhook ohne Signatur-Secret: eigener Prozess, weil `env` die
 * Variablen beim Import einmalig liest.
 */

import assert from "node:assert/strict";

process.env.EMAIL_WEBHOOK_SECRET = "";
delete process.env.RESEND_WEBHOOK_SECRET;

const { all } = await import("@/lib/db");
const { POST: resendWebhook } = await import("@/app/api/webhooks/resend/route");

const request = new Request("https://app.example/api/webhooks/resend", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    host: "app.example",
    "svix-id": "msg_hook_1",
    "svix-timestamp": String(Math.floor(Date.now() / 1000)),
    "svix-signature": "v1,AAAA",
  },
  body: JSON.stringify({ type: "email.delivered", data: { email_id: "msg_1" } }),
});

const response = await resendWebhook(request);
const body = (await response.json()) as { error?: string };
const outbox = all<{ c: number }>(`SELECT COUNT(*) AS c FROM outbox_emails`)[0].c;

console.log(`  ${response.status === 503 ? "\u2713" : "\u2717"} ohne Secret 503`);
assert.equal(response.status, 503);
assert.equal(body.error, "not_configured");
assert.equal(outbox, 0);
console.log("\n1/1 Prüfungen bestanden.");
