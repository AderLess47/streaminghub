/**
 * Gerät entfernen und Token-Sperre: Kunde entfernt sein Gerät, Admin sperrt es,
 * fremde Nutzer dürfen es nicht – und der alte Token wirkt sofort nicht mehr.
 *
 * Aufruf: npm run test:device-revoke
 */

import assert from "node:assert/strict";
import { sessionToken } from "./fakes/next-headers.ts";
import { RedirectError } from "./fakes/next-navigation.ts";
import { revalidated } from "./fakes/next-cache.ts";

process.env.APP_URL = "https://streaminghub.org";
process.env.EMAIL_API_KEY = "";

const { get, nowIso, run } = await import("@/lib/db");
const { hashPassword } = await import("@/lib/auth");
const { createSession } = await import("@/lib/session");
const { signDeviceToken } = await import("@/lib/device-auth");
const { removeDeviceAction } = await import("@/lib/actions/dashboard");
const { revokeDeviceAction } = await import("@/lib/actions/admin");
const { GET: me } = await import("@/app/api/v1/me/route");

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

function seedUser(id: string, email: string, role: "customer" | "admin" = "customer") {
  const at = nowIso();
  run(
    `INSERT INTO users (id, email, password_hash, display_name, locale, role, email_verified,
       created_at, updated_at)
     VALUES (?, ?, ?, 'Test', 'de', ?, 1, ?, ?)`,
    id,
    email,
    PASSWORD_HASH,
    role,
    at,
    at,
  );
  if (role === "admin") {
    run(
      `INSERT INTO mfa_secrets (user_id, secret, confirmed_at, created_at)
       VALUES (?, 'JBSWY3DPEHPK3PXP', ?, ?)`,
      id,
      at,
      at,
    );
  }
  return id;
}

function seedDevice(id: string, userId: string, name = "Wohnzimmer") {
  const at = nowIso();
  run(
    `INSERT INTO devices (id, user_id, name, platform, app_version, status, activated_at,
       last_seen_at, created_at)
     VALUES (?, ?, ?, 'firetv', '1.2.3', 'active', ?, ?, ?)`,
    id,
    userId,
    name,
    at,
    at,
    at,
  );
  run(
    `INSERT INTO device_tokens (token_hash, device_id, user_id, created_at)
     VALUES (?, ?, ?, ?)`,
    `hash-${id}`,
    id,
    userId,
    at,
  );
  return signDeviceToken({
    deviceId: id,
    userId,
    exp: Math.floor(Date.now() / 1000) + 86_400,
  });
}

function deviceRow(id: string) {
  return get<{ status: string; user_id: string | null; revoked_at: string | null }>(
    `SELECT status, user_id, revoked_at FROM devices WHERE id = ?`,
    id,
  );
}

function tokenRow(id: string) {
  return get<{ revoked_at: string | null }>(
    `SELECT revoked_at FROM device_tokens WHERE device_id = ?`,
    id,
  );
}

function meRequest(token: string) {
  return new Request("https://streaminghub.org/api/v1/me", {
    headers: { authorization: `Bearer ${token}`, host: "streaminghub.org" },
  });
}

async function removeAs(deviceId: string) {
  const form = new FormData();
  form.set("deviceId", deviceId);
  await removeDeviceAction(form);
}

async function revokeAsStaff(deviceId: string): Promise<string> {
  const form = new FormData();
  form.set("deviceId", deviceId);
  try {
    await revokeDeviceAction(form);
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Aktion muss weiterleiten");
    return error.digest;
  }
  return "";
}

seedUser("kunde-1", "kunde@example.test");
seedUser("kunde-2", "andere@example.test");
seedUser("admin-1", "admin@example.test", "admin");

const tokenA = seedDevice("geraet-a", "kunde-1", "Wohnzimmer");
const tokenB = seedDevice("geraet-b", "kunde-1", "Schlafzimmer");
const tokenC = seedDevice("geraet-c", "kunde-2", "Kueche");

await check("Aktives Geraet erreicht die App-API", async () => {
  const response = await me(meRequest(tokenA));
  assert.equal(response.status, 200);
  const body = (await response.json()) as { device: { id: string; activationStatus: string } };
  assert.equal(body.device.id, "geraet-a");
  assert.equal(body.device.activationStatus, "active");
});

