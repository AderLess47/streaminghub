# Prüfprotokoll: Android-DRM auf einem Gerät

Ausfüllbare Vorlage zu [ANDROID-DRM.md](ANDROID-DRM.md). Ein Protokoll je Lauf
und Gerät; Dateiname `pruefprotokoll-JJJJ-MM-TT-android-drm-<geraet>.md`, abgelegt
in `docs/pruefprotokolle/`. Protokolle werden nicht überschrieben – eine
Korrektur ist ein neues Protokoll mit Verweis auf das vorherige.

Die Prüfung braucht echte Hardware: Emulatoren haben kein Widevine, L1 gibt es
nur auf zertifizierten Geräten, PlayReady nur auf Android TV. Ohne Gerät bleibt
jeder Punkt „nicht prüfbar“ – das ist ein gültiges, ehrliches Ergebnis.

---

## 1. Kopf

```
Prüfgegenstand:        StreamingHub Android, DRM-Wiedergabe
App-Version:           ________  (versionName / versionCode)
Commit:                ________
Build-Variante:        [ ] directDebug  [ ] directRelease  [ ] amazonDebug  [ ] amazonRelease

Datum:                 ________
Prüfende Person:       ________
Rolle:                 ________

Gerät (Modell):        ________
Hersteller/Chipset:    ________
Android-Version:       ________  (API ____)
Formfaktor:            [ ] Telefon  [ ] Tablet  [ ] Android TV  [ ] Fire TV
Widevine-Level:        [ ] L1  [ ] L3  [ ] kein Widevine   Quelle: ________
PlayReady vorhanden:   [ ] ja  [ ] nein  [ ] unbekannt
Ausgabe:               [ ] eingebauter Bildschirm  [ ] HDMI direkt  [ ] über AV-Receiver
HDCP-Kette:            ________

Testplaylist:          ________  (Quelle, keine Zugangsdaten im Protokoll)
Testlizenzen:          [ ] gültig  [ ] absichtlich ungültig  [ ] abgelaufen  [ ] Server nicht erreichbar
Werkzeuge:             adb ________  /  DRM-Info-App ________
```

Zugangsdaten, Lizenz-Header-Werte und vollständige Abo-URLs gehören **nicht** ins
Protokoll. Für Nachweise genügen Sendername, Zeitpunkt und Meldungstext.

## 2. Vorbedingungen

- [ ] Playlist importiert, Senderliste sichtbar
- [ ] Mindestens ein klarer Sender, ein Widevine-Sender und – falls vorhanden –
      ein PlayReady-Sender in der Playlist
- [ ] Diagnose-Protokoll geleert (Einstellungen → Diagnose → Löschen)
- [ ] `adb devices` zeigt das Gerät, Logcat mitläuft (Befehl in Abschnitt 5)

## 3. Prüfschritte

Ergebnis je Zeile: **B** = bestanden, **F** = fehlgeschlagen, **N** = nicht
prüfbar. Nachweis kurz eintragen (Screenshot-Name, Logzeile, Zeitstempel).

