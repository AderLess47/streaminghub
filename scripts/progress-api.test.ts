/**
 * Headless-Test für die Fortschritts-API (`src/app/api/v1/progress/route.ts`).
 *
 * Geprüft wird die echte Route gegen eine echte SQLite-Datenbank (node:sqlite,
 * temporäre Datei), echtes Rate-Limit und die echten Fortschrittsregeln.
 * Ersetzt sind nur Geräte-Auth, Premium-Status und die NextResponse-Helfer
 * (`scripts/fakes/progress-api.ts`) – die brauchen einen laufenden Server.
 *
 * Aufruf: npm run test:progress-api
 */

import assert from "node:assert/strict";
import { all, nowIso, run } from "@/lib/db";
import { GET, PUT } from "@/app/api/v1/progress/route";
import {
  __registerDeviceToken,
  __setPremium,
} from "./fakes/progress-api";

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

const BASE = "https://app.example/api/v1/progress";

function resetDb(): void {
  run("DELETE FROM watch_progress");
  run("DELETE FROM devices");
  run("DELETE FROM rate_limits");
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
  const token = `dev-${userId}-${deviceId}`;
  __registerDeviceToken(token, userId, deviceId);
  return token;
}

function call(method: "GET" | "PUT", token: string | null, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return (method === "GET" ? GET : PUT)(
    new Request(BASE, {
      method,
      headers,
      body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

async function payload(response: Response): Promise<{ error?: { code: string }; items?: unknown[]; item?: unknown }> {
  return (await response.json()) as { error?: { code: string }; items?: unknown[]; item?: unknown };
}

/* ------------------------------- Zugang ---------------------------------- */

await check("GET ohne Token: 401 unauthorized", async () => {
  resetDb();
  const response = await call("GET", null);
  assert.equal(response.status, 401);
  assert.equal((await payload(response)).error?.code, "unauthorized");
});

await check("GET mit unbekanntem Token: 401", async () => {
  resetDb();
  const response = await call("GET", "irgendwas");
  assert.equal(response.status, 401);
});

await check("GET mit gesperrtem Gerät: 403 forbidden", async () => {
  resetDb();
  seedDevice("dev-revoked", "user-a", "revoked");
  const response = await call("GET", tokenFor("user-a", "dev-revoked"));
  assert.equal(response.status, 403);
  assert.equal((await payload(response)).error?.code, "forbidden");
});

await check("GET mit Gerät, das es nicht gibt: 403", async () => {
  resetDb();
  seedUser("user-a");
  const response = await call("GET", tokenFor("user-a", "dev-unknown"));
  assert.equal(response.status, 403);
});

await check("GET ohne Premium: 402 premium_required", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  const response = await call("GET", tokenFor("user-a", "dev-a"));
  assert.equal(response.status, 402);
  assert.equal((await payload(response)).error?.code, "premium_required");
});

/* --------------------------- Nur eigene Einträge ------------------------- */

await check("GET liefert nur die eigenen Einträge, neueste zuerst", async () => {
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

  const response = await call("GET", tokenFor("user-a", "dev-a"));
  assert.equal(response.status, 200);
  const items = (await payload(response)).items as { url: string }[];
  assert.deepEqual(
    items.map((item) => item.url),
    ["https://x.example/neu.mp4", "https://x.example/alt.mp4"],
  );

  const other = (await payload(await call("GET", tokenFor("user-b", "dev-b")))).items as { url: string }[];
  assert.deepEqual(
    other.map((item) => item.url),
    ["https://x.example/fremd.mp4"],
  );
});

await check("GET respektiert das Limit von 100 Einträgen", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);
  for (let index = 0; index < 105; index += 1) {
    run(
      `INSERT INTO watch_progress (user_id, media_url, device_id, position_ms, duration_ms, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      "user-a",
      `https://x.example/${index}.mp4`,
      "dev-a",
      60_000,
      600_000,
      new Date(Date.UTC(2026, 10, 13, 12, 0, index)).toISOString(),
    );
  }
  const items = (await payload(await call("GET", tokenFor("user-a", "dev-a")))).items as unknown[];
  assert.equal(items.length, 100);
});

/* -------------------------------- Schreiben ------------------------------ */

await check("PUT speichert unter dem Token-Nutzer, nicht unter Angaben im Body", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  seedDevice("dev-b", "user-b");
  __setPremium("user-a", true);
  __setPremium("user-b", true);

  const response = await call("PUT", tokenFor("user-a", "dev-a"), {
    url: "https://x.example/folge.mp4",
    positionMs: 90_000,
    durationMs: 600_000,
    userId: "user-b",
    deviceId: "dev-b",
  });
  assert.equal(response.status, 200);

  const rows = all<{ user_id: string; device_id: string; position_ms: number }>(
    "SELECT user_id, device_id, position_ms FROM watch_progress",
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].user_id, "user-a", "Body-userId darf nicht greifen");
  assert.equal(rows[0].device_id, "dev-a", "Body-deviceId darf nicht greifen");
  assert.equal(rows[0].position_ms, 90_000);

  const otherUser = (await payload(await call("GET", tokenFor("user-b", "dev-b")))).items as unknown[];
  assert.equal(otherUser.length, 0, "user-b sieht den Eintrag nicht");
});

