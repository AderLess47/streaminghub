#!/usr/bin/env node
/**
 * Löscht Einträge im Sicherheitsprotokoll, die älter als die Aufbewahrungsfrist
 * sind (Standard 90 Tage, wie in der Datenschutzerklärung zugesagt).
 * Läuft im Produktionscontainer täglich aus docker-entrypoint.sh; lokal mit
 * `npm run retention:audit`.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.DATABASE_PATH ?? "data/streaminghub.db";
const retentionDays = Math.min(
  Math.max(Number.parseInt(process.env.AUDIT_RETENTION_DAYS ?? "90", 10) || 90, 90),
  3650,
);

if (!fs.existsSync(dbPath)) {
  console.log(`[audit-retention] database not found at ${dbPath}; skipping`);
  process.exit(0);
}

const now = new Date();
const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
const db = new DatabaseSync(dbPath);

try {
  db.exec("PRAGMA busy_timeout = 10000;");
  const result = db.prepare("DELETE FROM audit_log WHERE created_at < ?").run(cutoff);
  const deleted = Number(result.changes ?? 0);

  if (deleted > 0) {
    db.prepare(
      `INSERT INTO audit_log
         (id, actor_id, actor_email, action, target_type, target_id, ip, user_agent, meta, created_at)
       VALUES (?, NULL, NULL, 'audit.purged', 'audit_log', NULL, NULL, '', ?, ?)`,
    ).run(
      randomBytes(12).toString("hex"),
      JSON.stringify({ deleted, retentionDays, cutoff }).slice(0, 4000),
      now.toISOString(),
    );
  }

  console.log(
    JSON.stringify({ ok: true, deleted, retentionDays, cutoff, database: dbPath }),
  );
} finally {
  db.close();
}
