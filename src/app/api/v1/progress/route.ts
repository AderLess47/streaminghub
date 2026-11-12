import { apiError, clientIp, json, tooManyRequests } from "@/lib/api";
import { all, get, nowIso, run } from "@/lib/db";
import { verifyDeviceToken } from "@/lib/device-auth";
import { effectiveStatus, getSubscription } from "@/lib/payments";
import { rateLimit, rateLimitKey } from "@/lib/rate-limit";
import {
  PROGRESS_LIMIT,
  parseProgressInput,
  shouldRemember,
  toEntry,
  type ProgressRow,
} from "@/lib/watch-progress";

export const runtime = "nodejs";

type Session = { userId: string; deviceId: string };

/**
 * Cross-device resume for premium accounts. The app writes the position of the
 * title it is playing and reads the positions of the other devices, so a film
 * started in the living room continues in the bedroom.
 */
function deviceSession(request: Request): Session | { error: ReturnType<typeof apiError> } {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return { error: apiError("unauthorized", "Bearer-Token fehlt.") };

  const payload = verifyDeviceToken(token);
  if (!payload) return { error: apiError("unauthorized", "Token ungültig oder abgelaufen.") };

  const device = get<{ status: string }>(
    `SELECT status FROM devices WHERE id = ? AND user_id = ?`,
    payload.deviceId,
    payload.userId,
  );
  if (!device || device.status !== "active") {
    return { error: apiError("forbidden", "Dieses Gerät ist nicht mehr aktiviert.") };
  }

  return { userId: payload.userId, deviceId: payload.deviceId };
}

function premiumGate(userId: string) {
  const subscription = getSubscription(userId);
  if (effectiveStatus(subscription) !== "active") {
    return apiError(
      "premium_required",
      "Weiterschauen auf allen Geräten gehört zu Premium. Aktiviere Premium und versuche es erneut.",
    );
  }
  return null;
}

export async function GET(request: Request) {
  const session = deviceSession(request);
  if ("error" in session) return session.error;

  const denied = premiumGate(session.userId);
  if (denied) return denied;

  const rows = all<ProgressRow>(
    `SELECT media_url, position_ms, duration_ms, updated_at
     FROM watch_progress WHERE user_id = ?
     ORDER BY updated_at DESC LIMIT ?`,
    session.userId,
    PROGRESS_LIMIT,
  );

  return json({ items: rows.map(toEntry) });
}

export async function PUT(request: Request) {
  const session = deviceSession(request);
  if ("error" in session) return session.error;

  const denied = premiumGate(session.userId);
  if (denied) return denied;

  const limit = rateLimit(rateLimitKey("progress:device", session.deviceId), 240, 900);
  if (!limit.allowed) return tooManyRequests(limit.retryAfterSeconds);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return apiError("invalid_request", "Die Anfrage war kein gültiges JSON.");
  }

  const parsed = parseProgressInput(raw);
  if (!parsed.ok) return apiError("invalid_request", parsed.message);

  const value = parsed.value;
  if (!shouldRemember(value)) {
    // Finished or barely started: forget the title instead of resuming it.
    run(
      `DELETE FROM watch_progress WHERE user_id = ? AND media_url = ?`,
      session.userId,
      value.url,
    );
    return json({ ok: true, item: null });
  }

  const now = nowIso();
  run(
    `INSERT INTO watch_progress (user_id, media_url, device_id, position_ms, duration_ms, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, media_url) DO UPDATE SET
       device_id = excluded.device_id,
       position_ms = excluded.position_ms,
       duration_ms = excluded.duration_ms,
       updated_at = excluded.updated_at`,
    session.userId,
    value.url,
    session.deviceId,
    value.positionMs,
    value.durationMs,
    now,
  );

  return json({
    ok: true,
    item: {
      url: value.url,
      positionMs: value.positionMs,
      durationMs: value.durationMs,
      updatedAt: now,
    },
  });
}
