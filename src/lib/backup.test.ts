import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import type { BackupSnapshot } from "./backup.ts";

/**
 * Cloud-Backup: Verschlüsselung, Rechte, Aufbewahrung und Wiederherstellung.
 *
 * Der Speicher wird durch eine Map ersetzt – R2 selbst wird hier nicht
 * angefasst. Die Signatur nach SigV4 wird dagegen gegen das offizielle
 * AWS-Beispiel geprüft, damit ein Tippfehler in der Kanonisierung auffällt,
 * ohne dass echte Zugangsdaten nötig wären.
 */
const directory = mkdtempSync(path.join(os.tmpdir(), "streaminghub-backup-"));
process.env.DATABASE_PATH = path.join(directory, "test.db");
process.env.APP_URL = "http://localhost:3000";
process.env.BACKUP_ENCRYPTION_KEY = "test-key-material-for-streaminghub-backups";
process.env.R2_ENDPOINT = "https://account.r2.cloudflarestorage.com";
process.env.R2_BUCKET = "streaminghub-backups";
process.env.R2_ACCESS_KEY_ID = "test-access-key";
process.env.R2_SECRET_ACCESS_KEY = "test-secret";
delete process.env.RESEND_API_KEY;

const { nowIso, run } = await import("./db.ts");
const {
  BackupError,
  DEFAULT_MAX_SNAPSHOT_BYTES,
  backupAvailability,
  createBackup,
  decryptSnapshot,
  deleteBackup,
  encryptSnapshot,
  listBackups,
  prunableBackups,
  restoreBackup,
} = await import("./backup.ts");
const { buildAuthorization, normalizeEndpoint, r2Store } = await import("./r2.ts");

after(() => rmSync(directory, { recursive: true, force: true }));

const KEY = process.env.BACKUP_ENCRYPTION_KEY;

function setFlag(flag: string, enabled: boolean) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    flag,
    enabled ? "1" : "0",
    nowIso(),
  );
}

/** Konto anlegen; `active` gibt ihm ein laufendes Abo (also Premium-Rechte). */
function seedUser(id: string, active = true) {
  const now = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, created_at, updated_at) VALUES (?, ?, 'x', ?, ?)`,
    id,
    `${id}@example.test`,
    now,
    now,
  );
  if (!active) return;
  run(
    `INSERT INTO subscriptions (id, user_id, plan, status, channel, provider, created_at, updated_at)
     VALUES (?, ?, 'standard', 'active', 'web', 'stripe', ?, ?)`,
    `sub_${id}`,
    id,
    now,
    now,
  );
}

function seedProgress(userId: string, mediaUrl: string, positionMs: number, updatedAt: string) {
  run(
    `INSERT INTO watch_progress (user_id, media_url, position_ms, duration_ms, updated_at)
     VALUES (?, ?, ?, 3600000, ?)
     ON CONFLICT(user_id, media_url) DO UPDATE SET position_ms = excluded.position_ms,
       updated_at = excluded.updated_at`,
    userId,
    mediaUrl,
    positionMs,
    updatedAt,
  );
}

function memoryStore() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    store: {
      async put(key: string, data: Uint8Array) {
        objects.set(key, data);
      },
      async get(key: string) {
        return objects.get(key) ?? null;
      },
      async delete(key: string) {
        objects.delete(key);
      },
    },
  };
}

const snapshot: BackupSnapshot = {
  version: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  playlist: { url: "https://example.test/list.m3u" },
  progress: [
    { mediaUrl: "https://example.test/a.mkv", positionMs: 1000, durationMs: 2000, updatedAt: "2026-01-01T00:00:00.000Z" },
  ],
};

test("SigV4 matches the official AWS example signature", () => {
  // Beispiel aus der AWS-Dokumentation: GET /test.txt auf examplebucket.
  const authorization = buildAuthorization({
    method: "GET",
    path: "/test.txt",
    host: "examplebucket.s3.amazonaws.com",
    headers: { range: "bytes=0-9" },
    payloadHash: createHash("sha256").update("").digest("hex"),
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    timestamp: new Date("2013-05-24T00:00:00Z"),
  });

  assert.match(
    authorization,
    /SignedHeaders=host;range;x-amz-content-sha256;x-amz-date/,
    "Header muessen alphabetisch und vollstaendig signiert sein",
  );
  assert.match(
    authorization,
    /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/,
  );
});

test("a pasted endpoint is cleaned up instead of failing later", () => {
  const host = "ff01094ec1a8c502d827f42987465e0e.r2.cloudflarestorage.com";
  // Platzhalter-Klammern aus der Anleitung, fehlendes Schema, Bucket-Pfad.
  assert.equal(normalizeEndpoint(`https://<${host}>`), `https://${host}`);
  assert.equal(normalizeEndpoint(`  https://${host}/  `), `https://${host}`);
  assert.equal(normalizeEndpoint(host), `https://${host}`);
  assert.equal(normalizeEndpoint(`https://${host}/streaminghub-backups`), `https://${host}`);
  // Unbrauchbare Werte gelten als nicht konfiguriert.
  assert.equal(normalizeEndpoint(""), "");
  assert.equal(normalizeEndpoint("https://<>"), "");
});