await check("Kunde entfernt sein Geraet", async () => {
  run("DELETE FROM audit_log");
  revalidated.length = 0;
  sessionToken.value = await createSession("kunde-1");

  await removeAs("geraet-a");

  const device = deviceRow("geraet-a");
  assert.equal(device?.status, "revoked");
  assert.equal(device?.user_id, null, "Geraet wird vom Konto geloest");
  assert.ok(device?.revoked_at);
  assert.ok(tokenRow("geraet-a")?.revoked_at, "Geraetetoken wird widerrufen");
  assert.ok(revalidated.includes("/dashboard"), "Dashboard wird neu geladen");

  const audit = get<{ action: string; target_id: string; meta: string | null }>(
    `SELECT action, target_id, meta FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "device.revoked");
  assert.equal(audit?.target_id, "geraet-a");
  assert.deepEqual(JSON.parse(audit?.meta ?? "{}"), { name: "Wohnzimmer" });
});

await check("Alter Token ist sofort gesperrt", async () => {
  const response = await me(meRequest(tokenA));
  assert.equal(response.status, 403);
  const body = (await response.json()) as { error?: { message?: string } };
  assert.match(body.error?.message ?? "", /nicht mehr aktiviert/);
});

await check("Anderes Konto darf das Geraet nicht entfernen", async () => {
  sessionToken.value = await createSession("kunde-2");
  await removeAs("geraet-b");

  assert.equal(deviceRow("geraet-b")?.status, "active");
  const response = await me(meRequest(tokenB));
  assert.equal(response.status, 200, "unberechtigtes Entfernen ändert nichts");
});

await check("Unbekannte Geraete-ID wird still ignoriert", async () => {
  run("DELETE FROM audit_log");
  sessionToken.value = await createSession("kunde-1");
  await removeAs("gibt-es-nicht");
  assert.equal(
    get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'device.revoked'`)?.c,
    0,
  );
});

await check("Ohne Anmeldung wird nichts entfernt", async () => {
  sessionToken.value = null;
  let digest = "";
  try {
    await removeAs("geraet-b");
  } catch (error) {
    assert.ok(error instanceof RedirectError, "Anmeldung muss erzwungen werden");
    digest = error.digest;
  }
  assert.match(digest, /\/login\?next=/);
  assert.equal(deviceRow("geraet-b")?.status, "active");
});

await check("Support/Admin sperrt das Geraet", async () => {
  run("DELETE FROM audit_log");
  sessionToken.value = await createSession("admin-1");

  const digest = await revokeAsStaff("geraet-c");
  assert.match(digest, /\/admin\/devices\?ok=revoked/);

  const device = deviceRow("geraet-c");
  assert.equal(device?.status, "revoked");
  assert.equal(device?.user_id, "kunde-2", "Eigentum bleibt fuer die Historie erhalten");
  assert.ok(tokenRow("geraet-c")?.revoked_at);

  const audit = get<{ action: string; actor_id: string; target_id: string }>(
    `SELECT action, actor_id, target_id FROM audit_log ORDER BY created_at DESC LIMIT 1`,
  );
  assert.equal(audit?.action, "admin.device_revoked");
  assert.equal(audit?.actor_id, "admin-1");
  assert.equal(audit?.target_id, "geraet-c");
});

await check("Token des gesperrten Geraets ist sofort ungueltig", async () => {
  const response = await me(meRequest(tokenC));
  assert.equal(response.status, 403);
});

await check("Kunde kann sein verbleibendes Geraet weiter nutzen", async () => {
  const response = await me(meRequest(tokenB));
  assert.equal(response.status, 200);
});

await check("Unbekanntes Geraet sperrt der Admin nicht", async () => {
  run("DELETE FROM audit_log");
  const digest = await revokeAsStaff("gibt-es-nicht");
  assert.equal(digest, "");
  assert.equal(
    get<{ c: number }>(`SELECT COUNT(*) AS c FROM audit_log WHERE action = 'admin.device_revoked'`)?.c,
    0,
  );
});

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} Prüfungen bestanden.`);
if (failed.length > 0) process.exitCode = 1;
