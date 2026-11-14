/**
 * Geräte-Kopplung: Code anfordern, Status pollen, Code einlösen, Geräte-Token
 * erhalten und prüfen. Dazu Fehlversuche, Ablauf und Gerätelimit.
 *
 * Aufruf: npm run test:pairing
 */

import assert from "node:assert/strict";
import { sessionToken } from "./fakes/next-headers.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { get, nowIso, run } = await import("@/lib/db");
const { hashPassword } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const { verifyDeviceToken } = await import("@/lib/device-auth");
const { POST: pairingRequest } = await import("@/app/api/v1/pairing/request/route");
const { GET: pairingStatus } = await import("@/app/api/v1/pairing/status/route");
const { POST: activate } = await import("@/app/api/devices/activate/route");

const results: { name: string; ok: boolean; detail?: string }[] = [];

async function check(name: string, body: () => Promise<void> | void) {
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

const PASSWORD_HASH = hashPassword("SicheresPasswort123");

function seedUser(id = "kunde-1", email = "kunde@example.test") {
  const at = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
       created_at, updated_at)
     VALUES (?, ?, ?, 'Test', 'de', 'customer', 1, ?, ?)`,
    id,
    email,
    PASSWORD_HASH,
    at,
    at,
  );
  return id;
}

function jsonRequest(path: string, body: unknown, options: { ip?: string; origin?: string } = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: "streaminghub.org",
    "x-forwarded-for": options.ip ?? "198.18.0.10",
  };
  if (options.origin !== undefined) headers.origin = options.origin;
  return new Request(`https://streaminghub.org${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function newPairing(deviceName = "Wohnzimmer", ip = "198.18.0.10") {
  const response = await pairingRequest(
    jsonRequest(
      "/api/v1/pairing/request",
      { deviceName, platform: "firetv", appVersion: "1.2.3" },
      { ip },
    ),
  );
  assert.equal(response.status, 201);
  return (await response.json()) as {
    requestId: string;
    code: string;
    pollToken: string;
    expiresAt: string;
  };
}

function statusRequest(requestId: string, pollToken: string) {
  return new Request(
    `https://streaminghub.org/api/v1/pairing/status?requestId=${encodeURIComponent(requestId)}`,
    { headers: { authorization: `Bearer ${pollToken}`, host: "streaminghub.org" } },
  );
}

function activateRequest(code: string, options: { origin?: string; deviceName?: string } = {}) {
  return jsonRequest(
    "/api/devices/activate",
    { code, deviceName: options.deviceName },
    { origin: options.origin ?? "https://streaminghub.org" },
  );
}

const userId = seedUser();
const firstPairing = await newPairing();

