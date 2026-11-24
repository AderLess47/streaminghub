/** Platzhalter während der Dashboard-Abfragen; gleiche Raster wie die Seite. */
export default function DashboardLoading() {
  return (
    <div className="grid gap-6" role="status" aria-live="polite">
      <span className="sr-only">Wird geladen …</span>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="h-8 w-56 max-w-full animate-pulse rounded-lg bg-white/8" />
          <div className="mt-2 h-3 w-40 animate-pulse rounded bg-white/6" />
        </div>
        <div className="h-9 w-32 animate-pulse rounded-lg bg-white/8" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <div key={index} className="card h-24 animate-pulse" />
        ))}
      </div>
      <div className="card h-56 animate-pulse" />
    </div>
  );
}
