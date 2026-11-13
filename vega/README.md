# StreamingHub für Vega OS

React-Native-App für Vega OS (Fire TV mit Vega), funktionaler Zwilling der
Android-App in [`../android`](../android). Umfang der ersten Fassung: Playlist-
Import, Einordnung in Live/Filme/Serien, Suche, Kategorien, Favoriten,
Wiedergabe mit Fortsetzungspunkt, XMLTV-Programmführer mit Erinnerungen,
Gerätekopplung über `streaminghub.org/activate`, Kontostatus, Premium-Anzeige,
Demo-Modus, Low-Spec-Modus, Diagnose-Protokoll sowie Datenschutz-, Impressum- und
Kontolöschungs-Links.

Die App ist **kein** Inhaltsangebot: Sie liest ausschließlich die vom Nutzer
importierten Quellen. Übertragen werden nur Konto-, Geräte- und Abo-Metadaten
sowie optional die vom Kunden freigegebene M3U-Quell-URL (`docs/API.md`).

## Stand und Grenzen dieser Fassung

Ehrlich vorweg, weil es den Unterschied zwischen "geschrieben" und "geprüft"
ausmacht:

| Geprüft | Wie |
| --- | --- |
| Typen der gesamten App gegen die echten Amazon-Pakete | `npx tsc --noEmit` in `vega/`, grün (RN 0.83, `react-native-kepler` 4.0.2, `react-native-w3cmedia` 2.3.5) |
| M3U- und XMLTV-Parser | 15 Prüfungen gegen Beispielquellen, alle bestanden (siehe unten) |
| Build als `.vpkg`, Start im Vega Virtual Device, Wiedergabe auf Hardware | **nicht geprüft** – dafür braucht es das Vega SDK (macOS/Linux mit Amazon-Anmeldung) und ein Gerät |
| Verhalten auf echtem Fire-TV-Gerät, Fokusführung mit Fernbedienung | **nicht geprüft** |

Der Parserlauf liegt nicht im Repository, sondern lief einmalig gegen die
Quellen: vier eindeutige Einträge aus fünf M3U-Blöcken (Dublette entfernt),
`#EXTGRP`-Fallback, Film-/Serien-Erkennung, Live als Standard, XMLTV-Zeit mit
und ohne Zone, Entitäten (`&amp;`), verworfene Sendungen mit Ende vor Start,
Fallback auf die Kanal-ID, Sortierung nach Startzeit.

## Diagnose

Die App schreibt ein Protokoll für Fehler und Hardware in AsyncStorage
(`streaminghub.diagnostics`). Es beginnt je Start mit einem Geräte-Kopf (System,
Modell, Bildschirm, Sprache, App-Version) und hält Fehler aus Playlist-, EPG-,
Konto-, Kopplungs- und Wiedergabepfaden fest. Die Einstellungen zeigen die
Einträge, löschen sie auf Wunsch; übertragen wird nichts automatisch. Tokens,
E-Mail-Adressen und URL-Query-Parameter werden nicht geschrieben. Format und
Grenzen: `../docs/APP-PARITAET.md`.

Der Stand gegenüber Android und Apple steht in `../docs/APP-PARITAET.md`: kein
Datei-Import (Vega OS hat keinen Dateidialog) und kein Kauf in der App.

## Bauen und starten

Voraussetzungen: Vega SDK 2.0 mit React Native 0.83, Node 20+, ein
Fire-TV-Gerät mit Vega OS oder das Vega Virtual Device.

```bash
cd vega
npm install
npx tsc --noEmit          # Typprüfung
npx react-native build-vega --build-type Release --build-version 1.0.0 --build-number 1
vega run-app build/…/streaminghub-vega_armv7.vpkg de.streaminghub.vega --device <gerät>
```

`manifest.toml` enthält Paket-ID, `[os.version]` (Pflicht, sonst bricht der
Build ab) und die `[wants]`-Einträge, ohne die `initialize()` des Media-Players
abgelehnt wird. Das Feld `categories = ["com.amazon.category.main"]` macht die
App im Startbereich sichtbar.

Wenn das Projekt aus der Vega-Vorlage erzeugt wird (`vega project generate`),
ersetzt die Vorlage `index.js`, `babel.config.js` und Teile der
`package.json`. Dieses Verzeichnis ist so aufgebaut, dass es sich in eine solche
Vorlage hineinkopieren lässt: `src/` und `manifest.toml` übernehmen, die
Abhängigkeiten aus `package.json` ergänzen.

## HLS und DASH (wichtig)

