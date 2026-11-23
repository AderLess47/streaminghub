/**
 * Platzhalter, während die Admin-Liste ihre Datenbankabfragen ausführt.
 * Verwendet dieselben Karten- und Rasterklassen wie die fertigen Seiten, damit
 * beim Wechsel kein Layoutsprung entsteht.
 */
export default function AdminLoading() {
  return (
    <div className="grid gap-5" role="status" aria-live="polite">
      <span className="sr-only">Wird geladen …</span>
      <div className="border-b border-line/40 pb-8">
        <div className="h-3 w-24 animate-pulse rounded bg-white/8" />
        <div className="mt-3 h-8 w-64 max-w-full animate-pulse rounded-lg bg-white/8" />
        <div className="mt-3 h-3 w-80 max-w-full animate-pulse rounded bg-white/6" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="card h-20 animate-pulse" />
        ))}
      </div>
      <div className="card h-64 animate-pulse" />
    </div>
  );
}
