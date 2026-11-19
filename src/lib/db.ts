/**
 * SQLite access layer built on Node's built-in node:sqlite (Node >= 22.5).
 * The connection is cached on globalThis so Next.js dev re-renders and route
 * handlers reuse a single handle. Schema creation is idempotent.
 */
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { env } from "./env";
import { SCHEMA_SQL } from "./schema";

type Statement = ReturnType<DatabaseSync["prepare"]>;

type GlobalCache = typeof globalThis & {
  __streaminghubDb?: DatabaseSync;
  __streaminghubStatements?: Map<string, Statement>;
};

const globalCache = globalThis as GlobalCache;

export function getDb(): DatabaseSync {
  if (globalCache.__streaminghubDb) return globalCache.__streaminghubDb;

  const dir = path.dirname(env.databasePath);
  fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(env.databasePath);
  // Set the lock wait before the initial schema/migration writes. Next.js build
  // workers can otherwise race while creating the database during prerendering.
  db.exec("PRAGMA busy_timeout = 10000;");
  db.exec(SCHEMA_SQL);
  migrate(db);

  globalCache.__streaminghubDb = db;
  globalCache.__streaminghubStatements = new Map();
  return db;
}

/** Spalten einer Tabelle; eine noch fehlende Tabelle liefert eine leere Menge. */
function tableColumns(db: DatabaseSync, table: string) {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return new Set(rows.map((row) => row.name));
}

/**
 * Additive Migration: legt die Spalte nur an, wenn sie fehlt.
 * `CREATE TABLE IF NOT EXISTS` ändert bestehende Tabellen nicht, deshalb braucht
 * jede neue Spalte diesen Weg. Tabellen- und Spaltennamen sind interne
 * Konstanten, niemals Nutzereingaben.
 */
function addColumn(db: DatabaseSync, table: string, name: string, definition: string) {
  if (tableColumns(db, table).has(name)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}

/**
 * Additive migrations for databases created before a column existed.
 * `CREATE TABLE IF NOT EXISTS` does not alter existing tables.
 */
function migrate(db: DatabaseSync) {
  const outboxAdditions: [string, string][] = [
    ["provider_id", "TEXT"],
    ["provider_status", "TEXT"],
    ["attempts", "INTEGER NOT NULL DEFAULT 0"],
    ["last_attempt_at", "TEXT"],
  ];
  for (const [name, definition] of outboxAdditions) {
    addColumn(db, "outbox_emails", name, definition);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_outbox_provider ON outbox_emails(provider_id)");

  addColumn(db, "customer_playlists", "customer_requested", "INTEGER NOT NULL DEFAULT 0");
  addColumn(
    db,
    "customer_playlists",
    "device_id",
    "TEXT REFERENCES devices(id) ON DELETE CASCADE",
  );
  db.exec("CREATE INDEX IF NOT EXISTS idx_customer_playlists_device ON customer_playlists(device_id)");

  // Widerrufe und Kündigungen: „erledigt“ kam später dazu, alte Datenbanken
  // kennen die Spalten noch nicht.
  addColumn(db, "contract_requests", "handled_at", "TEXT");
  addColumn(db, "contract_requests", "handled_by", "TEXT");

  // Abo-Modell: Trial, Abrechnungsintervall und Preis sind eigene Spalten.
  // `plan`/`status` bleiben die Wahrheit für Tarif und Laufzeit, damit
  // Webhooks, Store-Pfade und Bestandsabos unverändert weiterlaufen.
  const subscriptionAdditions: [string, string][] = [
    ["billing_interval", "TEXT"],
    ["provider_price_id", "TEXT"],
    ["price_cents", "INTEGER"],
    ["started_at", "TEXT"],
    ["canceled_at", "TEXT"],
    ["trial_started_at", "TEXT"],
    ["trial_ends_at", "TEXT"],
    ["trial_source", "TEXT"],
    ["trial_used_at", "TEXT"],
    ["trial_converted_at", "TEXT"],
    ["trial_reminder_sent_at", "TEXT"],
    ["trial_ended_at", "TEXT"],
  ];
  for (const [name, definition] of subscriptionAdditions) {
    addColumn(db, "subscriptions", name, definition);
  }
}

function prepare(sql: string): Statement {
  getDb();
  const cache = globalCache.__streaminghubStatements!;
  const cached = cache.get(sql);
  if (cached) return cached;
  const statement = getDb().prepare(sql);
  cache.set(sql, statement);
  return statement;
}

export function all<T = Record<string, unknown>>(
  sql: string,
  ...params: SQLInputValue[]
): T[] {
  return prepare(sql).all(...params) as T[];
}

export function get<T = Record<string, unknown>>(
  sql: string,
  ...params: SQLInputValue[]
): T | undefined {
  return prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, ...params: SQLInputValue[]) {
  return prepare(sql).run(...params);
}

/** node:sqlite has no boolean binding – normalise before writing. */
export const bit = (value: boolean | number) => (value ? 1 : 0);

export function transaction<T>(fn: () => T): T {
  const db = getDb();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export const nowIso = () => new Date().toISOString();

export const addSeconds = (seconds: number, from = Date.now()) =>
  new Date(from + seconds * 1000).toISOString();

export const addDays = (days: number, from = Date.now()) => addSeconds(days * 86_400, from);
