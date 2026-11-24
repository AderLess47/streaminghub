"use client";

/**
 * Letzte Fehlergrenze: greift, wenn bereits das Root-Layout fehlschlägt (z. B.
 * Datenbank beim Start nicht erreichbar). Das Stylesheet ist hier nicht
 * garantiert geladen, deshalb bewusst nur Inline-Stile.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="de">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#080B12",
          color: "#E2E8F0",
          fontFamily:
            "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "2rem",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p
            style={{
              margin: 0,
              fontSize: "0.68rem",
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#94A3B8",
            }}
          >
            StreamingHub
          </p>
          <h1 style={{ margin: "0.75rem 0 0", fontSize: "1.5rem", fontWeight: 600 }}>
            Etwas ist schiefgelaufen
          </h1>
          <p style={{ margin: "0.75rem 0 0", fontSize: "0.9rem", lineHeight: 1.6, color: "#94A3B8" }}>
            Die Seite konnte nicht geladen werden. Bitte versuche es erneut. Wenn das Problem bleibt,
            erreichst du uns über service@streaminghub.org.
          </p>
          {error.digest ? (
            <p style={{ margin: "0.75rem 0 0", fontSize: "0.7rem", color: "#64748B" }}>
              Referenz: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "1.5rem",
              padding: "0.6rem 1.1rem",
              borderRadius: "0.65rem",
              border: "1px solid rgba(99,102,241,0.5)",
              background: "#2563EB",
              color: "#fff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
        </main>
      </body>
    </html>
  );
}
