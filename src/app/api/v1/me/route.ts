import { apiError, json } from "@/lib/api";
import { get } from "@/lib/db";
import { verifyDeviceToken } from "@/lib/device-auth";
import { effectiveStatus, getSubscription } from "@/lib/payments";

export const runtime = "nodejs";

/** Authenticated app endpoint: account, device and subscription status. */
export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return apiError("unauthorized", "Bearer-Token fehlt.");

  const payload = verifyDeviceToken(token);
  if (!payload) return apiError("unauthorized", "Token ungültig oder abgelaufen.");

  const device = get<{ id: string; name: string; platform: string; status: string; activated_at: string | null }>(
    `SELECT id, name, platform, status, activated_at FROM devices WHERE id = ? AND user_id = ?`,
    payload.deviceId,
    payload.userId,
  );
  if (!device || device.status !== "active") {
    return apiError("forbidden", "Dieses Gerät ist nicht mehr aktiviert.");
  }

  const user = get<{ email: string; display_name: string }>(
    `SELECT email, display_name FROM users WHERE id = ?`,
    payload.userId,
  );
  if (!user) return apiError("not_found", "Konto nicht gefunden.");

  const subscription = getSubscription(payload.userId);
  const status = effectiveStatus(subscription);

  return json({
    account: { email: user.email, displayName: user.display_name },
    device: {
      id: device.id,
      name: device.name,
      platform: device.platform,
      activatedAt: device.activated_at,
      activationStatus: "active",
    },
    subscription: {
      plan: "premium",
      status,
      channel: subscription?.channel ?? "web",
      currentPeriodEnd: subscription?.current_period_end ?? null,
      premiumActive: status === "active",
    },
  });
}