await check("App fordert einen Kopplungscode an", async () => {
  assert.match(firstPairing.code, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.ok(firstPairing.pollToken.length >= 20);
  assert.ok(new Date(firstPairing.expiresAt).getTime() > Date.now());

  const row = get<{ code_prefix: string; device_name: string; platform: string }>(
    `SELECT code_prefix, device_name, platform FROM pairing_requests WHERE id = ?`,
    firstPairing.requestId,
  );
  assert.equal(row?.code_prefix, firstPairing.code.slice(0, 4));
  assert.equal(row?.device_name, "Wohnzimmer");
  assert.equal(row?.platform, "firetv");
});

await check("Status ist offen, falscher Poll-Token wird abgelehnt", async () => {
  const pending = await pairingStatus(statusRequest(firstPairing.requestId, firstPairing.pollToken));
  assert.equal(pending.status, 200);
  const body = (await pending.json()) as { status: string; activationStatus: string };
  assert.equal(body.status, "pending");
  assert.equal(body.activationStatus, "inactive");

  const wrong = await pairingStatus(statusRequest(firstPairing.requestId, "falsch"));
  assert.equal(wrong.status, 404);

  const missing = await pairingStatus(
    new Request("https://streaminghub.org/api/v1/pairing/status", {
      headers: { host: "streaminghub.org" },
    }),
  );
  assert.equal(missing.status, 400);
});

await check("Kopplung ohne Anmeldung wird abgelehnt", async () => {
  sessionToken.value = null;
  const response = await activate(activateRequest(firstPairing.code));
  assert.equal(response.status, 401);
});

await check("Fremde Herkunft darf nicht koppeln", async () => {
  sessionToken.value = await createSession(userId);
  const response = await activate(
    activateRequest(firstPairing.code, { origin: "https://evil.example" }),
  );
  assert.equal(response.status, 403);
});

await check("Falscher Code zaehlt als Fehlversuch", async () => {
  run("DELETE FROM audit_log");
  const wrongCode = `${firstPairing.code.slice(0, 4)}-ZZZZ`;
  const response = await activate(activateRequest(wrongCode));
  assert.equal(response.status, 400);

  const row = get<{ attempts: number }>(
    `SELECT attempts FROM pairing_requests WHERE id = ?`,
    firstPairing.requestId,
  );
  assert.equal(row?.attempts, 1);

  const audit = get<{ action: string; actor_id: string }>(
    `SELECT action, actor_id FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "device.activation_failed");
  assert.equal(audit?.actor_id, userId);
});

await check("Richtiger Code aktiviert das Geraet", async () => {
  run("DELETE FROM audit_log");
  const response = await activate(activateRequest(firstPairing.code));
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    ok: boolean;
    device: { id: string; name: string; platform: string };
    activationStatus: string;
  };
  assert.equal(body.ok, true);
  assert.equal(body.device.name, "Wohnzimmer");
  assert.equal(body.device.platform, "firetv");
  assert.equal(body.activationStatus, "active");

  const device = get<{ user_id: string; status: string }>(
    `SELECT user_id, status FROM devices WHERE id = ?`,
    body.device.id,
  );
  assert.equal(device?.user_id, userId);
  assert.equal(device?.status, "active");

  const pairing = get<{ claimed_at: string | null; device_id: string | null }>(
    `SELECT claimed_at, device_id FROM pairing_requests WHERE id = ?`,
    firstPairing.requestId,
  );
  assert.ok(pairing?.claimed_at);
  assert.equal(pairing?.device_id, body.device.id);

  const audit = get<{ action: string; target_id: string }>(
    `SELECT action, target_id FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "device.activated");
  assert.equal(audit?.target_id, body.device.id);
});

await check("Status liefert ein gueltiges Geraete-Token", async () => {
  const response = await pairingStatus(statusRequest(firstPairing.requestId, firstPairing.pollToken));
  const body = (await response.json()) as {
    status: string;
    activationToken: string;
    device: { id: string };
    activationStatus: string;
  };
  assert.equal(body.status, "claimed");
  assert.equal(body.activationStatus, "active");

  const payload = verifyDeviceToken(body.activationToken);
  assert.ok(payload, "Token muss die Signaturpruefung bestehen");
  assert.equal(payload?.userId, userId);
  assert.equal(payload?.deviceId, body.device.id);
  assert.ok((payload?.exp ?? 0) > Math.floor(Date.now() / 1000) + 29 * 24 * 3600);

  const again = await pairingStatus(statusRequest(firstPairing.requestId, firstPairing.pollToken));
  assert.equal(again.status, 200, "Status darf mehrfach abgefragt werden");
});

await check("Code ist nur einmal verwendbar", async () => {
  const response = await activate(activateRequest(firstPairing.code));
  assert.equal(response.status, 409);
  const body = (await response.json()) as { error?: { message?: string } };
  assert.match(body.error?.message ?? "", /bereits verwendet/);
});

await check("Abgelaufener Code aktiviert nichts", async () => {
  const pairing = await newPairing("Schlafzimmer", "198.18.0.11");
  const past = new Date(Date.now() - 60_000).toISOString();
  run(`UPDATE pairing_requests SET expires_at = ? WHERE id = ?`, past, pairing.requestId);

  const status = await pairingStatus(statusRequest(pairing.requestId, pairing.pollToken));
  assert.equal(((await status.json()) as { status: string }).status, "expired");

  const response = await activate(activateRequest(pairing.code));
  assert.equal(response.status, 400);
});

await check("Fuenf Fehlversuche sperren den Code", async () => {
  const pairing = await newPairing("Kueche", "198.18.0.12");
  const wrongCode = `${pairing.code.slice(0, 4)}-ZZZZ`;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await activate(activateRequest(wrongCode));
    assert.equal(response.status, 400, `Versuch ${attempt}`);
  }
  const blocked = await activate(activateRequest(pairing.code));
  assert.equal(blocked.status, 429);

  const row = get<{ attempts: number }>(
    `SELECT attempts FROM pairing_requests WHERE id = ?`,
    pairing.requestId,
  );
  assert.equal(row?.attempts, 5);
});

await check("Gerätelimit greift nach zwei aktiven Geraeten", async () => {
  const pairing = await newPairing("Garten", "198.18.0.13");
  const response = await activate(activateRequest(pairing.code));
  assert.equal(response.status, 200);

  const next = await newPairing("Buero", "198.18.0.14");
  const blocked = await activate(activateRequest(next.code));
  assert.equal(blocked.status, 409);
  const body = (await blocked.json()) as { error?: { message?: string } };
  assert.match(body.error?.message ?? "", /Gerätelimit/);
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
