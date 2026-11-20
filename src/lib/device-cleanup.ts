/**
 * Einmalige Bereinigung des Altbestands.
 *
 * Seit dem Abo-Ende meldet StreamingHub überzählige Geräte automatisch ab – aber
 * nicht rückwirkend. Konten, deren Abo schon vorher ausgelaufen ist, behalten
 * ihre Geräte. Dieser Lauf räumt genau diese Konten auf: ohne Premium-Zugang
 * (ausgelaufenes Abo, fehlgeschlagene Zahlung, nie abgeschlossen) und mit mehr
 * aktiven Geräten als der kostenlose Tarif erlaubt.
 *
 * Bewusst ohne Mail: Die Abschlussmails sind längst raus, eine zweite Nachricht
 * Wochen später wäre keine Erklärung, sondern eine Überraschung. Der Lauf ist
 * wiederholbar und ändert nur, was noch über dem Limit liegt. Nur serverseitig
 * verwenden.
 */
import { all, nowIso } from "./db";
import { devicesOverLimit, freeDeviceLimit, revokeDevicesOverLimit } from "./device-access";

/**
 * Konten ohne Premium-Zugang jenseits des Limits. `NOT COALESCE(…, 0)` ist
 * nötig: Ohne Abo-Datensatz ergibt die Bedingung in SQL NULL, und `NOT NULL`
 * würde die Zeile verwerfen.
 */
const OVER_LIMIT_SQL = `
  SELECT u.id AS userId, u.email AS email,
         (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.status = 'active') AS devices
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
   WHERE u.disabled_at IS NULL
     AND (SELECT COUNT(*) FROM devices d WHERE d.user_id = u.id AND d.status = 'active') > ?
     AND NOT COALESCE(
       (s.status = 'active' AND (s.current_period_end IS NULL OR s.current_period_end > ?))
       OR (s.trial_ends_at IS NOT NULL AND s.trial_ends_at > ?),
       0
     )
   ORDER BY u.email`;

export type OverLimitAccount = { userId: string; email: string; devices: number };

export type CleanupResult = {
  dryRun: boolean;
  limit: number;
  /** Konten, die über dem Limit lagen. */
  accounts: number;
  /** Geräte, die abgemeldet wurden (oder im Probelauf würden). */
  devices: number;
};

export function overLimitAccounts(limit: number = freeDeviceLimit()): OverLimitAccount[] {
  const now = nowIso();
  return all<OverLimitAccount>(OVER_LIMIT_SQL, limit, now, now);
}

export function countOverLimitAccounts(limit: number = freeDeviceLimit()): number {
  return overLimitAccounts(limit).length;
}

/**
 * Meldet die überzähligen Geräte dieser Konten ab. `dryRun` zählt nur.
 * Abgemeldet werden die am längsten ungenutzten, die zuletzt genutzten bleiben.
 */
export function cleanupOverLimitDevices(
  input: { dryRun?: boolean; limit?: number } = {},
): CleanupResult {
  const dryRun = input.dryRun === true;
  const limit = input.limit ?? freeDeviceLimit();
  const accounts = overLimitAccounts(limit);
  const at = nowIso();
  let devices = 0;
  for (const account of accounts) {
    devices += dryRun
      ? devicesOverLimit(account.userId, limit).length
      : revokeDevicesOverLimit(account.userId, at, limit);
  }
  return { dryRun, limit, accounts: accounts.length, devices };
}
