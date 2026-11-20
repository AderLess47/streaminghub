/**
 * Cloud-Backup: Weiterschauen und Playlist eines Kontos als verschlüsselter
 * Snapshot in R2.
 *
 * Der Snapshot verlässt den Server nie im Klartext: verschlüsselt wird mit
 * AES-256-GCM unter einem Schlüssel, der per HKDF aus `BACKUP_ENCRYPTION_KEY`
 * und der Konto-ID abgeleitet wird. Ein Objekt aus dem Bucket ist damit ohne
 * den Server-Schlüssel wertlos, und zwei Konten teilen sich nie einen Schlüssel.
 *
 * Nur serverseitig verwenden.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, randomUUID } from "node:crypto";
import { all, get, nowIso, run, transaction } from "./db";
import { getEntitlements } from "./entitlements";
import { env, isBackupConfigured } from "./env";
import { isFeatureEnabled } from "./flags";
import { type R2ObjectStore, r2Store } from "./r2";

/** Aufbewahrung: so viele Snapshots bleiben je Konto, ältere werden ersetzt. */
export const MAX_BACKUPS_PER_USER = 3;
export const SNAPSHOT_VERSION = 1;
/** Grenze für den unverschlüsselten Snapshot; ein Backup ist wenige Kilobyte. */
export const DEFAULT_MAX_SNAPSHOT_BYTES = 1024 * 1024;
const PROGRESS_ENTRIES = 500;
const MAGIC = "SHB1";

export type BackupSnapshot = {
  version: number;
  createdAt: string;
  playlist: { url: string } | null;
  progress: {
    mediaUrl: string;
    positionMs: number;
    durationMs: number;
    updatedAt: string;
  }[];
};

export type BackupRecord = {
  id: string;
  createdAt: string;
  sizeBytes: number;
  restoredAt: string | null;
};

export type BackupUnavailable = "disabled" | "not_configured" | "premium_required";

export type BackupErrorCode = BackupUnavailable | "too_large" | "not_found" | "corrupt";

export class BackupError extends Error {
  readonly code: BackupErrorCode;

  constructor(code: BackupErrorCode) {
    super(code);
    this.name = "BackupError";
    this.code = code;
  }
}

/**
 * Darf dieses Konto ein Backup anlegen? Das Flag schaltet die Funktion,
 * das Premium-Recht (`cloudBackup`) entscheidet pro Konto, und ohne
 * Schlüssel/Bucket gibt es keinen Speicherort.
 */
export function backupAvailability(
  userId: string,
): { available: true } | { available: false; reason: BackupUnavailable } {
  if (!isFeatureEnabled("cloudBackup")) return { available: false, reason: "disabled" };
  if (!isBackupConfigured()) return { available: false, reason: "not_configured" };
  if (!getEntitlements(userId).cloudBackup) return { available: false, reason: "premium_required" };
  return { available: true };
}

/** Schlüssel je Konto: derselbe Ausgangsschlüssel ergibt nie denselben Schlüssel. */
function accountKey(userId: string, keyMaterial: string): Buffer {
  const derived = hkdfSync(
    "sha256",
    Buffer.from(keyMaterial, "utf8"),
    Buffer.from(`streaminghub-backup:${userId}`, "utf8"),
    Buffer.from("snapshot-v1", "utf8"),
    32,
  );
  return Buffer.from(derived);
}

/** `SHB1` + 12 Byte IV + 16 Byte Tag + Chiffrat. */
export function encryptSnapshot(
  snapshot: BackupSnapshot,
  userId: string,
  keyMaterial: string,
  iv: Uint8Array = randomBytes(12),
): Buffer {
  const cipher = createCipheriv("aes-256-gcm", accountKey(userId, keyMaterial), iv);
  const body = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(snapshot), "utf8")),
    cipher.final(),
  ]);
  return Buffer.concat([Buffer.from(MAGIC, "ascii"), Buffer.from(iv), cipher.getAuthTag(), body]);
}

