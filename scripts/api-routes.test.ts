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
import { createHmac } from "node:crypto";
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
import { POST as requestPairingCode } from "@/app/api/v1/pairing/request/route";
import { GET as getPairingStatus } from "@/app/api/v1/pairing/status/route";
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

/* ============================= Geräte-Tokens ============================= */

function payloadOf(token: string): { deviceId: string; userId: string; exp: number } {
  return JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8"));
}

/** Signiert ein beliebiges Payload – so entstehen gefälschte Tokens im Test. */
function signWithSecret(payload: unknown, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

await check("Token: abgelaufene Tokens werden auf beiden Routen abgelehnt", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);

  const expired = signDeviceToken({
    deviceId: "dev-a",
    userId: "user-a",
    exp: Math.floor(Date.now() / 1000) - 10,
  });
  assert.equal((await getProgress(call("GET", "/api/v1/progress", { token: expired }))).status, 401);
  assert.equal((await getMe(call("GET", "/api/v1/me", { token: expired }))).status, 401);

  // Eine Sekunde vor Ablauf gilt der Token noch – die Grenze liegt bei `exp`.
  const soon = signDeviceToken({
    deviceId: "dev-a",
    userId: "user-a",
    exp: Math.floor(Date.now() / 1000) + 5,
  });
  assert.equal((await getMe(call("GET", "/api/v1/me", { token: soon }))).status, 200);
});

await check("Token: gesperrtes Gerät verliert den Zugang sofort", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);
  const token = tokenFor("user-a", "dev-a");

  assert.equal((await getMe(call("GET", "/api/v1/me", { token }))).status, 200);

  run("UPDATE devices SET status = 'revoked' WHERE id = 'dev-a'");
  assert.equal((await getProgress(call("GET", "/api/v1/progress", { token }))).status, 403);
  assert.equal((await getMe(call("GET", "/api/v1/me", { token }))).status, 403);

  // Auch gesperrte Geräte dürfen keinen Fortschritt mehr schreiben.
  const write = await putProgress(
    call("PUT", "/api/v1/progress", { token, body: { url: "https://x.example/a.mp4", positionMs: 1_000, durationMs: 600_000 } }),
  );
  assert.equal(write.status, 403);
  assert.equal(all("SELECT * FROM watch_progress").length, 0);
});

await check("Token: manipulierte, fremd signierte und fremde Geräte werden abgewiesen", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  seedDevice("dev-b", "user-b");
  __setPremium("user-a", true);
  __setPremium("user-b", true);
  const valid = tokenFor("user-a", "dev-a");
  assert.equal((await getProgress(call("GET", "/api/v1/progress", { token: valid }))).status, 200);

  const rejects = async (token: string, status: number, label: string) => {
    assert.equal((await getProgress(call("GET", "/api/v1/progress", { token }))).status, status, label);
    assert.equal((await getMe(call("GET", "/api/v1/me", { token }))).status, status, label);
  };

  await rejects("kein-token-mit-punkt", 401, "kein Punkt");
  await rejects(`${valid.split(".")[0]}.`, 401, "Signatur fehlt");
  await rejects("a.b.c", 401, "zu viele Teile");

  // Nutzer im Payload ausgetauscht, Signatur des Originals behalten.
  const tampered = signWithSecret(
    { ...payloadOf(valid), userId: "user-b" },
    "egal",
  ).replace(/\.[^.]+$/, `.${valid.split(".")[1]}`);
  assert.equal(payloadOf(tampered).userId, "user-b");
  await rejects(tampered, 401, "Signatur passt nicht mehr");

  // Mit falschem Schlüssel signiert sieht formal gültig aus, ist aber wertlos.
  await rejects(
    signWithSecret({ deviceId: "dev-a", userId: "user-a", exp: Math.floor(Date.now() / 1000) + 600 }, "falscher-schluessel"),
    401,
    "fremder Schlüssel",
  );

  // Echt signiert, aber Nutzer und Gerät gehören nicht zusammen.
  await rejects(tokenFor("user-a", "dev-b"), 403, "Gerät gehört user-b");
  await rejects(tokenFor("user-b", "dev-a"), 403, "Gerät gehört user-a");
  await rejects(tokenFor("user-a", "dev-erfunden"), 403, "Gerät existiert nicht");
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

/* ========================== Geräte-Lebenszyklus ========================== */

/**
 * Entspricht `removeDeviceAction` in `src/lib/actions/dashboard.ts`: Das Gerät
 * wird weich gelöscht, die Nutzerbindung gelöst und seine Tokens widerrufen.
 */
function removeDeviceLikeDashboard(deviceId: string): void {
  const now = nowIso();
  run(
    `UPDATE devices SET status = 'revoked', revoked_at = ?, user_id = NULL WHERE id = ?`,
    now,
    deviceId,
  );
  run(`UPDATE device_tokens SET revoked_at = ? WHERE device_id = ?`, now, deviceId);
}

await check("Lebenszyklus: entferntes Gerät verliert seinen Token sofort", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);
  const token = tokenFor("user-a", "dev-a");

  assert.equal((await getMe(call("GET", "/api/v1/me", { token }))).status, 200);

  removeDeviceLikeDashboard("dev-a");

  assert.equal((await getMe(call("GET", "/api/v1/me", { token }))).status, 403);
  assert.equal((await getProgress(call("GET", "/api/v1/progress", { token }))).status, 403);

  // Weich gelöscht: Zeile bleibt für den Audit-Trail, aber ohne Nutzerbindung.
  const row = all<{ status: string; user_id: string | null }>(
    "SELECT status, user_id FROM devices WHERE id = 'dev-a'",
  );
  assert.equal(row[0].status, "revoked");
  assert.equal(row[0].user_id, null);
});

