/**
 * Preisbuch des Abo-Modells.
 *
 * Eine Quelle für Checkout, Mails, Website und Admin-Reporting. Alle Beträge
 * sind Endpreise: Der Betreiber fällt unter die Kleinunternehmerregelung
 * (§ 19 UStG), es wird keine Umsatzsteuer ausgewiesen.
 *
 * `PREMIUM_PRICE_EUR` und `PREMIUM_PLAN_ID` sind die Namen aus der
 * Ein-Tarif-Zeit. Sie bleiben unverändert, damit bestehende Abos, Mails und
 * Texte denselben Preis nennen; neue Stellen lesen `PRICE_BOOK`.
 *
 * Reine Konstanten und Funktionen – bewusst ohne Datenbank, Env oder Netz,
 * damit Tests und Client-Texte sie ohne Serverkontext laden können.
 */

export type PlanTier = "standard" | "pro";
export type BillingInterval = "month" | "year";

/** Die aktuell verkauften Pläne. Weitere Tarife kommen als zusätzliche IDs dazu. */
export type PlanId = "standard_monthly" | "standard_annual";

export type PriceEntry = {
  plan: PlanId;
  tier: PlanTier;
  interval: BillingInterval;
  eur: number;
};

export const PRICE_BOOK = {
  standard_monthly: {
    plan: "standard_monthly",
    tier: "standard",
    interval: "month",
    eur: 3.49,
  },
  standard_annual: {
    plan: "standard_annual",
    tier: "standard",
    interval: "year",
    eur: 34.99,
  },
} as const satisfies Record<PlanId, PriceEntry>;

/** Alt-Namen: unverändert, damit bestehende Importe und Preistexte weiter stimmen. */
export const PREMIUM_PRICE_EUR = PRICE_BOOK.standard_monthly.eur;
/**
 * Preis der Abos, die vor der Preisanpassung abgeschlossen wurden.
 *
 * Ein Stripe-Abo haengt an dem Preis, mit dem es erstellt wurde; der neue
 * Listenpreis aendert bestehende Abos nicht. Diese Konstante ist nur fuer die
 * Anzeige, solange in der Datenbank kein Betrag hinterlegt ist.
 */
export const LEGACY_PREMIUM_PRICE_EUR = 2.49;
export const ANNUAL_PRICE_EUR = PRICE_BOOK.standard_annual.eur;
export const PREMIUM_PLAN_ID = "premium_monthly";

/** Plan, der ohne ausdrückliche Wahl abgeschlossen wird. */
export const DEFAULT_PLAN: PlanId = "standard_monthly";

/** Beträge werden in Cent gerechnet, damit 3,49 € exakt 349 ergibt. */
export function cents(eur: number): number {
  return Math.round(eur * 100);
}

export function priceForPlan(plan: PlanId): PriceEntry {
  return PRICE_BOOK[plan];
}

/**
 * Ordnet eine konfigurierte Stripe-Price-ID einem Plan zu. Unbekannte IDs
 * liefern `null`, damit der Webhook niemals stillschweigend umbucht.
 */
export function planForPriceId(
  priceId: string | null | undefined,
  prices: { monthly?: string | null; annual?: string | null },
): PlanId | null {
  const value = (priceId ?? "").trim();
  if (!value) return null;
  if (prices.annual && value === prices.annual) return "standard_annual";
  if (prices.monthly && value === prices.monthly) return "standard_monthly";
  return null;
}

/** Ersparnis der Jahreszahlung gegenüber zwölf Monatszahlungen, in Cent. */
export function annualSavingCents(): number {
  return cents(PREMIUM_PRICE_EUR) * 12 - cents(PRICE_BOOK.standard_annual.eur);
}

/** Dieselbe Ersparnis in ganzen Prozenten, für Preistexte. */
export function annualSavingPercent(): number {
  const monthlyYear = cents(PREMIUM_PRICE_EUR) * 12;
  if (monthlyYear <= 0) return 0;
  return Math.round((annualSavingCents() / monthlyYear) * 100);
}

/**
 * Tarifstufe aus dem `plan`-Wert der Datenbank. Der Alt-Wert `premium` stammt
 * aus der Ein-Tarif-Zeit und entspricht Standard; `free`/`none`/leer bedeutet
 * kein Tarif.
 */
export function planTierOf(plan: string | null | undefined): PlanTier | "free" {
  const value = (plan ?? "").trim().toLowerCase();
  if (!value || value === "free" || value === "none") return "free";
  if (value.startsWith("pro")) return "pro";
  return "standard";
}

/**
 * Abrechnungsintervall aus der Spalte `billing_interval`, ersatzweise aus dem
 * Plan-Namen. `null` bedeutet: unbekannt (Altbestand ohne Intervall-Angabe).
 */
export function billingIntervalOf(
  plan: string | null | undefined,
  billingInterval: string | null | undefined,
): BillingInterval | null {
  const stored = (billingInterval ?? "").trim().toLowerCase();
  if (stored === "month" || stored === "year") return stored;
  const value = (plan ?? "").trim().toLowerCase();
  if (value.endsWith("_annual") || value.endsWith("_year") || value.endsWith("_yearly")) {
    return "year";
  }
  if (value.endsWith("_monthly") || value.endsWith("_month")) return "month";
  return null;
}
