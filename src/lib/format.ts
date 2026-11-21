/**
 * Formatiert einen Euro-Betrag in der Schreibweise der aktiven Sprache.
 * Reine Intl-Nutzung, damit `de` „3,49 €“ und `en` „€3.49“ liefert, ohne dass
 * Preise als Strings in den Wörterbüchern gepflegt werden müssen.
 */
export function formatEur(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);
  } catch {
    return `${value.toFixed(2).replace(".", ",")} €`;
  }
}
