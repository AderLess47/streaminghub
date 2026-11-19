/**
 * Feature-Flags aus der `settings`-Tabelle.
 *
 * Monetarisierungs-Funktionen starten aus: Ein Deploy allein ändert kein
 * Verhalten. Eingeschaltet wird über den Admin bzw. per SQL
 * (`UPDATE settings SET value = '1' WHERE key = 'trial_enabled'`), ohne dass
 * eine neue Version nötig ist. Ein fehlender Schlüssel bedeutet „aus“.
 */
import { getSetting } from "./content";

export const FEATURE_FLAGS = {
  trial: "trial_enabled",
  cloudBackup: "cloud_backup_enabled",
  annualBilling: "annual_enabled",
} as const;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/** Nur ausdrückliche Wahrheitswerte zählen; „yes“ oder „on“ sind keine Freigabe. */
export function isEnabledValue(value: string | null | undefined): boolean {
  const normalized = (value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return isEnabledValue(getSetting(FEATURE_FLAGS[flag], "0"));
}