await check("Lebenszyklus: Entfernen gibt das Limit frei, neu aktiviertes Gerät bekommt neue ID", async () => {
  resetDb();
  seedUser("user-a");
  seedDevice("dev-1", "user-a");
  seedDevice("dev-2", "user-a");
  __setSessionUser({ id: "user-a", email: "a@example.test" });
  const oldToken = tokenFor("user-a", "dev-1");

  // Ohne Premium ist bei zwei aktiven Geräten Schluss.
  const pair = await newPairing();
  const blocked = await activateDevice(
    call("POST", "/api/devices/activate", { body: { code: pair.code } }),
  );
  assert.equal(blocked.status, 409);

  // Ein Gerät entfernen – der Code bleibt gültig, weil er nicht verbraucht wurde.
  removeDeviceLikeDashboard("dev-1");
  const activated = await activateDevice(
    call("POST", "/api/devices/activate", { body: { code: pair.code } }),
  );
  assert.equal(activated.status, 200);
  const newDeviceId = (await bodyOf(activated)).device.id as string;
  assert.notEqual(newDeviceId, "dev-1", "Neuaktivierung erzeugt eine neue Geräte-ID");

  const active = all<{ id: string }>(
    "SELECT id FROM devices WHERE user_id = 'user-a' AND status = 'active' ORDER BY id",
  );
  assert.deepEqual(
    active.map((device) => device.id).sort(),
    ["dev-2", newDeviceId].sort(),
    "das entfernte Gerät zählt nicht mehr",
  );

  // Der alte Token bleibt tot, der neue funktioniert.
  assert.equal((await getMe(call("GET", "/api/v1/me", { token: oldToken }))).status, 403);
  const me = await getMe(call("GET", "/api/v1/me", { token: tokenFor("user-a", newDeviceId) }));
  assert.equal(me.status, 200);
  assert.equal((await bodyOf(me)).device.id, newDeviceId);
});

/* ============================== Kopplung ================================= */

const PAIRING_BODY = { deviceName: "Wohnzimmer", platform: "firetv", appVersion: "1.4.0" };

async function newPairing(): Promise<{ requestId: string; code: string; pollToken: string }> {
  const response = await requestPairingCode(
    call("POST", "/api/v1/pairing/request", {
      body: { deviceName: "Wohnzimmer", platform: "firetv", appVersion: "1.4.0" },
    }),
  );
  assert.equal(response.status, 201);
  const data = await bodyOf(response);
  return { requestId: data.requestId, code: data.code, pollToken: data.pollToken };
}

await check("Kopplung: ungültige Anfrage 400, gültige 201 mit Code und Poll-Token", async () => {
  resetDb();

  assert.equal((await requestPairingCode(call("POST", "/api/v1/pairing/request", { body: {} }))).status, 400);
  assert.equal(
    (await requestPairingCode(
      call("POST", "/api/v1/pairing/request", { body: { deviceName: "", platform: "vega" } }),
    )).status,
    400,
  );

  const response = await requestPairingCode(
    call("POST", "/api/v1/pairing/request", { body: PAIRING_BODY }),
  );
  assert.equal(response.status, 201);
  const data = await bodyOf(response);
  assert.match(data.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(typeof data.pollToken, "string");
  assert.equal(data.expiresInSeconds, 600);
  assert.equal(data.pollIntervalSeconds, 3);

  const rows = all<{ code_hash: string; device_name: string; platform: string; poll_token_hash: string }>(
    "SELECT code_hash, device_name, platform, poll_token_hash FROM pairing_requests",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].device_name, "Wohnzimmer");
  assert.equal(rows[0].platform, "firetv");
  assert.notEqual(rows[0].code_hash, data.code, "Code darf nicht im Klartext liegen");
  assert.equal(rows[0].code_hash, sha256(normalizePairingCode(data.code)));
  assert.notEqual(rows[0].poll_token_hash, data.pollToken, "Poll-Token nur als Hash");
});