export function decryptSnapshot(
  payload: Uint8Array,
  userId: string,
  keyMaterial: string,
): BackupSnapshot {
  const buffer = Buffer.from(payload);
  if (buffer.length <= MAGIC.length + 28 || buffer.subarray(0, 4).toString("ascii") !== MAGIC) {
    throw new BackupError("corrupt");
  }
  const iv = buffer.subarray(4, 16);
  const tag = buffer.subarray(16, 32);
  const body = buffer.subarray(32);
  try {
    const decipher = createDecipheriv("aes-256-gcm", accountKey(userId, keyMaterial), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(body), decipher.final()]);
    const parsed = JSON.parse(plain.toString("utf8")) as BackupSnapshot;
    if (!parsed || typeof parsed !== "object" || parsed.version !== SNAPSHOT_VERSION) {
      throw new BackupError("corrupt");
    }
    return parsed;
  } catch (error) {
    if (error instanceof BackupError) throw error;
    // Falscher Schlüssel oder manipuliertes Objekt – beides ist „unlesbar“.
    throw new BackupError("corrupt");
  }
}

export function collectSnapshot(userId: string, now = new Date()): BackupSnapshot {
  const playlist = get<{ url: string }>(
    `SELECT url FROM customer_playlists WHERE user_id = ? AND customer_requested = 1`,
    userId,
  );
  const progress = all<{
    media_url: string;
    position_ms: number;
    duration_ms: number;
    updated_at: string;
  }>(
    `SELECT media_url, position_ms, duration_ms, updated_at
     FROM watch_progress WHERE user_id = ?
     ORDER BY updated_at DESC LIMIT ?`,
    userId,
    PROGRESS_ENTRIES,
  );

  return {
    version: SNAPSHOT_VERSION,
    createdAt: now.toISOString(),
    playlist: playlist ? { url: playlist.url } : null,
    progress: progress.map((row) => ({
      mediaUrl: row.media_url,
      positionMs: row.position_ms,
      durationMs: row.duration_ms,
      updatedAt: row.updated_at,
    })),
  };
}

export function listBackups(userId: string): BackupRecord[] {
  return all<{ id: string; created_at: string; size_bytes: number; restored_at: string | null }>(
    `SELECT id, created_at, size_bytes, restored_at FROM cloud_backups
     WHERE user_id = ? ORDER BY created_at DESC`,
    userId,
  ).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    sizeBytes: row.size_bytes,
    restoredAt: row.restored_at,
  }));
}

/**
 * Welche Snapshots dürfen weg? Reine Rechnung, damit die Aufbewahrungsregel
 * ohne Speicher testbar ist: die neuesten `keep` bleiben, ältere und
 * abgelaufene fliegen raus.
 */
export function prunableBackups(
  rows: { id: string; createdAt: string }[],
  options: { now: number; retentionDays: number; keep?: number },
): string[] {
  const keep = options.keep ?? MAX_BACKUPS_PER_USER;
  const cutoff = options.now - options.retentionDays * 86_400_000;
  return rows
    .slice()
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .filter((row, index) => index >= keep || Date.parse(row.createdAt) < cutoff)
    .map((row) => row.id);
}

export type BackupDeps = {
  storage?: R2ObjectStore;
  now?: number;
  maxBytes?: number;
  retentionDays?: number;
};

function storage(deps: BackupDeps): R2ObjectStore {
  if (deps.storage) return deps.storage;
  if (!isBackupConfigured()) throw new BackupError("not_configured");
  return r2Store({
    endpoint: env.backup.r2Endpoint,
    bucket: env.backup.r2Bucket,
    accessKeyId: env.backup.r2AccessKeyId,
    secretAccessKey: env.backup.r2SecretAccessKey,
  });
}

