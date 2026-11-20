/**
 * Geräte jenseits des kostenlosen Limits abmelden.
 *
 * Dieselbe Regel gilt an zwei Stellen: wenn ein Testzeitraum endet und wenn ein
 * Abo endet. Aktiv bleiben die zuletzt genutzten Geräte; die Mails nennen die
 * Zahl der abgemeldeten. Nur serverseitig verwenden.
 */
import { all, run } from "./db";
import { deviceLimits } from "./entitlements";

/** Limit des kostenlosen Tarifs aus den Einstellungen. */
export function freeDeviceLimit(): number {
  return deviceLimits().free;
}

/**
 * Aktive Geräte jenseits des Limits – die am längsten ungenutzten zuerst.
 * Sortiert wird nach letzter Nutzung, damit das Gerät, mit dem jemand gerade
 * schaut, nicht abgemeldet wird.
 */
export function devicesOverLimit(userId: string, limit: number): { id: string }[] {
  return all<{ id: string }>(
    `SELECT id FROM devices
      WHERE user_id = ? AND status = 'active'
      ORDER BY COALESCE(last_seen_at, activated_at, created_at) DESC, created_at DESC
      LIMIT -1 OFFSET ?`,
    userId,
    limit,
  );
}

/** Meldet Geräte über dem Limit ab und gibt die Zahl der Abmeldungen zurück. */
export function revokeDevicesOverLimit(
  userId: string,
  at: string,
  limit: number = freeDeviceLimit(),
): number {
  const surplus = devicesOverLimit(userId, limit);
  for (const device of surplus) {
    run(
      `UPDATE devices SET status = 'revoked', revoked_at = ?
        WHERE id = ? AND user_id = ? AND status = 'active'`,
      at,
      device.id,
      userId,
    );
  }
  return surplus.length;
}
