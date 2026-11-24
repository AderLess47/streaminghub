/** Serverseitige Blätterung für die Admin-Listen. */

export const DEFAULT_PAGE_SIZE = 50;

export type Page = {
  page: number;
  pageSize: number;
  offset: number;
  pages: number;
  total: number;
};

/**
 * Liest `?page=` robust: ungültige, negative oder zu große Werte werden auf
 * den gültigen Bereich geklemmt, statt eine leere Liste zu zeigen.
 */
export function parsePage(
  raw: string | undefined,
  total: number,
  pageSize = DEFAULT_PAGE_SIZE,
): Page {
  const parsed = Number(raw);
  const requested = Number.isFinite(parsed) && parsed >= 1 ? Math.floor(parsed) : 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requested, pages);
  return { page, pageSize, offset: (page - 1) * pageSize, pages, total };
}

/**
 * Baut ein LIKE-Muster. Platzhalter aus der Eingabe werden entfernt, damit ein
 * Suchbegriff wie "100%" nicht die ganze Tabelle trifft.
 */
export function likeTerm(query: string) {
  return `%${query.replace(/[%_]/g, "")}%`;
}
