/**
 * Headless-Tests für die App-API: Fortschritt, Geräte-Aktivierung und
 * Playlist-Abruf.
 *
 * Geprüft werden die echten Routen gegen eine echte SQLite-Datenbank
 * (node:sqlite, temporäre Datei), mit echter Validierung, echtem Rate-Limit und
 * echten Geräte-Tokens (`src/lib/device-auth.ts`). Ersetzt sind nur
 * Session-Cookies, Premium-Status und die NextResponse-Helfer
 * (`scripts/fakes/api.ts`) – die brauchen einen laufenden Server.
 *
 * Aufruf: npm run test:api
 */

import assert from "node:assert/strict";
import { all, nowIso, run } from "@/lib/db";
import {
  normalizePairingCode,
  randomToken,
  sha256,
} from "@/lib/auth";
import { signDeviceToken } from "@/lib/device-auth";
import { GET as getProgress, PUT as putProgress } from "@/app/api/v1/progress/route";
import { GET as getMe } from "@/app/api/v1/me/route";
import { POST as activateDevice } from "@/app/api/devices/activate/route";
import { __setPremium, __setSessionUser } from "./fakes/api";

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, body: () => Promise<void> | void): Promise<void> {
  try {
    await body();
    results.push({ name, ok: true });
    console.log(`  \u2713 ${name}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    console.log(`  \u2717 ${name}\n      ${detail.split("\n")[0]}`);
  }
}

/* --------------------------------- Helfer -------------------------------- */

function resetDb(): void {
  run("DELETE FROM watch_progress");
  run("DELETE FROM devices");
  run("DELETE FROM rate_limits");
  run("DELETE FROM pairing_requests");
  run("DELETE FROM customer_playlists");
  run("DELETE FROM device_tokens");
  __setSessionUser(null);
  __setPremium("user-a", false);
  __setPremium("user-b", false);
  __setPremium("user-limit", false);
}

function seedUser(id: string): void {
  const now = nowIso();
  run(
    `INSERT OR IGNORE INTO users (id, email, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    id,
    `${id}@example.test`,
    "x",
    now,
    now,
  );
}

function seedDevice(id: string, userId: string, status = "active"): void {
  seedUser(userId);
  run(
    `INSERT INTO devices (id, user_id, name, platform, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    userId,
    `Gerät ${id}`,
    "vega",
    status,
    nowIso(),
  );
}

function tokenFor(userId: string, deviceId: string): string {
  return signDeviceToken({ userId, deviceId, exp: Math.floor(Date.now() / 1000) + 3_600 });
}

function seedPairing(
  code: string,
  options: { attempts?: number; expiresAt?: string; claimedAt?: string | null } = {},
): string {
  const normalized = normalizePairingCode(code);
  const id = randomToken(9);
  run(
    `INSERT INTO pairing_requests
       (id, code_hash, code_prefix, device_name, platform, app_version,
        poll_token_hash, attempts, created_at, expires_at, claimed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    sha256(normalized),
    normalized.slice(0, 4),
    "Wohnzimmer",
    "vega",
    "1.0.0",
    sha256("poll"),
    options.attempts ?? 0,
    nowIso(),
    options.expiresAt ?? new Date(Date.now() + 600_000).toISOString(),
    options.claimedAt ?? null,
  );
  return id;
}

function call(
  method: string,
  path: string,
  options: { token?: string | null; origin?: string | null; body?: unknown } = {},
): Request {
  const headers: Record<string, string> = { "content-type": "application/json", host: "app.example" };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  if (options.origin !== null) headers.origin = options.origin ?? "https://app.example";
  return new Request(`https://app.example${path}`, {
    method,
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === "string"
          ? options.body
          : JSON.stringify(options.body),
  });
}

async function bodyOf(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

/* ============================ Fortschritts-API =========================== */

await check("Fortschritt: GET ohne Token 401, mit gesperrtem Gerät 403, ohne Premium 402", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  seedDevice("dev-revoked", "user-a", "revoked");

  assert.equal((await getProgress(call("GET", "/api/v1/progress"))).status, 401);
  assert.equal(
    (await getProgress(call("GET", "/api/v1/progress", { token: "ungueltig" }))).status,
    401,
  );
  assert.equal(
    (await getProgress(call("GET", "/api/v1/progress", { token: tokenFor("user-a", "dev-revoked") })))
      .status,
    403,
  );
  assert.equal(
    (await getProgress(call("GET", "/api/v1/progress", { token: tokenFor("user-a", "dev-a") }))).status,
    402,
  );
});

await check("Fortschritt: GET liefert nur eigene Einträge, neueste zuerst, höchstens 100", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  seedDevice("dev-b", "user-b");
  __setPremium("user-a", true);
  __setPremium("user-b", true);

  const insert = (userId: string, url: string, updatedAt: string) =>
    run(
      `INSERT INTO watch_progress (user_id, media_url, device_id, position_ms, duration_ms, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      url,
      "dev-a",
      60_000,
      600_000,
      updatedAt,
    );
  insert("user-a", "https://x.example/alt.mp4", "2026-11-13T10:00:00.000Z");
  insert("user-a", "https://x.example/neu.mp4", "2026-11-13T12:00:00.000Z");
  insert("user-b", "https://x.example/fremd.mp4", "2026-11-13T13:00:00.000Z");

  const mine = (await bodyOf(
    await getProgress(call("GET", "/api/v1/progress", { token: tokenFor("user-a", "dev-a") })),
  )).items as { url: string }[];
  assert.deepEqual(
    mine.map((item) => item.url),
    ["https://x.example/neu.mp4", "https://x.example/alt.mp4"],
  );

  const other = (await bodyOf(
    await getProgress(call("GET", "/api/v1/progress", { token: tokenFor("user-b", "dev-b") })),
  )).items as { url: string }[];
  assert.deepEqual(
    other.map((item) => item.url),
    ["https://x.example/fremd.mp4"],
  );

  for (let index = 0; index < 105; index += 1) {
    insert("user-a", `https://x.example/${index}.mp4`, new Date(Date.UTC(2026, 10, 13, 12, 0, index)).toISOString());
  }
  const capped = (await bodyOf(
    await getProgress(call("GET", "/api/v1/progress", { token: tokenFor("user-a", "dev-a") })),
  )).items as unknown[];
  assert.equal(capped.length, 100);
});

await check("Fortschritt: PUT speichert unter Token-Nutzer und ignoriert Body-Angaben", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  seedDevice("dev-b", "user-b");
  __setPremium("user-a", true);
  __setPremium("user-b", true);

  const response = await putProgress(
    call("PUT", "/api/v1/progress", {
      token: tokenFor("user-a", "dev-a"),
      body: {
        url: "https://x.example/folge.mp4",
        positionMs: 90_000,
        durationMs: 600_000,
        userId: "user-b",
        deviceId: "dev-b",
      },
    }),
  );
  assert.equal(response.status, 200);

  const rows = all<{ user_id: string; device_id: string; position_ms: number }>(
    "SELECT user_id, device_id, position_ms FROM watch_progress",
  );
  assert.deepEqual(
    rows.map((row) => [row.user_id, row.device_id, row.position_ms]),
    [["user-a", "dev-a", 90_000]],
  );
});

await check("Fortschritt: ungültige Positionen und kaputtes JSON werden abgewiesen", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);
  const token = tokenFor("user-a", "dev-a");

  const invalid = [
    { url: "file:///sdcard/aufnahme.mp4", positionMs: 30_000, durationMs: 600_000 },
    { url: "javascript:alert(1)", positionMs: 30_000, durationMs: 600_000 },
    { url: "https://x.example/a.mp4", positionMs: -1, durationMs: 600_000 },
    { url: "https://x.example/a.mp4", positionMs: 1.5, durationMs: 600_000 },
    { url: "https://x.example/a.mp4", positionMs: 30_000 },
    { url: "https://x.example/a.mp4", positionMs: 900_000, durationMs: 600_000 },
    {},
  ];
  for (const body of invalid) {
    const response = await putProgress(call("PUT", "/api/v1/progress", { token, body }));
    assert.equal(response.status, 400, `akzeptiert: ${JSON.stringify(body)}`);
  }

  const broken = await putProgress(call("PUT", "/api/v1/progress", { token, body: "{kein json" }));
  assert.equal(broken.status, 400);
  assert.equal(all("SELECT * FROM watch_progress").length, 0);
});

