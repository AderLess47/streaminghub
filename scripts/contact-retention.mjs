#!/usr/bin/env node
/**
 * Löscht Kontaktanfragen, die älter als die Aufbewahrungsfrist sind.
 * Läuft im Produktionscontainer täglich aus docker-entrypoint.sh; kann lokal
 * mit `npm run retention:purge` ausgeführt werden.
 *
 * Dieselbe Frist gilt beim Öffnen des Admin-Posteingangs und bei neuen
 * Kontaktanfragen (src/lib/contact-messages.ts). Der Audit-Eintrag entspricht
 * dem dortigen Format.
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.DATABASE_PATH ?? "data/streaminghub.db";
const retentionDays = Math.min(
  Math.max(Number.parseInt(process.env.CONTACT_RETENTION_DAYS ?? "730", 10) || 730, 30),
  3650,
);

if (!fs.existsSync(dbPath)) {
  console.log(`[retention] database not found at ${dbPath}; skipping`);
  process.exit(0);
}

const now = new Date();
const cutoff = new Date(now.getTime() - retentionDays * 86_400_000).toISOString();
const db = new DatabaseSync(dbPath);

try {
  db.exec("PRAGMA busy_timeout = 10000;");
  const result = db
    .prepare("DELETE FROM contact_messages WHERE created_at < ?")
    .run(cutoff);
  const deleted = Number(result.changes ?? 0);

  if (deleted > 0) {
    db.prepare(
      `INSERT INTO audit_log
         (id, actor_id, actor_email, action, target_type, target_id, ip, user_agent, meta, created_at)
       VALUES (?, NULL, NULL, 'contact_messages.purged', 'contact_message', NULL, NULL, '', ?, ?)`,
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
