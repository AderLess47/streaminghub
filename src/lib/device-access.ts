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

/** Warum ein Gerät abgemeldet wurde – steht so in der Datenbank. */
export type RevokeReason =
  | "trial_ended"
  | "subscription_ended"
  | "legacy_cleanup"
  | "admin"
  | "customer";

/** Meldet Geräte über dem Limit ab und gibt die Zahl der Abmeldungen zurück. */
export function revokeDevicesOverLimit(
  userId: string,
  at: string,
  limit: number = freeDeviceLimit(),
  reason: RevokeReason = "legacy_cleanup",
): number {
  const surplus = devicesOverLimit(userId, limit);
  for (const device of surplus) {
    run(
      `UPDATE devices SET status = 'revoked', revoked_at = ?, revoked_reason = ?
        WHERE id = ? AND user_id = ? AND status = 'active'`,
      at,
      reason,
      device.id,
      userId,
    );
  }
  return surplus.length;
}

/**
 * Geräte, die beim Trial- oder Abo-Ende abgemeldet wurden. Das Konto zeigt sie
 * als Hinweis, damit ein verschwundenes Gerät nicht wie ein Fehler wirkt.
 * Manuelle Abmeldungen und der einmalige Altbestands-Lauf zählen nicht.
 */
export function devicesRevokedByEnding(
  userId: string,
  sinceDays = 30,
): { name: string; revokedAt: string }[] {
  const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
  return all<{ name: string; revokedAt: string }>(
    `SELECT name, revoked_at AS revokedAt FROM devices
      WHERE user_id = ? AND status = 'revoked'
        AND revoked_reason IN ('trial_ended', 'subscription_ended')
        AND revoked_at IS NOT NULL AND revoked_at >= ?
      ORDER BY revoked_at DESC
      LIMIT 10`,
    userId,
    since,
  );
}
