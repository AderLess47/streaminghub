# Amazon-Listing: Texte

Fertige Texte für die Amazon-Appstore-Einreichung von StreamingHub
(`de.streaminghub.app`, Version 1.4.0). Alle Felder sind reiner Text ohne
HTML; die Zeichen- und Byte-Grenzen von Amazon sind unten je Feld geprüft.
Englische Fassung: [`listing-en.md`](listing-en.md).

| Feld | Limit | Verwendet |
| --- | --- | --- |
| Display title | 80 Zeichen | 38 |
| Short description | 1.200 Zeichen / 2.000 Bytes | 743 Zeichen / 755 Bytes |
| Long description | 4.000 Zeichen | 1969 |
| Product feature bullets | 3–5 Zeilen | 5 |
| Keywords | 30 Begriffe | 20 |

## Display title

```
StreamingHub – IPTV-Player für Fire TV
```

## Short description

```
StreamingHub ist ein technischer IPTV-Player für Fire TV, Android TV, Smartphones und Tablets. Du fügst deine eigene M3U-Playlist per URL oder Datei hinzu – die App ordnet die Einträge automatisch in Live-TV, Filme und Serien ein, merkt sich Favoriten und startet die Wiedergabe direkt auf dem Gerät.

Dazu kommen ein XMLTV-Programmführer mit laufender und nächster Sendung, Erinnerungen, lokaler Wiedergabefortschritt und ein Sparmodus für langsame Geräte. Die App stellt keine Sender, Filme oder Serien bereit; du bist für die Rechte an deinen Quellen selbst verantwortlich. Ein Konto ist optional, die Wiedergabe funktioniert ohne Anmeldung. Zum Ausprobieren ohne eigene Playlist lassen sich Demo-Inhalte mit öffentlichen Teststreams laden.
```

## Long description

```
StreamingHub ist ein technischer IPTV-Player für Fire TV, Android TV, Smartphones und Tablets – eine App für deine eigenen Quellen.

DEINE PLAYLIST, DEINE SENDERLISTE
Du importierst eine M3U- oder M3U8-Playlist per URL oder als Datei. StreamingHub ordnet die Einträge automatisch in Live-TV, Filme und Serien ein. Suche, Filter und Favoriten helfen, in großen Listen schnell das Richtige zu finden.

WIEDERGABE
HLS- und VOD-Quellen laufen über Media3/ExoPlayer direkt auf dem Gerät. Für Filme und Serien merkt sich die App den Wiedergabefortschritt lokal, sodass du später weiterschauen kannst.

PROGRAMMFÜHRER
Mit einer XMLTV-Datei oder -URL zeigt der Programmführer die laufende und die nächste Sendung. Für kommende Sendungen lässt sich eine Erinnerung setzen.

FÜR FERNBEDIENUNG UND SCHWACHE GERÄTE
Die Oberfläche ist auf Fokus-Navigation mit dem Steuerkreuz ausgelegt. Der Sparmodus reduziert Listenlängen, Logos und Wiedergabepuffer – gedacht für ältere Fire-TV- und Android-TV-Geräte.

SCHNELLER START
Die zuletzt geladene Playlist liegt lokal im Cache und steht beim Start sofort bereit. Ist die Quelle älter als 15 Minuten, aktualisiert die App sie im Hintergrund.

KONTO OPTIONAL
Die Wiedergabe funktioniert ohne Anmeldung. Wer möchte, koppelt das Gerät über einen Einmalcode auf streaminghub.org/activate, um Geräteverwaltung und Premium-Status im Konto zu sehen. Übertragen werden dabei nur Gerätename, Plattform und App-Version.

ZUM AUSPROBIEREN
Ohne eigene Playlist lassen sich Demo-Inhalte mit öffentlichen Teststreams laden – ideal, um Wiedergabe und Programmführer kennenzulernen.

WAS DIE APP NICHT IST
StreamingHub stellt keine Sender, Filme, Serien oder Playlists bereit und betreibt keinen Streamingdienst. Du entscheidest, welche Quellen du hinzufügst, und bist für die Rechte daran selbst verantwortlich.

HILFE UND RECHTLICHES
Anleitungen und Antworten stehen unter streaminghub.org/help, die Datenschutzhinweise unter streaminghub.org/privacy.
```

## Product feature bullets

Eine Zeile pro Bullet, keine Aufzählungszeichen:

```
Eigene M3U-/M3U8-Playlist per URL oder Datei importieren – automatische Einordnung in Live-TV, Filme und Serien
Wiedergabe über Media3/ExoPlayer inklusive HLS, lokaler Wiedergabefortschritt und Favoriten
XMLTV-Programmführer mit laufender und nächster Sendung sowie Erinnerungen für kommende Sendungen
Fernbedienungsfreundliche Fokus-Navigation und Sparmodus für ältere Fire-TV- und Android-TV-Geräte
Ohne Konto nutzbar, Kopplung optional – inklusive Demo-Inhalten mit öffentlichen Teststreams
```

## Keywords

Komma-getrennt, ohne Dopplungen:

```
iptv player, m3u player, m3u8, playlist player, iptv, streaming player, xmltv, epg, programmführer, tv guide, senderliste, fire tv player, android tv player, hls player, media player, favoriten, erinnerungen, eigene playlist, iptv für fire tv, player für android tv
```

## Reviewer instructions

Amazon prüft, ob der In-App-Content testbar ist. Diesen Text in das
Reviewer-Feld eintragen:

```
Die App enthält keine eigenen Inhalte. Tippe auf dem Startbildschirm auf „Demo-Inhalte ansehen“ (oder Einstellungen → Demo-Modus), um sechs Beispiel-Einträge mit öffentlichen Teststreams zu laden, und spiele einen Eintrag ab. Kein Konto und keine Zahlung nötig.
```

```
The app ships no content of its own. Tap “Demo-Inhalte ansehen” on the home screen (or Settings → Demo-Modus) to load six sample entries from public test streams, then play one. No account and no payment required.
```

Der vollständige Ablauf steht in `docs/DEMO-REVIEW.md`.

## Hinweise zur Einreichung

- Die Texte beschreiben bewusst keine Inhalte: StreamingHub ist ein Player für
  Quellen, die Nutzer selbst hinzufügen. Das entspricht der Produktbeschreibung
  auf der Website und im Android-README.
- Keine Preis-, Verfügbarkeits- oder Erfolgsversprechen. Premium ist eine
  Website-Funktion und wird hier nicht beworben, solange Amazon IAP nicht
  integriert ist.
- Keine Amazon-Logos und keine Formulierungen, die eine Partnerschaft mit
  Amazon nahelegen; „für Fire TV" beschreibt nur die Kompatibilität.
- Screenshots und Grafik liegen im selben Ordner (`store/amazon/`), die
  Demo-Anleitung in `docs/DEMO-REVIEW.md`.
