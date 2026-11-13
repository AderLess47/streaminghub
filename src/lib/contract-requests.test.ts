import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Prüft die beiden gesetzlichen Erklärungswege gegen eine echte SQLite-Datei:
 * angelegte Zeile, Referenz, Status und die Zuordnung zum Konto. Genau diese
 * Schicht fällt bei einem Tippfehler im INSERT sonst erst im Betrieb auf.
 *
 * `DATABASE_PATH` muss vor dem Import von `db.ts` gesetzt sein.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-contracts-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");

const { get, nowIso, run } = await import("./db.ts");
const { findContractRequest, recordCancellation, recordWithdrawal } = await import(
  "./contract-requests.ts"
);

function createUser(email: string) {
  const id = `user-${Math.random().toString(36).slice(2, 10)}`;
  run(
    `INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
     VALUES (?, ?, 'x', 'Testkonto', ?, ?)`,
    id,
    email,
    nowIso(),
    nowIso(),
  );
  return id;
}

test("Widerruf wird mit Referenz gespeichert und ist auffindbar", () => {
  const record = recordWithdrawal({
    name: "Ada Beispiel",
    email: "Ada@Example.org",
    contract: "web",
    note: "Bestellung 42",
    ip: "203.0.113.7",
  });

  assert.match(record.reference, /^W-/);
  assert.equal(record.status, "received");
  assert.equal(record.email, "ada@example.org");
  assert.equal(record.contract, "web");

  const stored = findContractRequest(record.reference);
  assert.ok(stored);
  assert.equal(stored?.note, "Bestellung 42");
  assert.equal(stored?.kind, "withdrawal");
});

test("Unbekannte Referenz liefert nichts", () => {
  assert.equal(findContractRequest("W-gibtsnicht"), undefined);
});

test("Kündigung ohne Konto wird belegt und als no_account geführt", async () => {
  const record = await recordCancellation({ email: "niemand@example.org", ip: "203.0.113.8" });

  assert.match(record.reference, /^K-/);
  assert.equal(record.status, "no_account");
  assert.equal(record.effectiveAt, null);
});

test("Kündigung ohne laufendes Abo ändert nichts", async () => {
  const email = "ohne-abo@example.org";
  createUser(email);

  const record = await recordCancellation({ email, ip: "203.0.113.9" });
  assert.equal(record.status, "no_subscription");
});

test("Kündigung eines Store-Abos verweist auf den Store und nennt das Periodenende", async () => {
  const email = "store@example.org";
  const id = createUser(email);
  const periodEnd = "2026-12-31T00:00:00.000Z";
  run(
    `INSERT INTO subscriptions
       (id, user_id, status, channel, provider, current_period_end, updated_at, created_at)
     VALUES (?, ?, 'active', 'apple', 'apple', ?, ?, ?)`,
    `sub-${id}`,
    id,
    periodEnd,
    nowIso(),
    nowIso(),
  );

  const record = await recordCancellation({ email, ip: "203.0.113.10" });
  assert.equal(record.status, "store_channel");
  assert.equal(record.channel, "apple");
  assert.equal(record.effectiveAt, periodEnd);

  const stored = get<{ channel: string }>(
    `SELECT channel FROM contract_requests WHERE reference = ?`,
    record.reference,
  );
  assert.equal(stored?.channel, "apple");
});
