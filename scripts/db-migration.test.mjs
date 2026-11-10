// Temporary branch: confirms the pull request CI workflow runs on its own.
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

/**
 * Regression guard for the startup schema path.
 *
 * SCHEMA_SQL runs before migrate() on every boot. If it references a column
 * that only migrate() adds (for example an index on customer_playlists.device_id),
 * an existing database without that column fails with "no such column" and the
 * migration itself never runs. These tests apply the real schema and the real
 * migration sources to a database from before those columns existed.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(path.join(root, file), "utf8");

const schemaSource = read("src/lib/schema.ts");
const migrationSource = read("src/lib/db.ts");

function schemaSql() {
  const marker = "export const SCHEMA_SQL = `";
  const start = schemaSource.indexOf(marker);
  assert.notEqual(start, -1, "schema.ts must export SCHEMA_SQL");
  const from = start + marker.length;
  const end = schemaSource.indexOf("`;", from);
  assert.notEqual(end, -1, "SCHEMA_SQL template literal must be terminated");
  return schemaSource.slice(from, end);
}

/** Columns that migrate() adds to a table that already exists. */
function migratedColumns() {
  const found = [];
  for (const match of migrationSource.matchAll(/ALTER TABLE (\w+) ADD COLUMN (\w+)/g)) {
    found.push({ table: match[1], column: match[2] });
  }
  // The outbox columns are added from a [column, definition] list inside a loop.
  const loop = migrationSource.match(/ALTER TABLE (\w+) ADD COLUMN \$\{definition\}/);
  if (loop) {
    for (const match of migrationSource.matchAll(/\["(\w+)",\s*"(\w+)\s+[^"]+"\]/g)) {
      found.push({ table: loop[1], column: match[2] });
    }
  }
  return found;
}

/** A database in the shape it had before the managed-playlist work. */
function legacyDatabase(directory) {
  const db = new DatabaseSync(path.join(directory, "legacy.db"));
  db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE devices (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active'
    );
    CREATE TABLE customer_playlists (
      user_id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      updated_by TEXT,
      customer_requested INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE outbox_emails (
      id TEXT PRIMARY KEY,
      to_email TEXT NOT NULL,
      subject TEXT NOT NULL,
      body_text TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      created_at TEXT NOT NULL,
      sent_at TEXT
    );
    INSERT INTO users (id, email) VALUES ('user-legacy', 'legacy@example.test');
    INSERT INTO devices (id, user_id, name, platform)
      VALUES ('device-legacy', 'user-legacy', 'Wohnzimmer', 'firetv');
    INSERT INTO customer_playlists (user_id, url, customer_requested, created_at, updated_at)
      VALUES ('user-legacy', 'https://provider.example/legacy.m3u', 1,
              '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
  `);
  return db;
}

const tableColumns = (db, table) =>
  db
    .prepare(`select name from pragma_table_info('${table}')`)
    .all()
    .map((row) => row.name);

test("base schema applies cleanly to a database from before the migrated columns", (t) => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-schema-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const db = legacyDatabase(directory);
  t.after(() => db.close());

  const sql = schemaSql();
  assert.doesNotThrow(
    () => db.exec(sql),
    "SCHEMA_SQL must not touch columns that only migrate() adds",
  );

  // The base schema creates tables and indexes; adding missing columns is
  // migrate()'s job, so the legacy tables must still lack them here.
  assert.ok(!tableColumns(db, "customer_playlists").includes("device_id"));
  assert.ok(!tableColumns(db, "outbox_emails").includes("provider_id"));

  // Existing customer data stays untouched.
  const row = db
    .prepare(
      "select url, customer_requested from customer_playlists where user_id = 'user-legacy'",
    )
    .get();
  assert.equal(row.url, "https://provider.example/legacy.m3u");
  assert.equal(row.customer_requested, 1);

  // A restart runs the schema again, so a second pass must stay a no-op.
  assert.doesNotThrow(() => db.exec(sql), "SCHEMA_SQL must be idempotent");
});

test("base schema creates no index on a column that migrate() adds", () => {
  const migrated = migratedColumns();
  assert.ok(
    migrated.some(
      (entry) => entry.table === "customer_playlists" && entry.column === "device_id",
    ),
    "could not detect the migrated device_id column in db.ts",
  );

  const sql = schemaSql();
  for (const { table, column } of migrated) {
    const indexOnColumn = new RegExp(`ON\\s+${table}\\s*\\(\\s*${column}\\b`, "i");
    assert.doesNotMatch(
      sql,
      indexOnColumn,
      `SCHEMA_SQL must not index ${table}.${column}; create that index in migrate() after the column exists`,
    );
  }
});

test("migrate() still adds the device column and its index", () => {
  assert.match(
    migrationSource,
    /ALTER TABLE customer_playlists ADD COLUMN device_id/,
    "migrate() must keep adding customer_playlists.device_id",
  );
  assert.match(
    migrationSource,
    /CREATE INDEX IF NOT EXISTS idx_customer_playlists_device ON customer_playlists\(device_id\)/,
    "migrate() must keep creating the device index",
  );
});
