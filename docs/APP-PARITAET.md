# Android, Vega OS und Apple: ein Stand

Die drei Clients zeigen dieselbe App auf drei Plattformen. Dieses Dokument hält
fest, was überall gleich ist, wo die Plattform etwas anderes verlangt – und was
noch offen ist. Es ist bewusst keine Werbeseite: „gleich“ heißt hier, dass die
Funktion in allen drei Apps vorhanden ist, nicht dass sie überall gleich aussieht.

Stand: November 2026 (`main` nach der Paritäts- und Protokoll-Änderung).

## Matrix

| Funktion | Android / Fire TV | Vega OS | Apple (iOS, iPadOS, macOS, tvOS) |
| --- | --- | --- | --- |
| Playlist per URL importieren | ja | ja | ja |
| Playlist aus einer Datei importieren | ja (SAF-Dateidialog) | **nein** – kein Dateidialog in Vega OS | **offen** – technisch über `.fileImporter` möglich, noch nicht gebaut |
| Playlist-Cache, sofortiger Start | ja | ja | ja |
| Hintergrund-Auffrischung nach 15 Minuten | ja | ja (ergänzt) | ja (ergänzt) |
| Vom Konto hinterlegte Playlist übernehmen | ja | ja | ja |
| EPG (XMLTV) per URL | ja | ja | ja |
| EPG aus einer Datei | ja | **nein** (siehe oben) | **offen** (siehe oben) |
| Demo-Modus ohne eigene Quelle | ja | ja | ja |
| Low-Spec-Modus | ja | ja | ja |
| Gerätekopplung über `streaminghub.org/activate` | ja | ja | ja |
| Kontostatus aktualisieren, Kopplung aufheben | ja | ja | ja |
| Premium-Kauf | Amazon Appstore | **kein Kauf** – die App zeigt nur den bestätigten Status | StoreKit 2, Universal Purchase über eine Bundle-ID |
| Fortsetzen auf anderen Geräten (nur Premium) | ja | ja | ja |
| Wiedergabestand löschen | ja | ja | ja |
| Datenschutz, Impressum, Kontolöschung in der App | ja | ja (ergänzt) | ja (ergänzt; auf tvOS als Adresse) |
| Erinnerungen an Sendungen | Systembenachrichtigung (`AlarmManager`) | nur in der laufenden App (Vega OS bietet Apps keinen Alarm) | echte lokale Benachrichtigung (`UNUserNotificationCenter`) |
| HLS-Wiedergabe | Media3/ExoPlayer | **offen** – braucht Amazons gepatchten Shaka-Player im MSE-Modus; progressive Dateien laufen | AVPlayer, ohne Zusatzpaket |
| Diagnose-Protokoll für Fehler und Hardware | ja (neu) | ja (neu) | ja (neu) |
| Geräteklassen-Layout | vier Profile (TV, Phone, Tablet, Desktop) | TV-Fokus, Karten und Abstände über Layout-Helfer | adaptive Größenklassen, TV-Fokus-Stil |

## Was bewusst anders bleibt

- **Kaufwege.** Amazon verlangt den Amazon Appstore, Apple StoreKit, Vega OS hat
  für diese App keinen Store-Kauf. Der Server bleibt die einzige Instanz, die
  Premium freischaltet; alle drei Clients zeigen nur den bestätigten Stand.
- **Erinnerungen.** Vega OS kennt für Apps derzeit nur das Install-Ereignis im
  `[tasks]`-Manifest. Die Vega-App erinnert deshalb im Vordergrund. Sobald Amazon
  eine Benachrichtigungs-API anbietet, ersetzt ein Adapter den Ticker.
- **Datei-Import.** Der Android-Client öffnet den System-Dateidialog. Vega OS
  bietet keinen; die Vega-App importiert deshalb nur per URL. Für Apple ist der
  Import über `.fileImporter` möglich und als nächster Schritt vorgesehen – er
  fehlt heute, statt als „vorhanden“ zu gelten.
- **HLS auf Vega.** Siehe `vega/README.md`, Abschnitt „HLS und DASH“.

## Diagnose-Protokoll

Alle drei Apps schreiben ein Protokoll für Fehler und Hardware. Es ist bewusst
gleich aufgebaut, damit sich Einträge aus verschiedenen Clients vergleichen
lassen.

**Format, eine Zeile je Eintrag:**

```
2026-11-13T09:41:07.512Z ERROR playlist: Die Quelle antwortete mit HTTP 403. | https://anbieter.example/liste.m3u
```

- Zeitstempel in UTC (ISO 8601 mit Millisekunden)
- Stufe (`INFO`, `WARN`, `ERROR`)
- Bereich (`device`, `playlist`, `epg`, `account`, `pairing`, `player`, `settings`)
- Meldung, optional Metadaten
- Einmal je App-Start ein `device`-Kopf mit Systemstand, Modell, Bildschirm,
  Sprache und App-Version

**Wo die Datei liegt:**

| App | Ort |
| --- | --- |
| Android | `files/diagnostics/diagnostics.log` im privaten App-Verzeichnis |
| Vega OS | AsyncStorage-Schlüssel `streaminghub.diagnostics` (JSON, gleiche Felder) |
| Apple | `Application Support/StreamingHub/diagnostics.log` |

**Grenzen und Datenschutz:**

- Höchstens 64 000 Zeichen; älteste Einträge fallen zuerst heraus.
- Keine Tokens, keine E-Mail-Adressen, keine Gerätenamen des Nutzers.
- URLs werden vor dem Schreiben von Zugangsdaten, Query und Fragment befreit.
  Playlist-Adressen enthalten häufig Tokens; die haben in einem Protokoll nichts
  zu suchen.
- Nichts wird automatisch übertragen. Das Protokoll verlässt das Gerät nur, wenn
  es jemand in den Einstellungen ansieht, teilt (Android) oder kopiert.

**In der App:** Einstellungen → *Diagnose* – Größe, Anzeigen, Löschen; auf
Android zusätzlich Teilen über den Systemdialog.

## Prüfstand dieser Änderung

- Vega-App: `npx tsc --noEmit` grün (Typen gegen die echten Amazon-Pakete).
- Server und übrige TypeScript-Teile: `npx tsc --noEmit` grün.
- Android (Kotlin) und Apple (SwiftUI): in dieser Umgebung gibt es weder Android
  SDK noch Xcode. Die Änderungen sind geschrieben, aber **nicht kompiliert**.
  Die CI baut weiterhin nur `StreamingHubCore` (swift:5.10); für die Oberflächen
  braucht es einen Mac bzw. ein Android-SDK.
