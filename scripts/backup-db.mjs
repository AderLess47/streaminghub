#!/usr/bin/env node
/**
 * Creates a consistent online backup of the StreamingHub SQLite database.
 * Runs inside the production container from docker-entrypoint.sh.
 *
 * VACUUM INTO is safe while the app is running and produces a compact,
 * transactionally consistent copy. Backups are stored next to the database and
 * pruned after BACKUP_RETENTION_DAYS (default: 30).
 */
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "streaminghub.db");
const backupDir = process.env.BACKUP_DIR ?? path.join(path.dirname(dbPath), "backups");
const retentionDays = Math.max(
  1,
  Number.parseInt(process.env.BACKUP_RETENTION_DAYS ?? "30", 10) || 30,
);

if (!fs.existsSync(dbPath)) {
  console.log(`[backup] database not found at ${dbPath}; skipping`);
  process.exit(0);
}

fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 });
try {
  fs.chmodSync(backupDir, 0o700);
} catch {
  // A volume mount may not allow chmod; the directory is still usable.
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `streaminghub-${stamp}-${process.pid}.db`);

try {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec("PRAGMA busy_timeout = 10000;");
    db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  } finally {
    db.close();
  }

  const size = fs.statSync(target).size;
  if (size === 0) throw new Error("backup file is empty");
  fs.chmodSync(target, 0o600);

  const check = new DatabaseSync(target);
  try {
    const result = check.prepare("PRAGMA integrity_check").get();
    const status = String(result?.integrity_check ?? "");
    if (status !== "ok") throw new Error(`integrity_check returned ${status || "no result"}`);
  } finally {
    check.close();
  }

  const cutoff = Date.now() - retentionDays * 86_400_000;
  let pruned = 0;
  for (const name of fs.readdirSync(backupDir)) {
    if (!/^streaminghub-.*\.db$/.test(name)) continue;
    const file = path.join(backupDir, name);
    try {
      if (fs.statSync(file).mtimeMs < cutoff) {
        fs.unlinkSync(file);
        pruned += 1;
      }
    } catch (error) {
      console.warn(`[backup] could not prune ${file}: ${error instanceof Error ? error.message : error}`);
    }
  }

  console.log(
    `[backup] created ${target} (${size} bytes, integrity ok, retention ${retentionDays} days, pruned ${pruned})`,
  );
} catch (error) {
  try {
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch {
    // Ignore cleanup errors; the process still exits non-zero.
  }
  console.error(`[backup] failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
