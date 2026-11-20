/**
 * Kostenloser Testzeitraum (14 Tage, ohne Zahlungsdaten).
 *
 * Der Trial ist eine eigene Information am Abo und ändert den Status nicht:
 * `effectiveStatus()` und damit Webhooks, Store-Pfade und Admin-Ansichten
 * bleiben unverändert. Nur `getEntitlements()` liest `trial_ends_at` und
 * gewährt für die Laufzeit dieselben Rechte wie ein Abo. Nach dem Ende wird
 * nichts widerrufen – Geräte und Playlist bleiben, nur die Premium-Rechte
 * fallen auf den kostenlosen Tarif zurück.
 *
 * Nur serverseitig verwenden.
 */
import { getSetting } from "./content";
import { addDays, get, run } from "./db";
import { isFeatureEnabled } from "./flags";
import { sendMail, trialStartedMail } from "./mail";
import { PREMIUM_PRICE_EUR } from "./pricing";
import {
  effectiveStatus,
  ensureSubscription,
  getSubscription,
  type Subscription,
} from "./payments";

export const DEFAULT_TRIAL_DAYS = 14;
const MIN_TRIAL_DAYS = 1;
/** Obergrenze gegen Fehlkonfiguration: Ein Jahr Testzeitraum wäre kein Test. */
const MAX_TRIAL_DAYS = 60;

/** Ereignisse, die eine Zahlung belegen – unabhängig vom aktuellen Status. */
const PAYMENT_EVENT_TYPES = [
  "checkout.session.completed",
  "customer.subscription.created",
  "invoice.paid",
];

const PAYMENT_EVENT_SQL = `SELECT 1 AS paid FROM subscription_events
   WHERE user_id = ? AND event_type IN (${PAYMENT_EVENT_TYPES.map(() => "?").join(", ")})
   LIMIT 1`;

export type TrialRejection =
  | "disabled"
  | "email_unverified"
  | "already_active"
  | "checkout_pending"
  | "already_used"
  | "payment_history";

export type TrialStartOutcome =
  | { ok: true; trialEndsAt: string; trialDays: number }
  | { ok: false; code: TrialRejection; message: string };

export type TrialStartInput = {
  userId: string;
  /** Wo der Trial gestartet wurde – für Admin-Anzeige und Reporting. */
  source?: "web" | "app" | "admin";
  /** Für Tests und reproduzierbare Auswertungen. */
  now?: number;
};

/** Konfigurierbar über `settings.trial_days`, mit sicherem Fallback. */
export function trialDays(): number {
  const configured = Number(getSetting("trial_days", String(DEFAULT_TRIAL_DAYS)));
  if (!Number.isFinite(configured)) return DEFAULT_TRIAL_DAYS;
  return Math.min(MAX_TRIAL_DAYS, Math.max(MIN_TRIAL_DAYS, Math.floor(configured)));
}

/**
 * Startet den Testzeitraum für ein Konto.
 *
 * Missbrauchsschutz: nur bestätigte E-Mail-Adressen, nur einmal pro Konto
 * (`trial_used_at`), nicht bei laufendem oder früherem Abo und nicht bei
 * vorhandener Zahlungshistorie. Jede Ablehnung nennt einen Grund, damit die
 * Oberfläche erklären kann, warum kein Trial möglich ist.
 */
export async function startTrial(input: TrialStartInput): Promise<TrialStartOutcome> {
  if (!isFeatureEnabled("trial")) {
    return reject(
      "disabled",
      "Der kostenlose Testzeitraum ist derzeit nicht verfügbar.",
    );
  }

  const user = get<{
    email: string;
    display_name: string;
    locale: string;
    email_verified: number;
  }>(`SELECT email, display_name, locale, email_verified FROM users WHERE id = ?`, input.userId);
  if (!user || !user.email_verified) {
    return reject(
      "email_unverified",
      "Bitte bestätige zuerst deine E-Mail-Adresse. Danach kannst du den Testzeitraum starten.",
    );
  }

  const now = input.now ?? Date.now();
  const subscription = getSubscription(input.userId);

  // Zweiter Klick auf „Test starten“ ist kein Fehler und verschickt keine
  // zweite Mail; der laufende Zeitraum bleibt unverändert.
  const runningEnd = trialEnd(subscription);
  if (runningEnd && Date.parse(runningEnd) > now) {
    return {
      ok: true,
      trialEndsAt: runningEnd,
      trialDays: storedTrialDays(subscription, runningEnd),
    };
  }

  // Ein laufendes Abo (auch mit offener Zahlung) braucht keinen Trial; ein
  // begonnener Checkout soll nicht parallel einen Trial erzeugen.
  const status = effectiveStatus(subscription);
  if (status === "active" || status === "past_due") {
    return reject(
      "already_active",
      "Für dieses Konto ist bereits ein Abonnement hinterlegt. Der Testzeitraum ist dafür nicht nötig.",
    );
  }
  if (status === "pending" || status === "incomplete") {
    return reject(
      "checkout_pending",
      "Für dieses Konto läuft bereits ein Abschluss. Bitte schließe ihn ab oder warte, bis er beendet ist.",
    );
  }

  if (subscription?.trial_used_at) {
    return reject(
      "already_used",
      "Der kostenlose Testzeitraum wurde für dieses Konto bereits genutzt.",
    );
  }

  // Auch ein beendetes Abo oder eine Erstattung ist Zahlungshistorie: Wer schon
  // gezahlt hat, bekommt keinen zweiten kostenlosen Zeitraum.
  if (hasPaymentHistory(input.userId, subscription)) {
    return reject(
      "payment_history",
      "Für dieses Konto besteht bereits eine Zahlungshistorie. Der Testzeitraum ist für neue Konten gedacht.",
    );
  }

  ensureSubscription(input.userId);
  const days = trialDays();
  const startedAt = new Date(now).toISOString();
  const endsAt = addDays(days, now);

  run(
    `UPDATE subscriptions
     SET trial_started_at = ?, trial_ends_at = ?, trial_used_at = ?, trial_source = ?, updated_at = ?
     WHERE user_id = ?`,
    startedAt,
    endsAt,
    startedAt,
    input.source ?? "web",
    startedAt,
    input.userId,
  );

  await sendMail({
    to: user.email,
    ...trialStartedMail({
      name: user.display_name,
      locale: user.locale,
      trialEndsAt: endsAt,
      priceEur: PREMIUM_PRICE_EUR,
    }),
    kind: "subscription",
  });

  return { ok: true, trialEndsAt: endsAt, trialDays: days };
}

function reject(code: TrialRejection, message: string): TrialStartOutcome {
  return { ok: false, code, message };
}

function hasPaymentHistory(userId: string, subscription: Subscription | null): boolean {
  if (subscription?.provider_subscription_id) return true;
  return Boolean(
    get<{ paid: number }>(PAYMENT_EVENT_SQL, userId, ...PAYMENT_EVENT_TYPES),
  );
}

function trialEnd(subscription: Subscription | null): string | null {
  const value = subscription?.trial_ends_at;
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Tatsächliche Länge des laufenden Zeitraums, auch wenn `trial_days` sich änderte. */
function storedTrialDays(subscription: Subscription | null, endsAt: string): number {
  const start = subscription?.trial_started_at ? Date.parse(subscription.trial_started_at) : NaN;
  const end = Date.parse(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return trialDays();
  return Math.max(1, Math.round((end - start) / 86_400_000));
}
