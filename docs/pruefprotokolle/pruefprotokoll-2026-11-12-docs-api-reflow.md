# Prüfprotokoll: Reflow auf `/docs/api` behoben

Nachtrag zu [pruefprotokoll-2026-11-12-oeffentliche-seiten.md](pruefprotokoll-2026-11-12-oeffentliche-seiten.md),
Barriere 1. Angelegt nach [../PRUEFPROTOKOLL-VORLAGE.md](../PRUEFPROTOKOLL-VORLAGE.md).

## 1. Kopf

```
Prüfgegenstand:        /docs/api (App-API-Dokumentation), Reflow
Umfang (Seiten/Flows): 1 Seite, Messungen bei 320, 390, 768 und 1280 px
Nicht geprüft:         übrige Seiten (unverändert, siehe Protokoll vom 12.11.2026),
                       Hilfsmittel mit echten Screenreadern, angemeldeter Bereich

Datum:                 12.11.2026
Prüfende Person:       Codebuff (Agent), im Auftrag des Betreibers
Rolle:                 technische Prüfung, keine juristische Bewertung

Stand der Anwendung:   Branch nach PR, App-Code geändert in
                       src/app/docs/api/page.tsx
Umgebung:              [x] Dev-Server  [ ] lokal  [ ] Produktion
Datenbasis:            [x] keine Anmeldung

Maßstab:               EN 301 549 / WCAG 2.2 Stufe AA (1.4.10, 2.1.1)
Werkzeuge:             axe-core 4.10.2, Messung über getBoundingClientRect und
                       scrollWidth/scrollLeft im Browser
Hilfsmittel:           keine
Browser und Versionen: Chromium des Cloud-Browsers, User-Agent Chrome/156
Viewports:             320 × 640, 390 × 800, 768 × 800, 1280 × 900

Gesamtergebnis:        [x] Barriere behoben
                       [ ] neue Barrieren festgestellt (keine)
Freigabe durch:         offen
```

## 2. Ausgangslage

Vorher: Bei 320 px Breite war die Seite **588 px** breit, bei 305 px sichtbarer
Breite. Die Tabelle (568 px) lag in einem Container mit `overflow-hidden`, ohne
Querscrollen. Der Inhalt lief aus dem Viewport und war nicht erreichbar.

Ursache war nicht die Tabelle allein, sondern die Breitenkette: Das innere Grid
(`div.grid.gap-4`) hatte eine automatische Spalte, die sich auf die
Minimalbreite der Tabelle (569 px) aufzog, obwohl der Container nur 268 px breit
war. `min-w-0` auf dem Container allein reichte deshalb nicht.

## 3. Änderung

In `src/app/docs/api/page.tsx`:

1. Das innere Raster wurde zu `flex min-w-0 flex-col gap-4`. Damit schrumpfen die
   Kinder auf die verfügbare Breite, statt sich an der Tabelle zu orientieren.
2. Die Karte bekam `min-w-0`; das `overflow-hidden` bleibt für die abgerundeten
   Ecken.
3. Die Tabelle sitzt jetzt in einem eigenen Bereich:
   `role="region"`, `aria-label="Endpunkte der App-API"`, `tabIndex={0}`,
   `min-w-0 overflow-x-auto`. Der Bereich scrollt waagerecht, statt die Seite zu
   verbreitern, und ist mit der Tastatur scrollbar (WCAG 2.1.1).
4. Die Seitenleiste bekam ebenfalls `min-w-0`.

Eine Tabelle darf nach 1.4.10 waagerecht scrollen, weil sie für Bedeutung und
Nutzung ein zweidimensionales Layout braucht. Entscheidend ist, dass die **Seite**
nicht mehr scrollt und der Inhalt erreichbar bleibt.

## 4. Nachmessung

| Breite | Seite (`scrollWidth` / `clientWidth`) | Seiten-Überlauf | Tabellenbereich | Tabelle scrollt |
| --- | --- | --- | --- | --- |
| 320 px | 305 / 305 | nein | 266 px | ja (345 px Inhalt) |
| 390 px | 375 / 375 | nein | 337 px | ja (345 px Inhalt) |
| 768 px | 753 / 753 | nein | 690 px | nein, passt |
| 1280 px | 1265 / 1265 | nein | 744 px | nein, passt |

Zusätzlich gemessen bei 320 px:

- `scrollLeft` ließ sich bis 78,4 von 79 px setzen – der Bereich scrollt
  tatsächlich, die Tabelle ist vollständig erreichbar.
- Kein Element ragt über die Viewport-Breite hinaus (Prüfung aller Elemente
  gegen `clientWidth`).
- Der Bereich ist per Tastatur fokussierbar (`tabindex="0"`) und zeigt den
  globalen Fokusring (`outline: solid 1.6px rgb(6, 182, 212)`).
- axe-core 4.10.2: **0 Verstöße** auf der geänderten Seite, auch mit dem neuen
  `region`-Landmark.

## 5. Barrieren

| Nr. | Seite | Barriere | WCAG | Schwere | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | `/docs/api` | Seite 588 px breit bei 320 px, Tabelle abgeschnitten | 1.4.10 | erschwerend | **behoben am 12.11.2026**, Nachmessung in Abschnitt 4 |

Keine neuen Barrieren festgestellt.

## 6. Grenzen dieser Prüfung

```
Nicht geprüft:            Darstellung in anderen Browsern (nur Chromium),
                          Bedienung mit Screenreadern, Verhalten bei
                          Textzoom 200 % und bei Textabstands-Overrides
Bekannte Einschränkungen: Die Tabelle scrollt bei 320 und 390 px weiterhin
                          waagerecht (erlaubt nach 1.4.10), statt gestapelt
                          dargestellt zu werden. Das ist eine bewusste
                          Entscheidung zugunsten der Lesbarkeit.
Warum nicht geprüft:      keine weiteren Browser und Hilfsmittel in dieser
                          Umgebung verfügbar
Geplante Nachholung:      Prüfung mit NVDA und VoiceOver, danach Textzoom und
                          Textabstände
```

## 7. Ablage

- [x] Im Repository abgelegt.
- [x] Barriere 1 im Protokoll vom 12.11.2026 als behoben nachgetragen.
- Aufbewahrung wie beim Ausgangsprotokoll.
