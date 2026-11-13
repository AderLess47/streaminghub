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

/**
 * Additive migrations for databases created before a column existed.
 * `CREATE TABLE IF NOT EXISTS` does not alter existing tables.
 */
function migrate(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(outbox_emails)").all() as { name: string }[];
  const existing = new Set(columns.map((column) => column.name));
  const additions: [string, string][] = [
    ["provider_id", "provider_id TEXT"],
    ["provider_status", "provider_status TEXT"],
    ["attempts", "attempts INTEGER NOT NULL DEFAULT 0"],
    ["last_attempt_at", "last_attempt_at TEXT"],
  ];
  for (const [name, definition] of additions) {
    if (!existing.has(name)) db.exec(`ALTER TABLE outbox_emails ADD COLUMN ${definition}`);
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_outbox_provider ON outbox_emails(provider_id)");

  const playlistColumns = db.prepare("PRAGMA table_info(customer_playlists)").all() as { name: string }[];
  if (!playlistColumns.some((column) => column.name === "customer_requested")) {
    db.exec("ALTER TABLE customer_playlists ADD COLUMN customer_requested INTEGER NOT NULL DEFAULT 0");
  }
  if (!playlistColumns.some((column) => column.name === "device_id")) {
    db.exec("ALTER TABLE customer_playlists ADD COLUMN device_id TEXT REFERENCES devices(id) ON DELETE CASCADE");
  }
  db.exec("CREATE INDEX IF NOT EXISTS idx_customer_playlists_device ON customer_playlists(device_id)");

  // Widerrufe und Kündigungen: „erledigt“ kam später dazu, alte Datenbanken
  // kennen die Spalten noch nicht.
  const contractColumns = db.prepare("PRAGMA table_info(contract_requests)").all() as { name: string }[];
  const contractExisting = new Set(contractColumns.map((column) => column.name));
  if (!contractExisting.has("handled_at")) {
    db.exec("ALTER TABLE contract_requests ADD COLUMN handled_at TEXT");
  }
  if (!contractExisting.has("handled_by")) {
    db.exec("ALTER TABLE contract_requests ADD COLUMN handled_by TEXT");
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
