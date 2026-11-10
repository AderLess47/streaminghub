import { randomToken, sha256, normalizePairingCode } from "@/lib/auth";
import { apiError, clientIp, isSameOrigin, json, parseBody, tooManyRequests } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { get, nowIso, run } from "@/lib/db";
import { effectiveStatus, getSubscription } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import { requireUser } from "@/lib/session";
import { activateSchema } from "@/lib/validation";
import { getSetting } from "@/lib/content";

export const runtime = "nodejs";

type PairingRow = {
  id: string;
  code_prefix: string;
  device_name: string;
  platform: string;
  app_version: string | null;
  attempts: number;
  expires_at: string;
  claimed_at: string | null;
};

const MAX_ATTEMPTS = 5;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return apiError("forbidden", "Ungültige Herkunft der Anfrage.");

  let user;
  try {
    user = await requireUser();
  } catch {
    return apiError("unauthorized", "Bitte melde dich an, um ein Gerät zu koppeln.");
  }

  const ip = clientIp(request);
  const ipLimit = rateLimit(rateLimitKey("activate:ip", ip), 20, 900);
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
  const userLimit = rateLimit(rateLimitKey("activate:user", user.id), 20, 3600);
  if (!userLimit.allowed) return tooManyRequests(userLimit.retryAfterSeconds);

  const parsed = await parseBody(request, activateSchema);
  if (!parsed.ok) return parsed.response;

  const normalized = normalizePairingCode(parsed.data.code);
  if (normalized.length < 8) {
    return apiError("invalid_request", "Der Code ist ungültig, abgelaufen oder wurde bereits verwendet.");
  }

  const pairing = get<PairingRow>(
    `SELECT id, code_prefix, device_name, platform, app_version, attempts, expires_at, claimed_at
     FROM pairing_requests WHERE code_hash = ?`,
    sha256(normalized),
  );

  if (!pairing) {
    // Count the failure against open requests sharing the visible prefix so
    // repeated guessing is throttled without revealing whether a code exists.
    const prefix = normalized.slice(0, 4);
    const candidates = get<{ attempts: number }>(
      `SELECT MAX(attempts) AS attempts FROM pairing_requests WHERE code_prefix = ? AND claimed_at IS NULL`,
      prefix,
    );
    if ((candidates?.attempts ?? 0) >= MAX_ATTEMPTS) {
      return apiError("rate_limited", "Zu viele Versuche. Bitte fordere in der App einen neuen Code an.");
    }
    run(
      `UPDATE pairing_requests SET attempts = attempts + 1
       WHERE code_prefix = ? AND claimed_at IS NULL AND expires_at > ?`,
      prefix,
      nowIso(),
    );
    logAudit({ action: "device.activation_failed", actorId: user.id, actorEmail: user.email, ip });
    return apiError("invalid_request", "Der Code ist ungültig, abgelaufen oder wurde bereits verwendet.");
  }

  if (pairing.claimed_at) {
    return apiError("conflict", "Dieser Code wurde bereits verwendet.");
  }
  if (new Date(pairing.expires_at).getTime() < Date.now()) {
    return apiError("invalid_request", "Der Code ist abgelaufen. Bitte fordere in der App einen neuen Code an.");
  }
  if (pairing.attempts >= MAX_ATTEMPTS) {
    return apiError("rate_limited", "Zu viele Versuche. Bitte fordere in der App einen neuen Code an.");
  }

  const subscription = getSubscription(user.id);
  const premium = effectiveStatus(subscription) === "active";
  const limit = Number(getSetting(premium ? "premium_device_limit" : "free_device_limit", premium ? "5" : "2"));
  const activeDevices =
    get<{ c: number }>(`SELECT COUNT(*) AS c FROM devices WHERE user_id = ? AND status = 'active'`, user.id)?.c ?? 0;
  if (activeDevices >= limit) {
    return apiError(
      "conflict",
      "Dein Gerätelimit ist erreicht. Entferne ein Gerät oder aktiviere Premium.",
    );
  }

  const deviceId = randomToken(12);
  const now = nowIso();
  const deviceName = (parsed.data.deviceName || pairing.device_name || "StreamingHub Gerät").slice(0, 60);

  run(
    `INSERT INTO devices (id, user_id, name, platform, app_version, status, activated_at, last_seen_at, created_at)
     VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
    deviceId,
    user.id,
    deviceName,
    pairing.platform,
    pairing.app_version,
    now,
    now,
    now,
  );
  run(
    `UPDATE pairing_requests SET claimed_at = ?, device_id = ?, user_id = ? WHERE id = ?`,
    now,
    deviceId,
    user.id,
    pairing.id,
  );
  run(
    `INSERT INTO device_tokens (token_hash, device_id, user_id, created_at)
     VALUES (?, ?, ?, ?)`,
    sha256(randomToken(16)),
    deviceId,
    user.id,
    now,
  );

  logAudit({
    action: "device.activated",
    actorId: user.id,
    actorEmail: user.email,
    targetType: "device",
    targetId: deviceId,
    ip,
    meta: { platform: pairing.platform, name: deviceName },
  });

  return json({
    ok: true,
    device: { id: deviceId, name: deviceName, platform: pairing.platform, activatedAt: now },
    activationStatus: "active",
  });
}
