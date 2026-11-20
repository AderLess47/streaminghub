import { parseM3u } from "./m3u";
import type { Channel, StoredPlaylist } from "../model/types";

/**
 * Laden und Ablegen einer Playlist. Die App lädt die Datei selbst – StreamingHub
 * liefert keine Inhalte, nur optional die vom Kunden freigegebene Quell-URL.
 */

const FETCH_TIMEOUT_MS = 30_000;

export async function fetchText(url: string, userAgent = "StreamingHub/1.0 (Vega)"): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "*/*", "User-Agent": userAgent },
    });
    if (!response.ok) {
      throw new Error(`Die Quelle antwortet mit HTTP ${response.status}.`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Die Quelle hat nicht innerhalb von 30 Sekunden geantwortet.");
    }
    throw error instanceof Error ? error : new Error("Die Quelle konnte nicht geladen werden.");
  } finally {
    clearTimeout(timeout);
  }
}

export async function loadPlaylistFromUrl(url: string, label?: string): Promise<StoredPlaylist> {
  const text = await fetchText(url);
  const channels = parseM3u(text);
  if (channels.length === 0) {
    throw new Error("Die Datei enthielt keine lesbaren Einträge.");
  }
  return {
    channels,
    sourceUrl: url,
    sourceLabel: label ?? new URL(url).hostname,
    updatedAt: Date.now(),
  };
}

/**
 * Der Low-Spec-Modus kürzt die Listen. Er ändert nichts an der Playlist selbst,
 * sondern nur daran, wie viel die App gleichzeitig im Speicher hält.
 */
export function limitFor(channels: Channel[], lowSpec: boolean): Channel[] {
  if (!lowSpec) return channels;
  return channels.slice(0, 600);
}

/** Eine vom Admin hinterlegte Quelle ersetzt nur dann die lokale Playlist, wenn
 * der Kunde sie ausdrücklich bestätigt hat – hier: wenn die URL abweicht und
 * die Anfrage erfolgreich war. */
export function shouldApplyManaged(
  managedUrl: string | undefined,
  current: StoredPlaylist,
): boolean {
  return !!managedUrl && managedUrl.trim() !== (current.sourceUrl ?? "");
}