| Nr. | Prüfschritt | Erwartung | Ergebnis | Nachweis / Bemerkung |
| --- | --- | --- | --- | --- |
| D1 | Klarer Sender ohne `#KODIPROP` abspielen | Bild, Ton, Fortschritt wie vor der DRM-Änderung; keine DRM-Meldung |  |  |
| D2 | Widevine-Sender auf L3-Gerät abspielen | Lizenz wird geholt, Bild erscheint; keine Logwarnung „requires secure decoder … no secure decoder available“ |  |  |
| D3 | Widevine-Sender auf L1-Gerät abspielen | Player nutzt sicheren Decoder; Bild über die geprüfte HDCP-Kette |  |  |
| D4 | L1-pflichtiger Sender auf L3-Gerät | Verständliche Meldung (Lizenz abgelehnt oder Ausgabe nicht erlaubt), kein schwarzes Bild |  |  |
| D5 | Ungültige Lizenz-URL im `license_key` | Meldung „Lizenzserver hat die Wiedergabe abgelehnt“; `Zurück` führt zur Senderliste |  |  |
| D6 | Abgelaufene Lizenz | Meldung „DRM-Lizenz ist abgelaufen“; Neuladen der Playlist möglich |  |  |
| D7 | Lizenzserver nicht erreichbar (Flugmodus oder falscher Host) | Netzwerk- oder Lizenzmeldung; App bleibt bedienbar |  |  |
| D8 | Lizenz-Header (`Authorization=…`) | Sender spielt; im Diagnose-Protokoll stehen weder Header-Wert noch Lizenz-URL |  |  |
| D9 | Bedienung unter DRM: Pause, ±10 s, Fortsetzen aus Fortschritt, API-Meldung | Alles funktioniert; Fortschritt erscheint auf einem zweiten Gerät |  |  |
| D10 | Lange Wiedergabe, Hintergrund/Rückkehr, Lizenz-Renewal | Wiedergabe läuft weiter oder erholt sich; keine Abstürze |  |  |
| D11 | Ton bei geschütztem Video | Ton läuft, lippensynchron |  |  |
| D12 | HDMI trennen oder nicht HDCP-fähigen Ausgang wählen | Verständliche Meldung statt Absturz; nach erneutem Anschließen erneut startbar |  |  |
| D13 | PlayReady-Sender auf Telefon/Tablet | Meldung „Dieses Gerät unterstützt das DRM-Verfahren des Senders nicht.“ |  |  |

## 4. Fehlerfall-Matrix

Je Fall den tatsächlich angezeigten Text eintragen – so lässt sich später
nachweisen, dass die Meldung zur Ursache passt.

| Fall | Angezeigter Text (wörtlich) | Rückweg funktioniert | Bemerkung |
| --- | --- | --- | --- |
| Lizenz abgelehnt |  | [ ] ja [ ] nein |  |
| Lizenz abgelaufen |  | [ ] ja [ ] nein |  |
| Lizenzserver nicht erreichbar |  | [ ] ja [ ] nein |  |
| HTTP 401 / 403 |  | [ ] ja [ ] nein |  |
| Verfahren nicht unterstützt |  | [ ] ja [ ] nein |  |
| Ausgabe nicht erlaubt |  | [ ] ja [ ] nein |  |

## 5. Nachweise und Logs

Logcat der Media3-Decoder-Auswahl und der Player-Fehler mitlaufen lassen:

```
adb logcat -c
adb logcat -s MediaCodecVideoRenderer:D MediaCodecRenderer:D ExoPlayerImpl:D AndroidRuntime:E
```

Nach einem Fehlversuch zusätzlich das App-Protokoll exportieren
(Einstellungen → Diagnose → Teilen) und hier ablegen: ________

Im Protokoll prüfen:

- [ ] kein `Authorization`-Wert, kein Lizenz-Header und keine vollständige
      Lizenz-URL enthalten
- [ ] beim DRM-Fehler steht das Verfahren im Eintrag (`drm=Widevine` /
      `drm=PlayReady` / `drm=keins`)
- [ ] Warnung „Drm session requires secure decoder … but no secure decoder
      available“ nur dort, wo sie erwartet wird (L3-Gerät mit L1-Pflicht)

## 6. Ergebnis

```
Gesamtergebnis:        [ ] alle Prüfschritte bestanden
                       [ ] Fehler gefunden, siehe Abschnitt 7
                       [ ] Prüfung unvollständig (Gerät/Testlizenz fehlt), siehe Abschnitt 7

Bestandene Schritte:   ____ von 13
Nicht prüfbar:         ____
```

## 7. Befunde und Maßnahmen

| Nr. | Befund | Schwere | Maßnahme | Status |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

## 8. Freigabe

```
Geprüft durch:         ____________________  am ____________
Gegenprüfung:          ____________________  am ____________
Freigabe DRM-Wiedergabe: [ ] ja  [ ] nein, Begründung: ____________________
```