export async function createBackup(
  userId: string,
  deps: BackupDeps = {},
): Promise<BackupRecord> {
  const availability = backupAvailability(userId);
  if (!availability.available) throw new BackupError(availability.reason);

  const now = deps.now ?? Date.now();
  const snapshot = collectSnapshot(userId, new Date(now));
  const plainBytes = Buffer.byteLength(JSON.stringify(snapshot));
  if (plainBytes > (deps.maxBytes ?? env.backup.maxBytes)) throw new BackupError("too_large");

  const encrypted = encryptSnapshot(snapshot, userId, env.backup.encryptionKey);
  const id = randomUUID();
  const objectKey = `backups/${userId}/${id}.bin`;

  const store = storage(deps);
  await store.put(objectKey, new Uint8Array(encrypted), "application/octet-stream");

  const createdAt = new Date(now).toISOString();
  run(
    `INSERT INTO cloud_backups (id, user_id, object_key, size_bytes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    userId,
    objectKey,
    encrypted.length,
    createdAt,
  );

  // Alte Snapshots nachziehen; ein Fehler beim Aufräumen darf das frische
  // Backup nicht scheitern lassen.
  const stale = prunableBackups(listBackups(userId), {
    now,
    retentionDays: deps.retentionDays ?? env.backup.retentionDays,
  }).filter((staleId) => staleId !== id);
  for (const staleId of stale) {
    await removeSnapshot(userId, staleId, store);
  }

  return { id, createdAt, sizeBytes: encrypted.length, restoredAt: null };
}

async function removeSnapshot(userId: string, backupId: string, store: R2ObjectStore) {
  const row = get<{ object_key: string }>(
    `SELECT object_key FROM cloud_backups WHERE id = ? AND user_id = ?`,
    backupId,
    userId,
  );
  if (!row) return;
  try {
    await store.delete(row.object_key);
  } catch {
    // Objekt schon weg: die Zeile darf trotzdem verschwinden.
  }
  run(`DELETE FROM cloud_backups WHERE id = ? AND user_id = ?`, backupId, userId);
}

export async function deleteBackup(userId: string, backupId: string, deps: BackupDeps = {}) {
  const row = get<{ id: string }>(
    `SELECT id FROM cloud_backups WHERE id = ? AND user_id = ?`,
    backupId,
    userId,
  );
  if (!row) throw new BackupError("not_found");
  await removeSnapshot(userId, backupId, storage(deps));
}

export type RestoreResult = { progress: number; playlist: boolean };

/**
 * Spielt einen Snapshot zurück.
 *
 * Bewusst vorsichtig: ein Fortschritt wird nur überschrieben, wenn der
 * gespeicherte Stand neuer ist als der lokale – Wiederherstellen darf niemanden
 * auf eine alte Position zurückwerfen. Die Playlist wird nur ergänzt, wenn im
 * Konto keine hinterlegt ist, damit eine Support-Korrektur nicht überschrieben
 * wird.
 */
export async function restoreBackup(
  userId: string,
  backupId: string,
  deps: BackupDeps = {},
): Promise<RestoreResult> {
  const availability = backupAvailability(userId);
  if (!availability.available) throw new BackupError(availability.reason);

  const row = get<{ object_key: string }>(
    `SELECT object_key FROM cloud_backups WHERE id = ? AND user_id = ?`,
    backupId,
    userId,
  );
  if (!row) throw new BackupError("not_found");

  const payload = await storage(deps).get(row.object_key);
  if (!payload) throw new BackupError("not_found");

  const snapshot = decryptSnapshot(payload, userId, env.backup.encryptionKey);
  const restoredAt = new Date(deps.now ?? Date.now()).toISOString();

  const result = transaction(() => {
    let progress = 0;
    for (const entry of snapshot.progress) {
      const existing = get<{ updated_at: string }>(
        `SELECT updated_at FROM watch_progress WHERE user_id = ? AND media_url = ?`,
        userId,
        entry.mediaUrl,
      );
      if (existing && Date.parse(existing.updated_at) >= Date.parse(entry.updatedAt)) continue;
      run(
        `INSERT INTO watch_progress (user_id, media_url, position_ms, duration_ms, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, media_url) DO UPDATE SET
           position_ms = excluded.position_ms,
           duration_ms = excluded.duration_ms,
           updated_at = excluded.updated_at`,
        userId,
        entry.mediaUrl,
        entry.positionMs,
        entry.durationMs,
        entry.updatedAt,
      );
      progress += 1;
    }

    let playlist = false;
    const current = get<{ url: string }>(`SELECT url FROM customer_playlists WHERE user_id = ?`, userId);
    if (snapshot.playlist?.url && !current) {
      run(
        `INSERT INTO customer_playlists (user_id, url, updated_by, customer_requested, created_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
        userId,
        snapshot.playlist.url,
        userId,
        restoredAt,
        restoredAt,
      );
      playlist = true;
    }

    run(`UPDATE cloud_backups SET restored_at = ? WHERE id = ? AND user_id = ?`, restoredAt, backupId, userId);
    return { progress, playlist };
  });

  return result;
}