test("a PUT sends the body whose hash it signed", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    const store = r2Store({
      endpoint: "https://account.r2.cloudflarestorage.com",
      bucket: "streaminghub-backups",
      accessKeyId: "key",
      secretAccessKey: "secret",
    });
    await store.put("backups/user/one.bin", new Uint8Array([1, 2, 3, 4]), "application/octet-stream");
  } finally {
    globalThis.fetch = original;
  }

  assert.equal(calls.length, 1);
  const headers = calls[0].init.headers as Record<string, string>;
  const body = calls[0].init.body as Uint8Array;
  // Regression: der Body fehlte, der Hash galt aber fuer die Verschluesselung.
  assert.deepEqual([...body], [1, 2, 3, 4], "der signierte Hash muss zum gesendeten Body passen");
  assert.equal(headers["x-amz-content-sha256"], createHash("sha256").update(body).digest("hex"));
  assert.equal(calls[0].url, "https://account.r2.cloudflarestorage.com/streaminghub-backups/backups/user/one.bin");
});

test("encryption round-trips and is bound to the account", () => {
  const payload = encryptSnapshot(snapshot, "user-a", KEY);
  assert.equal(payload.subarray(0, 4).toString("ascii"), "SHB1");
  assert.deepEqual(decryptSnapshot(payload, "user-a", KEY), snapshot);

  // Derselbe Ausgangsschluessel, anderes Konto: nicht lesbar.
  assert.throws(() => decryptSnapshot(payload, "user-b", KEY), (error: unknown) => {
    return error instanceof BackupError && error.code === "corrupt";
  });
});

test("a modified object is rejected instead of restored", () => {
  const payload = Buffer.from(encryptSnapshot(snapshot, "user-a", KEY));
  payload[payload.length - 1] ^= 0xff;
  assert.throws(() => decryptSnapshot(payload, "user-a", KEY), /corrupt/);
});

test("availability follows flag, configuration and premium", () => {
  seedUser("bk-free", false);
  seedUser("bk-pro");

  setFlag("cloud_backup_enabled", false);
  assert.deepEqual(backupAvailability("bk-pro"), { available: false, reason: "disabled" });

  setFlag("cloud_backup_enabled", true);
  assert.deepEqual(backupAvailability("bk-free"), {
    available: false,
    reason: "premium_required",
  });
  assert.deepEqual(backupAvailability("bk-pro"), { available: true });
});

test("creating a backup stores only ciphertext and lists it", async () => {
  seedUser("bk-create");
  seedProgress("bk-create", "https://example.test/one.mkv", 5000, nowIso());
  const { objects, store } = memoryStore();

  const record = await createBackup("bk-create", { storage: store });
  assert.equal(listBackups("bk-create").length, 1);
  assert.equal(record.sizeBytes > 0, true);

  const [stored] = [...objects.values()];
  const plain = Buffer.from(stored).toString("utf8");
  assert.equal(plain.includes("example.test"), false, "kein Klartext im Objekt");

  const restoredSnapshot = decryptSnapshot(stored, "bk-create", KEY);
  assert.equal(restoredSnapshot.progress.length, 1);
  assert.equal(restoredSnapshot.progress[0].positionMs, 5000);
});

test("a snapshot keeps at most 500 progress entries", async () => {
  seedUser("bk-cap");
  const base = Date.parse(nowIso());
  for (let i = 0; i < 520; i++) {
    seedProgress("bk-cap", `https://example.test/cap-${i}.mkv`, i, new Date(base + i * 1_000).toISOString());
  }

  const { objects, store } = memoryStore();
  await createBackup("bk-cap", { storage: store });

  const [stored] = [...objects.values()];
  const snapshot = decryptSnapshot(stored, "bk-cap", KEY);
  assert.equal(snapshot.progress.length, 500, "hoechstens 500 Fortschritte je Snapshot");
  assert.equal(snapshot.progress[0].mediaUrl, "https://example.test/cap-519.mkv");
  assert.equal(
    snapshot.progress.some((entry) => entry.mediaUrl.endsWith("cap-0.mkv")),
    false,
    "der aelteste Fortschritt faellt heraus",
  );
});

test("an oversized snapshot is refused", async () => {
  assert.equal(DEFAULT_MAX_SNAPSHOT_BYTES, 1024 * 1024, "die Grenze bleibt bei 1 MiB");

  seedUser("bk-large");
  const { store } = memoryStore();
  await assert.rejects(createBackup("bk-large", { storage: store, maxBytes: 10 }), (error: unknown) => {
    return error instanceof BackupError && error.code === "too_large";
  });
});

