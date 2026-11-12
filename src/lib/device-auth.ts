import { createHmac, timingSafeEqual } from "node:crypto";
import { get, nowIso, run } from "./db";
import { randomToken } from "./auth";

/**
 * Stateless device activation tokens.
 *
 * The signing secret is generated once and stored in the `settings` table so it
 * never leaves the server. Revocation is enforced by checking the device status
 * on every request, so unlinking a device invalidates its token immediately.
 */
function apiSecret(): string {
  const existing = get<{ value: string }>(`SELECT value FROM settings WHERE key = 'api_signing_secret'`);
  if (existing?.value) return existing.value;
  const secret = randomToken(48);
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES ('api_signing_secret', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    secret,
    nowIso(),
  );
  return secret;
}

const b64url = (value: string) => Buffer.from(value, "utf8").toString("base64url");

export type DeviceTokenPayload = {
  deviceId: string;
  userId: string;
  exp: number;
};

export function signDeviceToken(payload: DeviceTokenPayload): string {
  const body = b64url(JSON.stringify(payload));
  const signature = createHmac("sha256", apiSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyDeviceToken(token: string): DeviceTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = createHmac("sha256", apiSecret()).update(body).digest("base64url");
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as DeviceTokenPayload;
    if (!payload.deviceId || !payload.userId) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

export type DeviceAuthentication =
  | { ok: true; userId: string; deviceId: string }
  | { ok: false; code: "unauthorized" | "forbidden"; message: string };

/**
 * Resolves the bearer token of an app request against the device row, so an
 * unlinked or revoked device loses access immediately.
 */
export function authenticateDevice(request: Request): DeviceAuthentication {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return { ok: false, code: "unauthorized", message: "Bearer-Token fehlt." };

  const payload = verifyDeviceToken(token);
  if (!payload) {
    return { ok: false, code: "unauthorized", message: "Token ungültig oder abgelaufen." };
  }

  const device = get<{ status: string }>(
    `SELECT status FROM devices WHERE id = ? AND user_id = ?`,
    payload.deviceId,
    payload.userId,
  );
  if (!device || device.status !== "active") {
    return { ok: false, code: "forbidden", message: "Dieses Gerät ist nicht mehr aktiviert." };
  }

  return { ok: true, userId: payload.userId, deviceId: payload.deviceId };
}
