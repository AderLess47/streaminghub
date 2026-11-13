import { VideoPlayer } from "@amazon-devices/react-native-w3cmedia";
import { logError, logEvent, redactUrl } from "../data/diagnostics";
import { drmContentFields } from "./drm";
import { registerHlsAdapter, type HlsAdapter, type HlsCallbacks } from "./hls";
import type { ChannelDrm } from "../model/types";
import type {
  ShakaPlayerConstructor,
  ShakaPlayerInstance,
  ShakaPlayerSettings,
} from "./shaka-player-types";

/**
 * Verbindet Amazons Shaka-Wrapper mit der App.
 *
 * Der Wrapper wird nicht hier importiert, sondern von
 * `shaka-registration.ts` hereingereicht. So bleibt dieses Modul ohne das
 * (proprietäre) Amazon-Paket baubar und typgeprüft; fehlt die Registrierung,
 * meldet die Oberfläche HLS als nicht eingebunden.
 *
 * Ablauf laut Amazon-Dokumentation („Play adaptive content with Shaka Player“):
 * `VideoPlayer` erzeugen, `initialize()`, Surface-Handle setzen, `ShakaPlayer`
 * mit dem Video-Element erzeugen, `load(content, autoplay)`. Beim Beenden
 * umgekehrt: `unload()`, Handle löschen, `deinitialize()`.
 */

let playerConstructor: ShakaPlayerConstructor | null = null;
let playerVersion = "";

export function registerShakaPlayer(next: ShakaPlayerConstructor, version = ""): void {
  playerConstructor = next;
  playerVersion = version;
  registerHlsAdapter(createAdapter);
  void logEvent(
    "player",
    `Shaka-Player registriert${version ? ` (${version})` : ""}.`,
  );
}

export function registeredShakaVersion(): string {
  return playerVersion;
}

/**
 * Schreibt einen Marker in die Geräte-Logs. `scripts/verify-shaka.mjs` liest
 * genau diese Zeilen, um einen HLS-Lauf ohne Fernbedienung zu bewerten.
 * Absichtlich ASCII, damit grep auf jedem Gerät greift.
 */
function smokeMarker(message: string): void {
  console.log(`StreamingHub smoke: ${message}`);
}

function createAdapter(callbacks: HlsCallbacks): HlsAdapter {
  let video: VideoPlayer | null = null;
  let shaka: ShakaPlayerInstance | null = null;
  let surfaceHandle: string | null = null;
  let lastReport = 0;
  let destroyed = false;

  const element = () => video;

  const reportProgress = () => {
    const current = element();
    if (!current) return;
    const duration = current.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const now = Date.now();
    if (now - lastReport < 10_000) return;
    lastReport = now;
    callbacks.onProgress(Math.round(current.currentTime * 1000), Math.round(duration * 1000));
  };

  async function destroy(): Promise<void> {
    if (destroyed) return;
    destroyed = true;
    const handle = surfaceHandle;
    surfaceHandle = null;

    try {
      await shaka?.unload();
    } catch (reason) {
      void logError("player", reason, "Shaka unload");
    }
    shaka = null;

    const previous = video;
    video = null;
    if (previous) {
      try {
        previous.removeEventListener("timeupdate", reportProgress);
      } catch {
        // Ein bereits freigegebenes Element darf hier nicht stören.
      }
      if (handle) {
        try {
          previous.clearSurfaceHandle(handle);
        } catch {
          // Siehe oben: Aufräumen ist best effort.
        }
      }
      try {
        await previous.deinitialize();
      } catch {
        // Siehe oben.
      }
    }
    // Der Wrapper erwartet das Element global; ohne das Zurücksetzen bleibt der
    // Decoder über den Bildschirmwechsel hinaus belegt.
    (globalThis as { gmedia?: unknown }).gmedia = null;
  }

  return {
    async start(handle, url, startPositionMs, drm?: ChannelDrm, options?: { secureBuffers?: boolean }) {
      if (!playerConstructor) {
        smokeMarker("fehler: shaka fehlt");
        callbacks.onError("Der Shaka-Player ist nicht eingebunden.");
        return;
      }
      if (video) return;
      surfaceHandle = handle;

      const current = new VideoPlayer();
      video = current;
      (globalThis as { gmedia?: unknown }).gmedia = current;

      try {
        await current.initialize();
        current.setSurfaceHandle(handle);
        current.autoplay = false;

        current.addEventListener("playing", () => {
          smokeMarker("wiedergabe laeuft");
          callbacks.onStatus("Wiedergabe läuft");
          callbacks.onPausedChange(false);
        });
        current.addEventListener("pause", () => callbacks.onPausedChange(true));
        current.addEventListener("timeupdate", reportProgress);
        current.addEventListener("ended", () => {
          callbacks.onStatus("Beendet");
          reportProgress();
        });
        current.addEventListener("error", () => {
          smokeMarker("fehler: video");
          callbacks.onError("Die Quelle konnte nicht wiedergegeben werden.");
          void logError("player", "VideoPlayer meldet error", redactUrl(url));
        });

        const secureBuffers = Boolean(drm && options?.secureBuffers);
        const settings: ShakaPlayerSettings = {
          secure: secureBuffers,
          abrEnabled: true,
          abrMaxWidth: 3840,
          abrMaxHeight: 2160,
        };
        shaka = new playerConstructor(current, settings);

        const dash = /\.mpd(\?|$)/i.test(url);
        callbacks.onStatus("Lade Manifest …");
        await shaka.load(
          {
            uri: url,
            ...drmContentFields(drm, options?.secureBuffers),
            type: dash ? "DASH" : "HLS",
            container: dash ? "MP4" : "MPEG2TS",
            start_position: startPositionMs > 5_000 ? startPositionMs / 1000 : 0,
          },
          true,
        );

        // Sequence-Mode für MPEG-TS-HLS: spielt Segmente auch dann, wenn ihre
        // Zeitstempel nicht zusammenpassen (bei IPTV-Quellen üblich).
        if (!dash) {
          try {
            shaka.player?.configure("manifest.hls.sequenceMode", true);
          } catch {
            // Ältere Wrapper kennen den Pfad nicht; die Wiedergabe läuft weiter.
          }
        }

        smokeMarker("hls geladen");
        callbacks.onStatus("Wiedergabe läuft");
        void logEvent("player", "HLS-Wiedergabe über Shaka gestartet.", "info", redactUrl(url));
      } catch (reason) {
        smokeMarker(
          `fehler: ${reason instanceof Error ? reason.message : "quelle nicht ladbar"}`,
        );
        callbacks.onError(
          reason instanceof Error ? reason.message : "Der HLS-Player konnte die Quelle nicht laden.",
        );
        void logError("player", reason, redactUrl(url));
        await destroy();
      }
    },

    togglePlayback() {
      const current = element();
      if (!current) return;
      if (current.paused) void current.play();
      else current.pause();
    },

    seekBy(seconds) {
      const current = element();
      if (!current) return;
      const duration = current.duration;
      const target = current.currentTime + seconds;
      const upper = Number.isFinite(duration) && duration > 0 ? duration : target;
      current.currentTime = Math.max(0, Math.min(upper, target));
    },

    destroy,
  };
}
