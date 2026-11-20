import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Outbox-Zustellung gegen einen lokalen Email-Anbieter: Erfolg, transienter
 * Fehler mit Wiederholung, endgültiger 4xx ohne Wiederholung, 429, gesperrte
 * Adresse, Netzwerkabbruch und erneuter Versand aus der Verwaltung.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-mail-outbox-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
process.env.APP_URL = "http://localhost:3000";

type Mode = "ok" | "error500" | "error400" | "ratelimit" | "reset";
let mode: Mode = "ok";
let requests = 0;
let lastHeaders: Record<string, string | string[] | undefined> = {};

const server = createServer((request, response) => {
  requests += 1;
  lastHeaders = request.headers;
  if (mode === "reset") {
    request.socket.destroy();
    return;
  }
  if (mode === "error500") {
    response.writeHead(500, { "content-type": "text/plain" }).end("provider down");
    return;
  }
  if (mode === "error400") {
    response.writeHead(400, { "content-type": "text/plain" }).end("bad request");
    return;
  }
  if (mode === "ratelimit" && requests % 2 === 1) {
    response.writeHead(429, { "content-type": "text/plain" }).end("slow down");
    return;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ id: "provider-message-1" }));
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address() as AddressInfo;

process.env.EMAIL_API_KEY = "test-key";
process.env.EMAIL_API_BASE = `http://127.0.0.1:${port}`;
process.env.EMAIL_FROM = "StreamingHub <service@example.test>";
process.env.EMAIL_TIMEOUT_MS = "2000";

const { all, get, run } = await import("./db.ts");
const { sendMail, resendMail } = await import("./mail.ts");

function resetDb() {
  run("DELETE FROM outbox_emails");
  run("DELETE FROM email_suppressions");
}

function resetProvider(next: Mode) {
  mode = next;
  requests = 0;
  lastHeaders = {};
}

function outboxRow(id: string) {
  return get<{
    status: string;
    attempts: number;
    provider_id: string | null;
    provider_status: string | null;
    error: string | null;
    sent_at: string | null;
  }>(
    `SELECT status, attempts, provider_id, provider_status, error, sent_at FROM outbox_emails WHERE id = ?`,
    id,
  );
}

const mail = {
  to: "kunde@example.test",
  subject: "Testnachricht",
  text: "Hallo,\n\ndas ist ein Test.",
  kind: "system" as const,
};

test("successful delivery marks the entry sent", async () => {
  resetDb();
  resetProvider("ok");

  const result = await sendMail(mail);
  assert.equal(result.delivered, true);
  assert.equal(result.queued, false);
  assert.equal(result.reason, null);

  const row = outboxRow(result.id);
  assert.equal(row?.status, "sent");
  assert.equal(row?.attempts, 1);
  assert.equal(row?.provider_id, "provider-message-1");
  assert.equal(row?.provider_status, "sent");
  assert.equal(row?.error, null);
  assert.ok(row?.sent_at);
  assert.equal(requests, 1);
  assert.equal(lastHeaders["idempotency-key"], result.id);
});

test("a 500 is retried once and recorded as failed", async () => {
  resetDb();
  resetProvider("error500");

  const result = await sendMail(mail);
  assert.equal(result.delivered, false);
  assert.equal(result.queued, true);
  assert.equal(result.reason, "provider_error");

  const row = outboxRow(result.id);
  assert.equal(row?.status, "failed");
  assert.equal(row?.attempts, 2);
  assert.match(row?.error ?? "", /HTTP 500/);
  assert.equal(requests, 2);
});

test("a 4xx is not retried", async () => {
  resetDb();
  resetProvider("error400");

  const result = await sendMail(mail);
  assert.equal(result.reason, "provider_error");

  const row = outboxRow(result.id);
  assert.equal(row?.status, "failed");
  assert.equal(row?.attempts, 1);
  assert.match(row?.error ?? "", /HTTP 400/);
  assert.equal(requests, 1);
});

test("a 429 is retried and can succeed", async () => {
  resetDb();
  resetProvider("ratelimit");

  const result = await sendMail(mail);
  assert.equal(result.delivered, true);

  const row = outboxRow(result.id);
  assert.equal(row?.status, "sent");
  assert.equal(row?.attempts, 2);
  assert.equal(requests, 2);
});

test("a suppressed address is never sent", async () => {
  resetDb();
  resetProvider("ok");
  run(
    `INSERT INTO email_suppressions (email, reason, created_at) VALUES (?, 'bounce', ?)`,
    "kunde@example.test",
    new Date().toISOString(),
  );

  const result = await sendMail(mail);
  assert.equal(result.delivered, false);
  assert.equal(result.reason, "suppressed");
  assert.equal(requests, 0);

  const row = outboxRow(result.id);
  assert.equal(row?.status, "suppressed");
  assert.equal(row?.provider_status, "suppressed");
  assert.match(row?.error ?? "", /gesperrt/);
});

test("a dropped connection is retried and reported as network error", async () => {
  resetDb();
  resetProvider("reset");

  const result = await sendMail(mail);
  assert.equal(result.delivered, false);
  assert.equal(result.reason, "network_error");

  const row = outboxRow(result.id);
  assert.equal(row?.status, "failed");
  assert.equal(row?.attempts, 2);
  assert.equal(requests, 2);
});

test("resendMail delivers a failed entry", async () => {
  resetDb();
  resetProvider("error500");
  const failed = await sendMail(mail);
  assert.equal(outboxRow(failed.id)?.status, "failed");

  resetProvider("ok");
  const resent = await resendMail(failed.id);
  assert.equal(resent.delivered, true);

  const row = outboxRow(failed.id);
  assert.equal(row?.status, "sent");
  assert.equal(row?.attempts, 3);
  assert.equal(row?.error, null);
});

test("all outbox rows carry the requested kind", async () => {
  resetDb();
  resetProvider("ok");
  await sendMail(mail);
  const rows = all<{ kind: string }>(`SELECT kind FROM outbox_emails`);
  assert.deepEqual(rows.map((row) => row.kind), ["system"]);
});

after(() => {
  server.close();
});