await check("Fortschritt: Titelende löscht den Eintrag, Toleranz klemmt aufs Ende", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);
  const token = tokenFor("user-a", "dev-a");
  const url = "https://x.example/folge.mp4";

  await putProgress(call("PUT", "/api/v1/progress", { token, body: { url, positionMs: 550_000, durationMs: 600_000 } }));
  const finished = await putProgress(
    call("PUT", "/api/v1/progress", { token, body: { url, positionMs: 595_000, durationMs: 600_000 } }),
  );
  assert.equal(finished.status, 200);
  assert.equal((await bodyOf(finished)).item, null);
  assert.equal(all("SELECT * FROM watch_progress").length, 0);

  const tooFar = await putProgress(
    call("PUT", "/api/v1/progress", { token, body: { url, positionMs: 900_000, durationMs: 600_000 } }),
  );
  assert.equal(tooFar.status, 400);
});

await check("Fortschritt: fremdes Gerät überschreibt nichts, Rate-Limit greift nach 240 Anfragen", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  seedDevice("dev-b", "user-b");
  __setPremium("user-a", true);
  __setPremium("user-b", true);
  const url = "https://x.example/gemeinsam.mp4";

  await putProgress(
    call("PUT", "/api/v1/progress", { token: tokenFor("user-a", "dev-a"), body: { url, positionMs: 300_000, durationMs: 600_000 } }),
  );
  await putProgress(
    call("PUT", "/api/v1/progress", { token: tokenFor("user-b", "dev-b"), body: { url, positionMs: 30_000, durationMs: 600_000 } }),
  );
  const rows = all<{ user_id: string; position_ms: number }>(
    "SELECT user_id, position_ms FROM watch_progress ORDER BY user_id",
  );
  assert.deepEqual(
    rows.map((row) => [row.user_id, row.position_ms]),
    [
      ["user-a", 300_000],
      ["user-b", 30_000],
    ],
  );

  const limited = tokenFor("user-a", "dev-limit");
  seedDevice("dev-limit", "user-a");
  for (let index = 0; index < 240; index += 1) {
    const response = await putProgress(
      call("PUT", "/api/v1/progress", { token: limited, body: { url: `https://x.example/${index}.mp4`, positionMs: 60_000, durationMs: 600_000 } }),
    );
    assert.equal(response.status, 200, `Anfrage ${index + 1} wurde blockiert`);
  }
  const blocked = await putProgress(
    call("PUT", "/api/v1/progress", { token: limited, body: { url: "https://x.example/zu-viel.mp4", positionMs: 60_000, durationMs: 600_000 } }),
  );
  assert.equal(blocked.status, 429);
  assert.equal(Number(blocked.headers.get("retry-after")) > 0, true);
  assert.equal(all("SELECT * FROM watch_progress WHERE media_url = ?", "https://x.example/zu-viel.mp4").length, 0);
});