test("restore brings back removed progress but never rewinds newer state", async () => {
  seedUser("bk-restore");
  seedProgress("bk-restore", "https://example.test/old.mkv", 1000, "2026-01-01T00:00:00.000Z");
  seedProgress("bk-restore", "https://example.test/gone.mkv", 2000, "2026-01-01T00:00:00.000Z");

  const { store } = memoryStore();
  const record = await createBackup("bk-restore", { storage: store });

  // Danach: eine Position weiter, die andere geloescht.
  seedProgress("bk-restore", "https://example.test/old.mkv", 9000, "2026-06-01T00:00:00.000Z");
  run(`DELETE FROM watch_progress WHERE user_id = ? AND media_url = ?`, "bk-restore", "https://example.test/gone.mkv");

  const result = await restoreBackup("bk-restore", record.id, { storage: store });
  assert.equal(result.progress, 1, "nur der fehlende Eintrag kommt zurueck");

  // node:sqlite liefert Zeilen ohne Prototyp; fuer den Vergleich normalisieren.
  const rows = await import("./db.ts").then(({ all }) =>
    all<{ media_url: string; position_ms: number }>(
      `SELECT media_url, position_ms FROM watch_progress WHERE user_id = ? ORDER BY media_url`,
      "bk-restore",
    ).map((row) => ({ media_url: row.media_url, position_ms: row.position_ms })),
  );
  assert.deepEqual(rows, [
    { media_url: "https://example.test/gone.mkv", position_ms: 2000 },
    { media_url: "https://example.test/old.mkv", position_ms: 9000 },
  ]);
});

test("restore adds a missing playlist but keeps an existing one", async () => {
  seedUser("bk-playlist");
  const now = nowIso();
  run(
    `INSERT INTO customer_playlists (user_id, url, updated_by, customer_requested, created_at, updated_at)
     VALUES (?, 'https://example.test/original.m3u', ?, 1, ?, ?)`,
    "bk-playlist",
    "bk-playlist",
    now,
    now,
  );

  const { store } = memoryStore();
  const record = await createBackup("bk-playlist", { storage: store });

  // Support hat die Playlist zwischenzeitlich korrigiert.
  run(`UPDATE customer_playlists SET url = 'https://example.test/fixed.m3u' WHERE user_id = ?`, "bk-playlist");
  const kept = await restoreBackup("bk-playlist", record.id, { storage: store });
  assert.equal(kept.playlist, false);
  const current = await import("./db.ts").then(({ get }) =>
    get<{ url: string }>(`SELECT url FROM customer_playlists WHERE user_id = ?`, "bk-playlist"),
  );
  assert.equal(current?.url, "https://example.test/fixed.m3u");

  // Ohne Playlist wird sie aus der Sicherung ergaenzt.
  run(`DELETE FROM customer_playlists WHERE user_id = ?`, "bk-playlist");
  const added = await restoreBackup("bk-playlist", record.id, { storage: store });
  assert.equal(added.playlist, true);
});

test("deleting removes row and object", async () => {
  seedUser("bk-delete");
  const { objects, store } = memoryStore();
  const record = await createBackup("bk-delete", { storage: store });
  assert.equal(objects.size, 1);

  await deleteBackup("bk-delete", record.id, { storage: store });
  assert.equal(objects.size, 0);
  assert.equal(listBackups("bk-delete").length, 0);
  await assert.rejects(deleteBackup("bk-delete", record.id, { storage: store }), /not_found/);
});

test("foreign backups are not reachable", async () => {
  seedUser("bk-owner");
  seedUser("bk-other");
  const { store } = memoryStore();
  const record = await createBackup("bk-owner", { storage: store });

  await assert.rejects(restoreBackup("bk-other", record.id, { storage: store }), /not_found/);
  await assert.rejects(deleteBackup("bk-other", record.id, { storage: store }), /not_found/);
});

test("pruning keeps the newest snapshots and drops expired ones", () => {
  const now = Date.parse("2026-06-01T00:00:00.000Z");
  const day = 86_400_000;
  const rows = [
    { id: "oldest-expired", createdAt: new Date(now - 400 * day).toISOString() },
    { id: "a", createdAt: new Date(now - 3 * day).toISOString() },
    { id: "b", createdAt: new Date(now - 2 * day).toISOString() },
    { id: "c", createdAt: new Date(now - 1 * day).toISOString() },
  ];

  const stale = prunableBackups(rows, { now, retentionDays: 365, keep: 3 });
  assert.deepEqual(stale, ["oldest-expired"]);
});

test("creating prunes beyond the per-account limit", async () => {
  seedUser("bk-prune");
  const { objects, store } = memoryStore();
  for (let index = 0; index < 5; index += 1) {
    await createBackup("bk-prune", { storage: store, now: Date.now() + index * 1000 });
  }
  assert.equal(listBackups("bk-prune").length, 3);
  assert.equal(objects.size, 3);
});
