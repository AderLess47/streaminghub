/** Datenmodell der Vega-App. Begriffe wie im Android-Client, damit beide Apps
 * dieselben API-Antworten und dieselben Playlist-Dateien verstehen. */

export type MediaKind = "live" | "movie" | "series";

/**
 * DRM-Angaben aus der Playlist (`#KODIPROP`), wie sie IPTV-Anbieter liefern.
 *
 * Nur Widevine und PlayReady sind auf Vega überhaupt spielbar; alles andere
 * wird beim Einlesen verworfen, statt später beim Abspielen zu scheitern.
 */
export type ChannelDrm = {
  scheme: "com.widevine.alpha" | "com.microsoft.playready";
  licenseUrl: string;
  /** Zusätzliche Lizenz-Header (z. B. `Authorization`), falls der Anbieter sie verlangt. */
  headers?: [string, string][];
};

export type Channel = {
  name: string;
  url: string;
  logo?: string;
  group: string;
  tvgId?: string;
  kind: MediaKind;
  /** Gesetzt, wenn die Playlist für diesen Sender DRM-Angaben enthält. */
  drm?: ChannelDrm;
};

export type EpgProgramme = {
  channelId: string;
  channelName: string;
  startMs: number;
  stopMs: number;
  title: string;
  description?: string;
};

export type Reminder = {
  id: string;
  channelId: string;
  channelName: string;
  title: string;
  startMs: number;
};

export type WatchProgressItem = {
  url: string;
  positionMs: number;
  durationMs: number;
  updatedAt?: string;
};

export type ManagedPlaylist = {
  url: string;
  updatedAt?: string;
};

export type AccountInfo = {
  email: string;
  displayName: string;
  deviceName: string;
  platform: string;
  plan: string;
  subscriptionStatus: string;
  channel: string;
  currentPeriodEnd?: string;
  premiumActive: boolean;
  playlist?: ManagedPlaylist;
};

export type PairingCode = {
  requestId: string;
  code: string;
  pollToken: string;
  pollIntervalSeconds: number;
};

export type PairingPoll = {
  status: "pending" | "claimed" | "expired";
  activationToken?: string;
};

export type Settings = {
  /** Weniger Einträge pro Liste, keine Logo-Vorladung, kleinere Puffer. */
  lowSpec: boolean;
  demoMode: boolean;
  /** Secure Buffers (Widevine L1) für DRM-Sender; standardmäßig aus. */
  securePlayback: boolean;
};

export const DEFAULT_SETTINGS: Settings = { lowSpec: false, demoMode: false, securePlayback: false };

export type StoredPlaylist = {
  channels: Channel[];
  sourceUrl: string | null;
  sourceLabel: string;
  updatedAt: number | null;
};

export type StoredEpg = {
  programmes: EpgProgramme[];
  sourceUrl: string | null;
  updatedAt: number | null;
};

export const EMPTY_PLAYLIST: StoredPlaylist = {
  channels: [],
  sourceUrl: null,
  sourceLabel: "",
  updatedAt: null,
};

export const EMPTY_EPG: StoredEpg = { programmes: [], sourceUrl: null, updatedAt: null };