/* =========================== Geräte-Aktivierung ========================== */

await check("Aktivierung: ohne Anmeldung 401, fremde Herkunft 403", async () => {
  resetDb();
  seedPairing("ABCD1234");

  const anonymous = await activateDevice(
    call("POST", "/api/devices/activate", { body: { code: "ABCD-1234" } }),
  );
  assert.equal(anonymous.status, 401);

  __setSessionUser({ id: "user-a", email: "a@example.test" });
  const crossSite = await activateDevice(
    call("POST", "/api/devices/activate", { origin: "https://evil.example", body: { code: "ABCD-1234" } }),
  );
  assert.equal(crossSite.status, 403);
  assert.equal((await bodyOf(crossSite)).error.code, "forbidden");
});

await check("Aktivierung: unbekannter Code zählt als Fehlversuch", async () => {
  resetDb();
  seedUser("user-a");
  __setSessionUser({ id: "user-a", email: "a@example.test" });
  seedPairing("ABCD1234");

  const response = await activateDevice(
    call("POST", "/api/devices/activate", { body: { code: "ABCD0000" } }),
  );
  assert.equal(response.status, 400);
  const attempts = all<{ attempts: number }>("SELECT attempts FROM pairing_requests");
  assert.equal(attempts[0].attempts, 1);
  assert.equal(all("SELECT * FROM devices").length, 0);
});

await check("Aktivierung: abgelaufener und bereits verwendeter Code werden abgelehnt", async () => {
  resetDb();
  seedUser("user-a");
  __setSessionUser({ id: "user-a", email: "a@example.test" });

  seedPairing("ABGE1234", { expiresAt: new Date(Date.now() - 60_000).toISOString() });
  const expired = await activateDevice(
    call("POST", "/api/devices/activate", { body: { code: "ABGE-1234" } }),
  );
  assert.equal(expired.status, 400);

  seedPairing("BENU1234", { claimedAt: nowIso() });
  const used = await activateDevice(
    call("POST", "/api/devices/activate", { body: { code: "BENU-1234" } }),
  );
  assert.equal(used.status, 409);
  assert.equal(all("SELECT * FROM devices").length, 0);
});

