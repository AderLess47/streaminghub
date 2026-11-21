/**
 * Zustandslogik der beiden Checkout-Pflichtzustimmungen.
 *
 * Bewusst ohne React: Die Reihenfolge (erst AGB, dann Widerrufsverzicht) und
 * die Regel, dass die Meldung immer den *aktuell* fehlenden Schritt nennt,
 * sind damit testbar. Eine einmal gezeigte Meldung darf nach dem Setzen des
 * ersten Häkchens nicht veralten.
 */

export type CheckoutConsentState = {
  terms: boolean;
  withdrawal: boolean;
};

export type MissingConsent = "terms" | "withdrawal" | null;

export type ConsentFeedback = {
  field: Exclude<MissingConsent, null>;
  message: string;
} | null;

export function missingConsent(state: CheckoutConsentState): MissingConsent {
  if (!state.terms) return "terms";
  if (!state.withdrawal) return "withdrawal";
  return null;
}

export function consentFeedback(
  state: CheckoutConsentState,
  attempted: boolean,
  messages: { termsRequired: string; withdrawalRequired: string },
): ConsentFeedback {
  if (!attempted) return null;
  const field = missingConsent(state);
  if (!field) return null;
  return {
    field,
    message: field === "terms" ? messages.termsRequired : messages.withdrawalRequired,
  };
}
