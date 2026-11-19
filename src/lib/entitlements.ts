/**
 * Ansprüche eines Kontos: Tarif, Trial und die daraus folgenden Rechte.
 *
 * Nur serverseitig verwenden – das Modul liest Abo und Einstellungen aus der
 * Datenbank und darf nicht in Client-Komponenten importiert werden.
 *
 * Wichtig für die Abwärtskompatibilität: Der Abo-Status bleibt unverändert
 * (`effectiveStatus()`), Trial ist eine eigene Information. Dadurch verhalten
 * sich bestehende Webhook-, Store- und Admin-Pfade exakt wie vorher, und die
 * Rechteprüfungen wandern nach und nach auf `hasPremiumAccess()`.
 */
import { getSetting } from "./content";
import { effectiveStatus, getSubscription, type Subscription } from "./payments";
import {
  billingIntervalOf,
  planTierOf,
  type BillingInterval,
  type PlanTier,
} from "./pricing";

/** Entspricht den Defaults aus `seed.ts` (free_device_limit / premium_device_limit). */
export const DEFAULT_FREE_DEVICE_LIMIT = 2;
export const DEFAULT_PREMIUM_DEVICE_LIMIT = 5;

export type PlanSource = "none" | "trial" | "stripe" | "amazon" | "apple" | "manual";

/** Die Felder des Abos, die für Rechte zählen – inklusive späterer Trial-Spalten. */
export type SubscriptionEntitlementRow = Pick<
  Subscription,
  "status" | "channel" | "provider" | "current_period_end" | "cancel_at_period_end"
> & {
  plan?: string | null;
  billing_interval?: string | null;
  trial_ends_at?: string | null;
};

export type Entitlements = {
  /** Tarifstufe; `free` heißt: kein laufendes Abo und kein aktiver Trial. */
  plan: PlanTier | "free";
  /** Woher der Zugang kommt – für Admin-Anzeige und Reporting. */
  source: PlanSource;
  /** Ein einziger Schalter für alle Premium-Rechte. */
  premium: boolean;
  trialActive: boolean;
  trialEndsAt: string | null;
  billingInterval: BillingInterval | null;
  deviceLimit: number;
  cloudBackup: boolean;
  progressSync: boolean;
};

export type EntitlementsInput = {
  /** Bereits aufgelöster Status (`effectiveStatus(subscription)`). */
  status: Subscription["status"];
  subscription: SubscriptionEntitlementRow | null;
  freeDeviceLimit: number;
  premiumDeviceLimit: number;
  /** Für Tests und reproduzierbare Auswertungen. */
  now?: number;
};

/**
 * Reine Abbildung von Abo-Zustand auf Rechte. Bewusst ohne Datenbankzugriff,
 * damit die Regeln ohne Serverkontext testbar bleiben.
 */
export function resolveEntitlements(input: EntitlementsInput): Entitlements {
  const now = input.now ?? Date.now();
  const subscription = input.subscription;
  const paid = input.status === "active";

  const trialEndsAt = activeTrialEnd(subscription?.trial_ends_at, now) && !paid
    ? normalizeDate(subscription?.trial_ends_at)
    : null;
  const trialActive = trialEndsAt !== null;
  const premium = paid || trialActive;

  const tier = planTierOf(subscription?.plan);

  return {
    plan: premium ? (tier === "free" ? "standard" : tier) : "free",
    source: paid ? paidSource(subscription) : trialActive ? "trial" : "none",
    premium,
    trialActive,
    trialEndsAt,
    billingInterval: premium
      ? billingIntervalOf(subscription?.plan, subscription?.billing_interval)
      : null,
    deviceLimit: premium
      ? deviceLimit(input.premiumDeviceLimit, DEFAULT_PREMIUM_DEVICE_LIMIT)
      : deviceLimit(input.freeDeviceLimit, DEFAULT_FREE_DEVICE_LIMIT),
    cloudBackup: premium,
    progressSync: premium,
  };
}

/** Liest Abo und Geräte-Limits und löst daraus die Rechte des Kontos auf. */
export function getEntitlements(userId: string): Entitlements {
  const subscription = getSubscription(userId);
  return resolveEntitlements({
    status: effectiveStatus(subscription),
    subscription,
    freeDeviceLimit: Number(
      getSetting("free_device_limit", String(DEFAULT_FREE_DEVICE_LIMIT)),
    ),
    premiumDeviceLimit: Number(
      getSetting("premium_device_limit", String(DEFAULT_PREMIUM_DEVICE_LIMIT)),
    ),
  });
}

/** Kurzform für die Rechteprüfungen in API-Routen und Seiten. */
export function hasPremiumAccess(userId: string): boolean {
  return getEntitlements(userId).premium;
}

function paidSource(subscription: SubscriptionEntitlementRow | null): PlanSource {
  if (!subscription) return "manual";
  if (subscription.channel === "amazon") return "amazon";
  if (subscription.channel === "apple") return "apple";
  if (subscription.provider === "stripe") return "stripe";
  // Ein von Hand freigeschaltetes Abo hat keinen Zahlungsanbieter.
  return "manual";
}

function normalizeDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function activeTrialEnd(value: string | null | undefined, now: number): boolean {
  const iso = normalizeDate(value);
  return iso !== null && Date.parse(iso) > now;
}

/** Ungültige oder negative Einstellungen fallen auf den Default zurück. */
function deviceLimit(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