await check("Aktivierung: gültiger Code legt ein aktives Gerät an und verbraucht den Code", async () => {
  resetDb();
  seedUser("user-a");
  __setSessionUser({ id: "user-a", email: "a@example.test" });
  const pairingId = seedPairing("GUEL1234");

  const response = await activateDevice(
    call("POST", "/api/devices/activate", { body: { code: "gu-el 1234", deviceName: "Schlafzimmer" } }),
  );
  assert.equal(response.status, 200, JSON.stringify(await bodyOf(response.clone())));

  const devices = all<{ id: string; user_id: string; name: string; platform: string; status: string }>(
    "SELECT id, user_id, name, platform, status FROM devices",
  );
  assert.equal(devices.length, 1);
  assert.equal(devices[0].user_id, "user-a");
  assert.equal(devices[0].name, "Schlafzimmer");
  assert.equal(devices[0].platform, "vega");
  assert.equal(devices[0].status, "active");

  const pairing = all<{ claimed_at: string | null; device_id: string | null }>(
    "SELECT claimed_at, device_id FROM pairing_requests WHERE id = ?",
    pairingId,
  );
  assert.notEqual(pairing[0].claimed_at, null, "Code muss als verwendet markiert sein");
  assert.equal(pairing[0].device_id, devices[0].id);

  const audit = all<{ action: string }>("SELECT action FROM audit_log WHERE action = 'device.activated'");
  assert.equal(audit.length, 1);

  // Das frische Gerät funktioniert sofort mit einem Token für genau diese ID.
  const me = await getMe(
    call("GET", "/api/v1/me", { token: tokenFor("user-a", devices[0].id) }),
  );
  assert.equal(me.status, 200);
});

await check("Aktivierung: Gerätelimit des kostenlosen Kontos greift", async () => {
  resetDb();
  seedUser("user-a");
  seedDevice("dev-1", "user-a");
  seedDevice("dev-2", "user-a");
  __setSessionUser({ id: "user-a", email: "a@example.test" });
  seedPairing("LIMI1234");

  const response = await activateDevice(
    call("POST", "/api/devices/activate", { body: { code: "LIMI-1234" } }),
  );
  assert.equal(response.status, 409);
  assert.match((await bodyOf(response)).error.message, /Gerätelimit/);
  assert.equal(all("SELECT * FROM devices").length, 2, "kein drittes Gerät");
});

/* ============================ Playlist-Abruf ============================= */

await check("/me: ohne Token 401, mit Token Konto, Gerät und Abo", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);

  assert.equal((await getMe(call("GET", "/api/v1/me"))).status, 401);

  const response = await getMe(call("GET", "/api/v1/me", { token: tokenFor("user-a", "dev-a") }));
  assert.equal(response.status, 200);
  const data = await bodyOf(response);
  assert.equal(data.account.email, "user-a@example.test");
  assert.equal(data.device.id, "dev-a");
  assert.equal(data.device.activationStatus, "active");
  assert.equal(data.subscription.premiumActive, true);
  assert.equal(data.playlist, null, "ohne Playlist kein Eintrag");
});

await check("/me: Playlist kommt nur für angeforderte, eigene Einträge", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  seedDevice("dev-b", "user-b");
  __setPremium("user-a", true);

  const seedPlaylist = (userId: string, deviceId: string | null, requested: number) =>
    run(
      `INSERT INTO customer_playlists (user_id, device_id, url, customer_requested, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      deviceId,
      `https://listen.example/${userId}.m3u`,
      requested,
      nowIso(),
      nowIso(),
    );

  // Nicht angefordert: bleibt unsichtbar.
  seedPlaylist("user-a", null, 0);
  let data = await bodyOf(await getMe(call("GET", "/api/v1/me", { token: tokenFor("user-a", "dev-a") })));
  assert.equal(data.playlist, null, "customer_requested = 0 darf nicht erscheinen");

  run("DELETE FROM customer_playlists");
  seedPlaylist("user-a", null, 1);
  data = await bodyOf(await getMe(call("GET", "/api/v1/me", { token: tokenFor("user-a", "dev-a") })));
  assert.equal(data.playlist.url, "https://listen.example/user-a.m3u");

  // An ein anderes Gerät gebunden: dieses Gerät sieht sie nicht.
  run("DELETE FROM customer_playlists");
  seedDevice("dev-fremd", "user-a");
  seedPlaylist("user-a", "dev-fremd", 1);
  data = await bodyOf(await getMe(call("GET", "/api/v1/me", { token: tokenFor("user-a", "dev-a") })));
  assert.equal(data.playlist, null, "Playlist eines anderen Geräts bleibt verborgen");
});

await check("/me: gesperrtes Gerät bekommt 403", async () => {
  resetDb();
  seedDevice("dev-revoked", "user-a", "revoked");
  const response = await getMe(
    call("GET", "/api/v1/me", { token: tokenFor("user-a", "dev-revoked") }),
  );
  assert.equal(response.status, 403);
});

/* -------------------------------- Ergebnis ------------------------------- */

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  process.exitCode = 1;
}
