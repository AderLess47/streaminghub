#!/usr/bin/env node
/**
 * Creates the SQLite database and schema. FAQ content, settings and the
 * administrator account are seeded on the first server request (or by starting
 * the app once) – this keeps the schema in a single source of truth.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const source = fs.readFileSync(path.join(process.cwd(), "src", "lib", "schema.ts"), "utf8");
const match = source.match(/`([\s\S]*?)`/);
if (!match) {
  console.error("Could not read schema from src/lib/schema.ts");
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
db.exec(match[1]);
const tables = db.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type = 'table'").get();
console.log(`Schema applied to ${dbPath} (${tables.c} tables).`);
db.close();
