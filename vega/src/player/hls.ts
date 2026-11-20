/**
 * HLS/DASH auf Vega OS.
 *
 * Der W3C-Player der Plattform spielt in **URL mode** nur progressive Dateien
 * (MP4, MKV …). Ein `.m3u8`- oder `.mpd`-Manifest braucht **MSE mode** plus
 * einen JavaScript-Player; Amazon liefert dafür einen gepatchten Shaka-Player,
 * den die App selbst nicht mitliefern darf (Amazon kennzeichnet ihn als
 * „proprietary/confidential“). `scripts/setup-shaka.mjs` holt ihn aus Amazons
 * Download und trägt ihn in `shaka-registration.ts` ein.
 *
 * Diese Nahtstelle hält den Rest der App frei von dieser Abhängigkeit. Fehlt
 * der Player, sagt die App das offen, statt eine Wiedergabe zu versprechen,
 * die nicht startet.
 */

import type { ChannelDrm } from "../model/types";

export type HlsCallbacks = {
  /** Kurzer Zustandstext für die Oberfläche („Lade Manifest …“). */
  onStatus: (text: string) => void;
  /** Fehlermeldung; die Oberfläche zeigt sie statt eines schwarzen Bildes. */
  onError: (message: string) => void;
  /** Pause/Weiter, damit der Knopf den richtigen Text zeigt. */
  onPausedChange: (paused: boolean) => void;
  /** Fortschritt höchstens alle zehn Sekunden. */
  onProgress: (positionMs: number, durationMs: number) => void;
};

export type HlsAdapter = {
  /** Oberfläche ist bereit: Player erzeugen, Handle setzen, Manifest laden. */
  start(
    surfaceHandle: string,
    url: string,
    startPositionMs: number,
    drm?: ChannelDrm,
    options?: { secureBuffers?: boolean },
  ): Promise<void>;
  togglePlayback(): void;
  seekBy(seconds: number): void;
  /** Gibt Decoder, Surface und globale Handles frei. Mehrfachaufruf ist harmlos. */
  destroy(): Promise<void>;
};

export type HlsAdapterFactory = (callbacks: HlsCallbacks) => HlsAdapter;

let factory: HlsAdapterFactory | null = null;

export function registerHlsAdapter(next: HlsAdapterFactory): void {
  factory = next;
}

export function hasHlsAdapter(): boolean {
  return factory !== null;
}

export function createHlsAdapter(callbacks: HlsCallbacks): HlsAdapter | null {
  return factory ? factory(callbacks) : null;
}

/** Adaptive Quellen erkennen: HLS-Manifest, DASH-Manifest. */
export function isAdaptiveSource(url: string): boolean {
  const path = url.split("?")[0]?.toLowerCase() ?? "";
  return path.endsWith(".m3u8") || path.endsWith(".mpd");
}
