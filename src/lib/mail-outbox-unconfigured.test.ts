import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Ohne Email-Anbieter wird nur in die Outbox geschrieben. Eigener Prozess, weil
 * `env` die Zugangsdaten beim Import einmalig liest.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-mail-unconfigured-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
process.env.APP_URL = "http://localhost:3000";
process.env.EMAIL_API_KEY = "";
delete process.env.RESEND_API_KEY;

const { get } = await import("./db.ts");
const { sendMail } = await import("./mail.ts");

test("without a provider the mail stays queued", async () => {
  const result = await sendMail({
    to: "kunde@example.test",
    subject: "Testnachricht",
    text: "Hallo",
    kind: "system",
  });

  assert.equal(result.delivered, false);
  assert.equal(result.queued, true);
  assert.equal(result.reason, "email_not_configured");

  const row = get<{ status: string; attempts: number }>(
    `SELECT status, attempts FROM outbox_emails WHERE id = ?`,
    result.id,
  );
  assert.equal(row?.status, "queued");
  assert.equal(row?.attempts, 0);
});