Der W3C-Player der Plattform spielt im **URL-Modus** nur progressive Dateien
(MP4, MKV …). Ein `.m3u8`- oder `.mpd`-Manifest braucht **MSE-Modus** plus einen
JavaScript-Player. Amazon liefert dafür einen gepatchten Shaka-Player
(Dokumentation: *Play adaptive content with Shaka Player*). Dieser Player ist von
Amazon als **proprietary/confidential** gekennzeichnet – er liegt deshalb nicht
im Repository, sondern wird einmalig eingesetzt:

```bash
cd vega
npm run setup:shaka
```

Das Skript [`scripts/setup-shaka.mjs`](scripts/setup-shaka.mjs) erledigt:

1. Amazons Paket `shaka-rel-v4.8.5-r1.7-devices_scope.tar.gz` laden
   (`--release 4.16.13-r1.2` für eine andere Fassung, `--tarball <datei>` für ein
   vorhandenes Archiv).
2. Mit Amazons `setup.sh` bauen – braucht **Java 21+** und **git**.
3. Wrapper, Polyfills und `PlayerInterface.ts` nach `src/` kopieren und `dist`
   nach `src/shakaplayer/dist`.
4. Den Wrapper durch Amazons selbstständige Fassung aus dem MIT-0-Sample
   [`AmazonAppDev/vega-video-sample`](https://github.com/AmazonAppDev/vega-video-sample)
   ersetzen. Amazons Tarball liefert für 4.8.5/4.16 ein `ShakaPlayer.ts`, das von
   einem `../PlayerBase` erbt – diese Datei fehlt im Paket; der Sample-Wrapper
   enthält dieselbe Logik ohne diese Abhängigkeit.
5. `@xmldom/xmldom`, `base-64` und `fastestsmallesttextencoderdecoder`
   installieren und `src/player/shaka-registration.ts` füllen.

Die kopierten Dateien sind in [`.gitignore`](.gitignore) ausgenommen; `dist` ist
rund 30 MB. `// @ts-nocheck` auf Amazons Quellen hält `npm run typecheck` grün,
ohne den fremden Code zu ändern.

Danach läuft HLS/DASH über [`src/player/hls.ts`](src/player/hls.ts) und
[`src/ui/screens/AdaptivePlayer.tsx`](src/ui/screens/AdaptivePlayer.tsx): Der
Bildschirm rendert `KeplerVideoSurfaceView`, der Adapter erzeugt den
`VideoPlayer`, setzt den Surface-Handle und lädt das Manifest über Shaka. Für
MPEG-TS-HLS wird `manifest.hls.sequenceMode` aktiviert.

**Ohne das Paket baut die App weiterhin**; HLS-Quellen zeigen dann eine
Erklärung statt einer schwarzen Fläche, und im Diagnose-Protokoll steht, dass
der Shaka-Player fehlt. Progressive Quellen laufen ohne diesen Schritt.

Ehrlich zum Stand: Amazons `setup.sh` wurde hier mit Java 21 für 4.8.5 und
4.16.13 vollständig ausgeführt, der zusammengesetzte Baum besteht
`npx tsc --noEmit`. **Nicht geprüft** sind der Vega-Build und die Wiedergabe –
dafür fehlen in dieser Umgebung das Vega SDK und ein Gerät. Der erste Build auf
einer Maschine mit Vega SDK muss zeigen, ob Shaka dort lädt.

## Auf einem Vega-SDK-Rechner prüfen

[`scripts/verify-shaka.mjs`](scripts/verify-shaka.mjs) führt die Kette in einem
Lauf aus und endet mit einer Zusammenfassung je Schritt:

Ohne SDK und ohne Gerät prüft `npm run test:headless` die echte App-Logik unter
Node: Playlist-Parser, XMLTV-Parser und die HLS-Nahtstelle. Das läuft auch in CI
(`Vega logic tests`) und braucht nur Node.

```bash
cd vega
npm run test:headless                      # Parser und HLS-Nahtstelle, kein SDK nötig
npm run verify:shaka                       # Voraussetzungen, Setup, Typprüfung, Build, .vpkg
npm run verify:shaka -- --device VirtualDevice:Tv --start-vvd \
    --smoke-url https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
```

Der zweite Aufruf prüft zusätzlich die Wiedergabe. Dafür schreibt das Skript die
URL in [`src/smoke.ts`](src/smoke.ts), baut die App, startet sie mit
`vega run-app`, liest `vega device start-log-stream` mit und wartet auf die
Marker `StreamingHub smoke: hls geladen` und `… wiedergabe laeuft` (oder
`… fehler: …`). Danach stellt es `src/smoke.ts` zurück; mit `--keep-smoke`
bleibt die URL für einen Handtest stehen. Die Logs landen in
`artifacts/vega-logs/` und sind gitignored.

Optionen: `--timeout 120`, `--start-vvd`, `--vvd-no-gui` (headless),
`--skip-build` (vorhandenes `.vpkg` testen),
`--skip-setup`, `--skip-typecheck`, `--fresh-install`, `--force-setup`,
`--require-device` (CI soll ohne Gerät scheitern), `--help`.

Für CI gibt es [`.github/workflows/vega-shaka.yml`](../.github/workflows/vega-shaka.yml)
(einmalige Einrichtung: [`docs/VEGA-RUNNER.md`](../docs/VEGA-RUNNER.md)):
manuell startbar, läuft auf einem selbst gehosteten Runner mit dem Label `vega`,
installiert Node 20 und JDK 21, baut Shaka, ruft das Skript mit
`--require-device` auf und lädt die Gerätelogs als Artefakt hoch. Ohne
verbundenen Runner startet der Workflow nicht von selbst; Pull Requests bleiben
unberührt.

Grenzen des Automatismus: Das Skript erkennt, dass ein Manifest geladen und
Wiedergabe gemeldet wurde, und wertet Shaka-Fehler aus. **Bild und Ton** kann es
nicht beurteilen – dafür bleibt ein Blick auf das Gerät nötig. Läuft kein
Gerät, endet der Lauf mit „übersprungen“ und das steht so im Bericht.

## Erinnerungen: was Vega OS (noch) nicht kann

Der Android-Client plant Erinnerungen mit `AlarmManager` und zeigt danach eine
Systembenachrichtigung. Vega OS bietet Apps derzeit keinen vergleichbaren Weg:
Das `[tasks]`-Manifest kennt nur das Install-Ereignis. Deshalb erinnert diese
App **innerhalb der laufenden App** – ein Ticker prüft fällige Erinnerungen und
zeigt einen Hinweis. Das ist weniger als auf Android, aber es ist kein
Versprechen, das die Plattform nicht einlöst. Sobald Amazon eine
Benachrichtigungs-API anbietet, ersetzt ein Adapter in
[`src/reminder/reminders.ts`](src/reminder/reminders.ts) den Ticker.

## Premium

Premium entsteht nie im Client: Ein Kaufbeleg ginge an den Server, und nur
`premiumActive` aus der Antwort zählt ([`src/billing/premium.ts`](src/billing/premium.ts),
Port von `PremiumPurchaseController.kt`). In dieser Fassung ist der Store-Adapter
bewusst `unavailableBilling`: Ein Appstore-Build darf keine externe
Zahlungsaufforderung enthalten, und Amazon In-App Purchasing für Vega ist nicht
angebunden. Die Einstellungen zeigen deshalb den Status, aber keinen Kaufknopf.

## Sicherheit

- **Das Aktivierungstoken liegt in AsyncStorage und ist damit unverschlüsselt.**
  Der Android-Client verschlüsselt es mit dem Android Keystore. Für Vega ist
  keine sichere Schlüsselablage dokumentiert; das ist eine bewusste, hier
  dokumentierte Schwäche und vor einer Veröffentlichung zu klären.
- Playlist-Inhalte, EPG-Daten und Wiedergabestände verlassen das Gerät nicht.
  Ausnahme: Premium-Konten senden Fortsetzungspunkte an `/api/v1/progress`.
- Antworten des Servers werden als Daten behandelt, nie als Anweisung.

## Aufbau

```
manifest.toml            Paket, OS-Version, Media-Berechtigungen
index.js                 AppRegistry-Einstieg
src/app.tsx              Navigation, Zustand, Kopplung, Erinnerungen
src/model/types.ts       gemeinsames Datenmodell
src/data/                m3u, xmltv, api, storage, playlist, epg, demo-library
src/player/              Wiedergabe und HLS-Nahtstelle
src/reminder/            Erinnerungsdienst
src/billing/             Premium-Zustandsautomat
src/ui/                  Theme, Layout-Profile, Bausteine, Bildschirme
```

Barrierefreiheit ist mitgedacht, nicht behauptet: Jedes bedienbare Element hat
einen Fokusrahmen aus Rahmen **und** Farbe, Beschriftungen sind deutsch und
sprechend, Zustände stehen als Text (nicht nur als Farbe), und die
Live-Bereiche für Fehler sind assertiv. Ein Prüfprotokoll nach
[`docs/PRUEFPROTOKOLL-VORLAGE.md`](../docs/PRUEFPROTOKOLL-VORLAGE.md) gibt es
für diese App noch nicht – es braucht dafür ein laufendes Gerät.

## Als Nächstes

1. Build und Lauf im Vega Virtual Device, danach auf Hardware.
2. Shaka-Paket einbinden, damit HLS läuft.
3. Fokusführung auf der Fernbedienung durchtesten (Raster, Sprung zwischen
   Reihen, Zurück-Taste).
4. Danach der Apple-Teil (SwiftUI-Multiplatform für iOS, iPadOS, macOS).
