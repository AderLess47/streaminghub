import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_SETTINGS,
  EMPTY_EPG,
  EMPTY_PLAYLIST,
  type Channel,
  type EpgProgramme,
  type Reminder,
  type Settings,
  type StoredEpg,
  type StoredPlaylist,
} from "../model/types";

/**
 * Persistenz auf dem Gerät.
 *
 * AsyncStorage ist auf Vega OS **unverschlüsselt**. Das Aktivierungstoken ist ein
 * Bearer-Credential und liegt deshalb hier schwächer als im Android-Client, der
 * den Android Keystore nutzt – siehe README, Abschnitt "Sicherheit". Playlist-
 * und EPG-Inhalte werden nie an StreamingHub übertragen, sondern nur hier
 * abgelegt.
 */

const KEY = {
  playlist: "streaminghub.playlist",
  epg: "streaminghub.epg",
  favorites: "streaminghub.favorites",
  progress: "streaminghub.progress",
  settings: "streaminghub.settings",
  token: "streaminghub.token",
  deviceName: "streaminghub.deviceName",
  reminders: "streaminghub.reminders",
} as const;

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher voll oder nicht verfügbar: Die App arbeitet weiter, ohne zu
    // behaupten, es sei gespeichert.
  }
}

function sanitizeChannel(value: unknown): Channel | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const name = typeof item["name"] === "string" ? item["name"].trim() : "";
  const url = typeof item["url"] === "string" ? item["url"].trim() : "";
  if (!name || !url) return null;
  const kind = item["kind"];
  return {
    name,
    url,
    logo: typeof item["logo"] === "string" && item["logo"] ? item["logo"] : undefined,
    group: typeof item["group"] === "string" && item["group"] ? item["group"] : "Ohne Kategorie",
    tvgId: typeof item["tvgId"] === "string" && item["tvgId"] ? item["tvgId"] : undefined,
    kind: kind === "movie" || kind === "series" ? kind : "live",
  };
}

/* ------------------------------- Playlist -------------------------------- */

export async function loadPlaylist(): Promise<StoredPlaylist> {
  const stored = await readJson<StoredPlaylist>(KEY.playlist, EMPTY_PLAYLIST);
  const channels = Array.isArray(stored.channels)
    ? stored.channels.map(sanitizeChannel).filter((item): item is Channel => item !== null)
    : [];
  return {
    channels,
    sourceUrl: typeof stored.sourceUrl === "string" ? stored.sourceUrl : null,
    sourceLabel: typeof stored.sourceLabel === "string" ? stored.sourceLabel : "",
    updatedAt: typeof stored.updatedAt === "number" ? stored.updatedAt : null,
  };
}

export async function savePlaylist(playlist: StoredPlaylist): Promise<void> {
  await writeJson(KEY.playlist, playlist);
}

export async function clearPlaylist(): Promise<void> {
  await AsyncStorage.multiRemove([KEY.playlist, KEY.favorites, KEY.progress]);
}

/* ---------------------------------- EPG ---------------------------------- */

export async function loadEpg(): Promise<StoredEpg> {
  const stored = await readJson<StoredEpg>(KEY.epg, EMPTY_EPG);
  const programmes = Array.isArray(stored.programmes)
    ? stored.programmes.filter((item): item is EpgProgramme => {
        if (!item || typeof item !== "object") return false;
        return (
          typeof item.channelId === "string" &&
          typeof item.title === "string" &&
          typeof item.startMs === "number" &&
          typeof item.stopMs === "number" &&
          item.stopMs > item.startMs
        );
      })
    : [];
  return {
    programmes,
    sourceUrl: typeof stored.sourceUrl === "string" ? stored.sourceUrl : null,
    updatedAt: typeof stored.updatedAt === "number" ? stored.updatedAt : null,
  };
}

export async function saveEpg(epg: StoredEpg): Promise<void> {
  await writeJson(KEY.epg, epg);
}

/* ------------------------------- Favoriten -------------------------------- */

export async function loadFavorites(): Promise<string[]> {
  const stored = await readJson<string[]>(KEY.favorites, []);
  return Array.isArray(stored) ? stored.filter((url) => typeof url === "string") : [];
}

export async function saveFavorites(urls: string[]): Promise<void> {
  await writeJson(KEY.favorites, urls);
}

/* ----------------------------- Wiedergabestand ---------------------------- */

export type ProgressMap = Record<string, number>;

export async function loadProgress(): Promise<ProgressMap> {
  const stored = await readJson<ProgressMap>(KEY.progress, {});
  const result: ProgressMap = {};
  for (const [url, position] of Object.entries(stored ?? {})) {
    if (typeof position === "number" && position > 0) result[url] = position;
  }
  return result;
}

/** Live-Streams und unbekannte Laufzeiten bekommen keinen Fortsetzungspunkt. */
export function shouldStoreProgress(positionMs: number, durationMs: number): boolean {
  return durationMs > 0 && positionMs >= 5_000 && positionMs < durationMs - 10_000;
}

export async function saveProgress(url: string, positionMs: number, durationMs: number): Promise<void> {
  const current = await loadProgress();
  if (shouldStoreProgress(positionMs, durationMs)) current[url] = Math.round(positionMs);
  else delete current[url];
  await writeJson(KEY.progress, current);
}

export async function clearProgress(): Promise<void> {
  await AsyncStorage.removeItem(KEY.progress);
}

/* -------------------------------- Einstellungen --------------------------- */

export async function loadSettings(): Promise<Settings> {
  const stored = await readJson<Partial<Settings>>(KEY.settings, {});
  return {
    lowSpec: stored.lowSpec === true,
    demoMode: stored.demoMode === true,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeJson(KEY.settings, { ...DEFAULT_SETTINGS, ...settings });
}

/* --------------------------- Kopplung und Gerät --------------------------- */

export async function loadActivationToken(): Promise<string | null> {
  const value = await AsyncStorage.getItem(KEY.token);
  return value && value.trim() ? value : null;
}

export async function saveActivationToken(token: string): Promise<void> {
  await AsyncStorage.setItem(KEY.token, token);
}

export async function clearActivationToken(): Promise<void> {
  await AsyncStorage.removeItem(KEY.token);
}

export async function loadDeviceName(): Promise<string | null> {
  const value = await AsyncStorage.getItem(KEY.deviceName);
  return value && value.trim() ? value : null;
}

export async function saveDeviceName(name: string): Promise<void> {
  await AsyncStorage.setItem(KEY.deviceName, name.slice(0, 60));
}

/* -------------------------------- Erinnerungen ---------------------------- */

export async function loadReminders(): Promise<Reminder[]> {
  const stored = await readJson<Reminder[]>(KEY.reminders, []);
  return Array.isArray(stored)
    ? stored.filter(
        (item): item is Reminder =>
          !!item && typeof item.id === "string" && typeof item.startMs === "number" && typeof item.title === "string",
      )
    : [];
}

export async function saveReminders(reminders: Reminder[]): Promise<void> {
  await writeJson(KEY.reminders, reminders);
}
