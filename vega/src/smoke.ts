/**
 * Einstiegspunkt für den HLS-Smoke-Test.
 *
 * `scripts/verify-shaka.mjs` schreibt hier vor dem Build eine Test-URL hinein,
 * startet die App auf einem Gerät und liest den Verlauf aus den Geräte-Logs.
 * Danach stellt das Skript die Datei wieder auf `null` zurück – im Repository
 * bleibt der Smoke-Modus also aus.
 *
 * Von Hand testen: URL eintragen, `npm run build`, App installieren, starten.
 */
export const SMOKE_HLS_URL: string | null = null;
