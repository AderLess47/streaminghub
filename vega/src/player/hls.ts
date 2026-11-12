/**
 * HLS/DASH auf Vega OS.
 *
 * Der W3C-Player der Plattform spielt in **URL mode** nur progressive Dateien
 * (MP4, MKV …). Ein `.m3u8`- oder `.mpd`-Manifest braucht **MSE mode** plus
 * einen JavaScript-Player; Amazon liefert dafür gepatchte Shaka-Player-Pakete,
 * die als Quellordner ins Projekt kopiert werden (siehe `README.md`).
 *
 * Diese Nahtstelle hält den Rest der App frei von dieser Abhängigkeit:
 * `registerHlsAdapter()` wird von der Glue-Datei aufgerufen, sobald das
 * Shaka-Paket im Projekt liegt. Fehlt es, sagt die App das offen, statt eine
 * Wiedergabe zu versprechen, die nicht startet.
 */

export type HlsAdapter = {
  /** Verbindet den Player mit der Video-Oberfläche und lädt die Quelle. */
  load(url: string): Promise<void>;
  destroy(): void;
};

export type HlsAdapterFactory = (videoPlayer: unknown) => HlsAdapter | null;

let factory: HlsAdapterFactory | null = null;

export function registerHlsAdapter(next: HlsAdapterFactory): void {
  factory = next;
}

export function hasHlsAdapter(): boolean {
  return factory !== null;
}

export function createHlsAdapter(videoPlayer: unknown): HlsAdapter | null {
  return factory ? factory(videoPlayer) : null;
}

/** Adaptive Quellen erkennen: HLS-Manifest, DASH-Manifest. */
export function isAdaptiveSource(url: string): boolean {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  return path.endsWith(".m3u8") || path.endsWith(".mpd");
}
