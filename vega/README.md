# StreamingHub für Vega OS

React-Native-App für Vega OS (Fire TV mit Vega), funktionaler Zwilling der
Android-App in [`../android`](../android). Umfang der ersten Fassung: Playlist-
Import, Einordnung in Live/Filme/Serien, Suche, Kategorien, Favoriten,
Wiedergabe mit Fortsetzungspunkt, XMLTV-Programmführer mit Erinnerungen,
Gerätekopplung über `streaminghub.org/activate`, Kontostatus, Premium-Anzeige,
Demo-Modus und Low-Spec-Modus.

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
(MP4, MKV …). Ein `.m3u8`- oder `.mpd`-Manifest braucht **MSE-Modus** plus
JavaScript-Player. Amazon liefert dafür gepatchte Shaka-Pakete, die als
Quellordner ins Projekt kopiert werden (Dokumentation: *Play adaptive content
with Shaka Player*).

Solange das Paket fehlt, zeigt der Player für HLS-Quellen eine Erklärung statt
einer schwarzen Fläche – kein vorgetäuschtes "lädt". Der Anschluss ist
vorbereitet:

1. Shaka-Paket von Amazon herunterladen, entpacken und laut Dokumentation
   `src/` nach `vega/src/shakaplayer/` kopieren.
2. [`src/player/shaka-adapter.example.ts`](src/player/shaka-adapter.example.ts)
   nach `src/player/shaka-adapter.ts` kopieren, die kommentierten Zeilen
   aktivieren (`new ShakaPlayer(...)`, `load(...)`).
3. In `src/app.tsx` einmalig `registerShakaAdapter()` aufrufen.

Damit läuft HLS über `createHlsAdapter()` in
[`src/player/hls.ts`](src/player/hls.ts); der Rest der App bleibt unverändert.
**Progressive Quellen laufen ohne diesen Schritt.**

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