await check("Kopplung: Status ohne Angaben 400, unbekannt oder falscher Token 404", async () => {
  resetDb();
  const pair = await newPairing();

  assert.equal((await getPairingStatus(call("GET", "/api/v1/pairing/status"))).status, 400);
  assert.equal(
    (await getPairingStatus(
      call("GET", `/api/v1/pairing/status?requestId=${pair.requestId}`, { token: "falsch" }),
    )).status,
    404,
  );
  assert.equal(
    (await getPairingStatus(
      call("GET", "/api/v1/pairing/status?requestId=unbekannt", { token: pair.pollToken }),
    )).status,
    404,
  );
});

await check("Kopplung: ausstehend, abgelaufen und beansprucht", async () => {
  resetDb();
  const pair = await newPairing();

  const pending = await getPairingStatus(
    call("GET", `/api/v1/pairing/status?requestId=${pair.requestId}`, { token: pair.pollToken }),
  );
  assert.equal(pending.status, 200);
  const pendingData = await bodyOf(pending);
  assert.equal(pendingData.status, "pending");
  assert.equal(pendingData.activationStatus, "inactive");

  run(
    "UPDATE pairing_requests SET expires_at = ? WHERE id = ?",
    new Date(Date.now() - 1_000).toISOString(),
    pair.requestId,
  );
  const expired = await bodyOf(
    await getPairingStatus(
      call("GET", `/api/v1/pairing/status?requestId=${pair.requestId}`, { token: pair.pollToken }),
    ),
  );
  assert.equal(expired.status, "expired");
  assert.equal(expired.activationStatus, "inactive");
  assert.equal(expired.activationToken, undefined, "abgelaufen liefert keinen Token");
});

await check("Kopplung: Code anfordern, aktivieren, Status liefert nutzbaren Token", async () => {
  resetDb();
  seedUser("user-a");
  __setSessionUser({ id: "user-a", email: "a@example.test" });

  const pair = await newPairing();
  const statusUrl = `/api/v1/pairing/status?requestId=${pair.requestId}`;

  const activated = await activateDevice(
    call("POST", "/api/devices/activate", { body: { code: pair.code } }),
  );
  assert.equal(activated.status, 200);

  const claimed = await getPairingStatus(call("GET", statusUrl, { token: pair.pollToken }));
  assert.equal(claimed.status, 200);
  const data = await bodyOf(claimed);
  assert.equal(data.status, "claimed");
  assert.equal(data.activationStatus, "active");
  assert.equal(data.device.name, "Wohnzimmer");
  assert.equal(data.device.platform, "firetv");
  assert.equal(typeof data.activationToken, "string");

  // Der ausgestellte Token öffnet die geschützte API genau für dieses Gerät.
  const me = await getMe(call("GET", "/api/v1/me", { token: data.activationToken }));
  assert.equal(me.status, 200);
  const meData = await bodyOf(me);
  assert.equal(meData.device.id, data.device.id);
  assert.equal(meData.device.name, "Wohnzimmer");
  assert.equal(meData.device.activationStatus, "active");

  // Ein zweiter Poll-Token darf die Anfrage nicht lesen.
  const foreign = await getPairingStatus(call("GET", statusUrl, { token: "fremd" }));
  assert.equal(foreign.status, 404);
});

await check("Kopplung: mehr als 15 Anfragen je Adresse werden gebremst", async () => {
  resetDb();
  for (let index = 0; index < 15; index += 1) {
    const response = await requestPairingCode(
      call("POST", "/api/v1/pairing/request", { body: PAIRING_BODY }),
    );
    assert.equal(response.status, 201, `Anfrage ${index + 1} wurde blockiert`);
  }
  const blocked = await requestPairingCode(
    call("POST", "/api/v1/pairing/request", { body: PAIRING_BODY }),
  );
  assert.equal(blocked.status, 429);
  assert.equal(Number(blocked.headers.get("retry-after")) > 0, true);
  assert.equal(all("SELECT * FROM pairing_requests").length, 15, "blockierte Anfrage legt nichts an");
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
