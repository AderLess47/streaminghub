import Link from "next/link";

/**
 * Blätterung für Admin-Listen. Nutzt dieselben Button-Klassen wie der Rest der
 * Oberfläche und behält alle Filter in der Adresse.
 */
export function Pager({
  basePath,
  params,
  page,
  pages,
  total,
  previousLabel,
  nextLabel,
  pageLabel,
}: {
  basePath: string;
  /** Aktive Filter, die in den Links erhalten bleiben (ohne `page`). */
  params: Record<string, string | undefined>;
  page: number;
  pages: number;
  total: number;
  previousLabel: string;
  nextLabel: string;
  /** Enthält die Platzhalter {page} und {pages}. */
  pageLabel: string;
}) {
  if (pages <= 1) return null;

  const href = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    if (target > 1) search.set("page", String(target));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  const label = pageLabel.replace("{page}", String(page)).replace("{pages}", String(pages));

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-line/40 pt-3"
    >
      <p className="text-[0.7rem] text-muted">
        {label} · {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="btn btn-ghost btn-sm" rel="prev">
            {previousLabel}
          </Link>
        ) : (
          <span className="btn btn-ghost btn-sm pointer-events-none opacity-40" aria-disabled={page <= 1 || undefined}>
            {previousLabel}
          </span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} className="btn btn-ghost btn-sm" rel="next">
            {nextLabel}
          </Link>
        ) : (
          <span className="btn btn-ghost btn-sm pointer-events-none opacity-40" aria-disabled={page >= pages || undefined}>
            {nextLabel}
          </span>
        )}
      </div>
    </nav>
  );
}
