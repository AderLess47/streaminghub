import { sha256 } from "@/lib/auth";
import { apiError, json } from "@/lib/api";
import { get } from "@/lib/db";
import { signDeviceToken } from "@/lib/device-auth";

export const runtime = "nodejs";

type PairingRow = {
  id: string;
  poll_token_hash: string;
  device_name: string;
  platform: string;
  expires_at: string;
  claimed_at: string | null;
  device_id: string | null;
  user_id: string | null;
};

/** Polled by the app after displaying a pairing code. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId") ?? "";
  const authorization = request.headers.get("authorization") ?? "";
  const pollToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";

  if (!requestId || !pollToken) {
    return apiError("invalid_request", "requestId und Poll-Token sind erforderlich.");
  }

  const row = get<PairingRow>(
    `SELECT id, poll_token_hash, device_name, platform, expires_at, claimed_at, device_id, user_id
     FROM pairing_requests WHERE id = ?`,
    requestId,
  );
  if (!row || row.poll_token_hash !== sha256(pollToken)) {
    return apiError("not_found", "Kopplungsanfrage nicht gefunden.");
  }

  if (row.claimed_at && row.device_id && row.user_id) {
    const token = signDeviceToken({
      deviceId: row.device_id,
      userId: row.user_id,
      exp: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    });
    return json({
      status: "claimed",
      activatedAt: row.claimed_at,
      device: { id: row.device_id, name: row.device_name, platform: row.platform },
      activationStatus: "active",
      activationToken: token,
    });
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return json({ status: "expired", activationStatus: "inactive" });
  }

  return json({ status: "pending", expiresAt: row.expires_at, activationStatus: "inactive" });
}
