/**
 * Einbaustelle für Amazons Shaka-Player.
 *
 * Diese Datei ist absichtlich leer: Amazons Shaka-Wrapper ist als
 * „proprietary/confidential“ gekennzeichnet und darf nicht im Repository
 * liegen. `scripts/setup-shaka.mjs` lädt ihn aus Amazons Download, kopiert ihn
 * nach `src/shakaplayer/` (und die Polyfills daneben) und ersetzt diese Datei
 * durch:
 *
 *   import { ShakaPlayer } from "../shakaplayer/ShakaPlayer";
 *   import { registerShakaPlayer } from "./shaka-adapter";
 *   registerShakaPlayer(ShakaPlayer, "4.16.13");
 *
 * Ohne diesen Schritt baut die App weiterhin; HLS-Quellen zeigen dann den
 * Hinweis, dass der Shaka-Player fehlt.
 */
export {};
