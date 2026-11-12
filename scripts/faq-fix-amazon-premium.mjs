#!/usr/bin/env node
/**
 * One-off content fix for the FAQ rows that still promised an Amazon IAP
 * purchase path. The Amazon build ships without premium (docs/IAP-AMAZON.md),
 * so those answers now state that premium is not offered there.
 *
 * Usage:
 *   node scripts/faq-fix-amazon-premium.mjs --dry-run
 *   node scripts/faq-fix-amazon-premium.mjs --backup
 *
 * Reads DATABASE_PATH (default: ./data/streaminghub.db). Idempotent: rows that
 * already carry the new wording are left untouched.
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");
const dryRun = process.argv.includes("--dry-run");
const backup = process.argv.includes("--backup");

if (!fs.existsSync(dbPath)) {
  console.error(`Database not found: ${dbPath}`);
  process.exit(1);
}

const replacements = [
  [
    "Der Abschluss ist über den Web-Checkout für die Sideload-Version vorgesehen; in einer Amazon-Appstore-Version erfolgt der Kauf ausschließlich über Amazon In-App Purchasing.",
    "Der Abschluss ist über den Web-Checkout für die Sideload-Version vorgesehen; in Amazon-Appstore-Versionen wird Premium derzeit nicht angeboten.",
  ],
  [
    "Subscriptions are intended to be completed via the web checkout for the sideload version; in an Amazon Appstore build, purchase is handled exclusively through Amazon In-App Purchasing.",
    "Subscriptions are intended to be completed via the web checkout for the sideload version; premium is currently not offered in Amazon Appstore builds.",
  ],
];

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 10000;");

if (backup && !dryRun) {
  const dir = process.env.BACKUP_DIR ?? path.join(path.dirname(dbPath), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const target = path.join(dir, `faq-fix-${new Date().toISOString().replace(/[:.]/g, "-")}.db`);
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  console.log(`Backup: ${target}`);
}

const rows = db.prepare("SELECT id, a_de, a_en FROM faq_items").all();
let changed = 0;
for (const row of rows) {
  let de = row.a_de;
  let en = row.a_en;
  for (const [oldText, newText] of replacements) {
    de = de.split(oldText).join(newText);
    en = en.split(oldText).join(newText);
  }
  if (de === row.a_de && en === row.a_en) continue;
  changed += 1;
  console.log(`Row ${row.id}: ${dryRun ? "would update" : "updating"}`);
  if (!dryRun) {
    db.prepare("UPDATE faq_items SET a_de = ?, a_en = ?, updated_at = ? WHERE id = ?").run(
      de,
      en,
      new Date().toISOString(),
      row.id,
    );
  }
}

db.close();
console.log(`${dryRun ? "Dry run" : "Done"}: ${changed} FAQ row(s) ${dryRun ? "would change" : "changed"}.`);
