import { get, run, nowIso } from "./db";
import { pruneRateLimits } from "./rate-limit";

/**
 * Regelmäßige Datenbankpflege. Läuft im Container neben Backup und
 * Aufbewahrungsfristen (docker-entrypoint.sh) und hält die Tabellen klein,
 * damit einzelne Abfragen nicht mit der Zeit langsamer werden.
 */

const DAY_MS = 86_400_000;

export function pruneExpiredSessions(now = Date.now()): number {
  const result = run(`DELETE FROM sessions WHERE expires_at < ?`, new Date(now).toISOString());
  return Number(result.changes ?? 0);
}

export function pruneExpiredAuthTokens(now = Date.now()): number {
  // Abgelaufene und bereits verwendete Einmal-Token werden nicht mehr benötigt;
  // die Aufbewahrung dient nur der kurzen Nachvollziehbarkeit.
  const cutoff = new Date(now - 7 * DAY_MS).toISOString();
  const result = run(
    `DELETE FROM auth_tokens WHERE expires_at < ? OR (used_at IS NOT NULL AND used_at < ?)`,
    new Date(now).toISOString(),
    cutoff,
  );
  return Number(result.changes ?? 0);
}

export function pruneExpiredPairingRequests(now = Date.now()): number {
  const cutoff = new Date(now - 7 * DAY_MS).toISOString();
  const result = run(
    `DELETE FROM pairing_requests WHERE expires_at < ? OR (claimed_at IS NOT NULL AND claimed_at < ?)`,
    cutoff,
    cutoff,
  );
  return Number(result.changes ?? 0);
}

export function runMaintenance() {
  const deleted = {
    sessions: pruneExpiredSessions(),
    authTokens: pruneExpiredAuthTokens(),
    pairingRequests: pruneExpiredPairingRequests(),
  };
  pruneRateLimits();
  return deleted;
}

/* ----------------------------- Wartungsmodus ----------------------------- */

const MAINTENANCE_KEY = "maintenance_mode";

/**
 * Schaltet die öffentliche Website auf die Wartungsseite. Dashboard, Admin,
 * Statusseite und API bleiben erreichbar, damit Support und Betrieb arbeiten
 * können. Standard ist aus.
 */
export function isMaintenanceModeEnabled(): boolean {
  try {
    return get<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, MAINTENANCE_KEY)?.value === "1";
  } catch {
    // Datenbankfehler dürfen die Website nicht in den Wartungsmodus zwingen.
    return false;
  }
}

export function setMaintenanceMode(enabled: boolean) {
  run(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    MAINTENANCE_KEY,
    enabled ? "1" : "0",
    nowIso(),
  );
}
