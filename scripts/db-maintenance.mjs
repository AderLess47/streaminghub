#!/usr/bin/env node
/**
 * Hält die Betriebstabellen klein: abgelaufene Sitzungen, verbrauchte oder
 * abgelaufene Einmal-Token, alte Kopplungsanfragen und Rate-Limit-Zähler.
 *
 * Läuft im Produktionscontainer täglich aus docker-entrypoint.sh; lokal mit
 * `npm run maintenance:db`. Ohne diesen Lauf wachsen die Tabellen unbegrenzt
 * und jede Anmeldung wird langsam.
 */
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = process.env.DATABASE_PATH ?? "data/streaminghub.db";

if (!fs.existsSync(dbPath)) {
  console.log(`[maintenance] database not found at ${dbPath}; skipping`);
  process.exit(0);
}

const now = new Date();
const nowIso = now.toISOString();
const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
const db = new DatabaseSync(dbPath);

try {
  db.exec("PRAGMA busy_timeout = 10000;");

  const sessions = Number(
    db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(nowIso).changes ?? 0,
  );
  const authTokens = Number(
    db
      .prepare(
        "DELETE FROM auth_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)",
      )
      .run(nowIso, weekAgo).changes ?? 0,
  );
  const pairingRequests = Number(
    db
      .prepare(
        "DELETE FROM pairing_requests WHERE expires_at < ? OR (claimed_at IS NOT NULL AND claimed_at < ?)",
      )
      .run(weekAgo, weekAgo).changes ?? 0,
  );
  const rateLimits = Number(
    db.prepare("DELETE FROM rate_limits WHERE reset_at < ?").run(nowIso).changes ?? 0,
  );

  console.log(
    JSON.stringify({ ok: true, sessions, authTokens, pairingRequests, rateLimits, database: dbPath }),
  );
} finally {
  db.close();
}