await check("PUT weist ungültige Positionen ab und schreibt nichts", async () => {
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
    { url: "https://x.example/a.mp4", positionMs: "abc", durationMs: 600_000 },
    {},
  ];

  for (const body of invalid) {
    const response = await call("PUT", token, body);
    assert.equal(response.status, 400, `akzeptiert: ${JSON.stringify(body)}`);
    assert.equal((await payload(response)).error?.code, "invalid_request");
  }
  assert.equal(all("SELECT * FROM watch_progress").length, 0, "keine Zeile geschrieben");
});

await check("PUT weist kaputtes JSON ab", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);
  const response = await call("PUT", tokenFor("user-a", "dev-a"), "{kein json");
  assert.equal(response.status, 400);
  assert.equal((await payload(response)).error?.code, "invalid_request");
});

await check("PUT entfernt den Eintrag, wenn der Titel zu Ende geschaut ist", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);
  const token = tokenFor("user-a", "dev-a");
  const url = "https://x.example/folge.mp4";

  assert.equal((await call("PUT", token, { url, positionMs: 90_000, durationMs: 600_000 })).status, 200);
  assert.equal(all("SELECT * FROM watch_progress").length, 1);

  const response = await call("PUT", token, { url, positionMs: 595_000, durationMs: 600_000 });
  assert.equal(response.status, 200);
  assert.equal((await payload(response)).item, null);
  assert.equal(all("SELECT * FROM watch_progress").length, 0, "Eintrag gelöscht statt fortgesetzt");
});

await check("PUT klemmt Positionen innerhalb der Toleranz und vergisst sie am Titelende", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  __setPremium("user-a", true);
  const token = tokenFor("user-a", "dev-a");
  const url = "https://x.example/folge.mp4";

  // Innerhalb der 60 s Toleranz hinter dem Ende: wird geklemmt und gilt als beendet.
  await call("PUT", token, { url, positionMs: 550_000, durationMs: 600_000 });
  const response = await call("PUT", token, { url, positionMs: 620_000, durationMs: 600_000 });
  assert.equal(response.status, 200);
  assert.equal((await payload(response)).item, null, "geklemmt auf das Ende = beendet");
  assert.equal(all("SELECT * FROM watch_progress").length, 0, "kein Fortsetzungspunkt am Ende");

  // Mehr als 60 s hinter dem Ende bleibt ungültig statt geklemmt.
  const tooFar = await call("PUT", token, { url, positionMs: 900_000, durationMs: 600_000 });
  assert.equal(tooFar.status, 400);
});

/* ------------------------------ Missbrauch ------------------------------- */

await check("Ein Gerät kann Einträge eines anderen Nutzers nicht überschreiben", async () => {
  resetDb();
  seedDevice("dev-a", "user-a");
  seedDevice("dev-b", "user-b");
  __setPremium("user-a", true);
  __setPremium("user-b", true);
  const url = "https://x.example/gemeinsam.mp4";

  await call("PUT", tokenFor("user-a", "dev-a"), { url, positionMs: 300_000, durationMs: 600_000 });
  await call("PUT", tokenFor("user-b", "dev-b"), { url, positionMs: 30_000, durationMs: 600_000 });

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
});

await check("Rate-Limit: nach 240 Anfragen je Gerät kommt 429 mit Retry-After", async () => {
  resetDb();
  seedDevice("dev-limit", "user-limit");
  __setPremium("user-limit", true);
  const token = tokenFor("user-limit", "dev-limit");

  for (let index = 0; index < 240; index += 1) {
    const response = await call("PUT", token, {
      url: `https://x.example/${index}.mp4`,
      positionMs: 60_000,
      durationMs: 600_000,
    });
    assert.equal(response.status, 200, `Anfrage ${index + 1} wurde blockiert`);
  }

  const blocked = await call("PUT", token, {
    url: "https://x.example/zu-viel.mp4",
    positionMs: 60_000,
    durationMs: 600_000,
  });
  assert.equal(blocked.status, 429);
  const retryAfter = Number(blocked.headers.get("retry-after"));
  assert.equal(Number.isInteger(retryAfter) && retryAfter > 0, true, "Retry-After fehlt");
  assert.equal(
    all("SELECT * FROM watch_progress WHERE media_url = ?", "https://x.example/zu-viel.mp4").length,
    0,
    "blockierte Anfrage darf nichts schreiben",
  );
});

/* -------------------------------- Ergebnis ------------------------------- */

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) {
  process.exitCode = 1;
}
