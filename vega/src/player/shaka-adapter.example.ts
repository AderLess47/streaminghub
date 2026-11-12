/**
 * Vorlage, kein aktiver Code: Diese Datei wird nicht importiert.
 *
 * Sobald das gepatchte Shaka-Paket von Amazon im Projekt liegt
 * (`src/shakaplayer/`, siehe README, Abschnitt "HLS und DASH"), diese Datei nach
 * `src/player/shaka-adapter.ts` kopieren, den Import-Pfad anpassen und sie in
 * `src/app.tsx` **vor** dem ersten Bildschirm einmal aufrufen:
 *
 *   import { registerShakaAdapter } from "./player/shaka-adapter";
 *   registerShakaAdapter();
 *
 * Danach spielt `PlayerScreen` HLS-Quellen über MSE statt mit einer
 * Fehlermeldung abzubrechen.
 */

import { VideoPlayer, KeplerVideoSurfaceView } from "@amazon-devices/react-native-w3cmedia";
import { registerHlsAdapter, type HlsAdapter } from "./hls";
// import { ShakaPlayer, ShakaPlayerSettings } from "../shakaplayer/ShakaPlayer";

export function registerShakaAdapter(): void {
  registerHlsAdapter((videoPlayer) => {
    const player = videoPlayer as VideoPlayer;
    // let shaka: ShakaPlayer | null = null;

    const adapter: HlsAdapter = {
      async load(url: string) {
        // Die Oberfläche wird beim Mounten erzeugt; erst dann darf der Player
        // den Surface-Handle bekommen (siehe Amazon-Dokumentation).
        const settings = {
          secure: false,
          abrEnabled: true,
          abrMaxWidth: 3840,
          abrMaxHeight: 2160,
        };
        void settings;
        void KeplerVideoSurfaceView;
        // shaka = new ShakaPlayer(player, settings);
        // shaka.load({ uri: url, secure: false, drm_scheme: "", drm_license_uri: "" }, true);
        void url;
      },
      destroy() {
        // shaka = null;
        // @ts-expect-error Der globale Handle gehört dem Shaka-Paket.
        globalThis.gmedia = null;
        void player;
      },
    };

    return adapter;
  });
}
