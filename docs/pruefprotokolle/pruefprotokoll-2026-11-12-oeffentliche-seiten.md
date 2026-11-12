# Prüfprotokoll: öffentliche Seiten

Angelegt nach [../PRUEFPROTOKOLL-VORLAGE.md](../PRUEFPROTOKOLL-VORLAGE.md).

## 1. Kopf

```
Prüfgegenstand:        Website streaminghub.org, öffentlicher Bereich
Umfang (Seiten/Flows): 16 Seiten aus der Sitemap, vollständige Liste in Abschnitt 2
Nicht geprüft:         angemeldeter Bereich, Adminbereich, App (Fire TV/Android),
                       Zahlungs- und Amazon-Flows, Hilfsmittel mit echten
                       Screenreadern, englische Fassung, andere Sprachen

Datum:                 12.11.2026
Prüfende Person:       Codebuff (Agent), im Auftrag des Betreibers
Rolle:                 technische Prüfung, keine juristische Bewertung

Stand der Anwendung:   Commit 27cb2dd, App-Code identisch mit dem deployten
                       Stand (Deploy zu 1cc5cf1), Release 1.4.0 laut /api/release
Umgebung:              [x] Dev-Server  [ ] lokal  [ ] Produktion
Datenbasis:            [x] keine Anmeldung  [ ] Testkonto  [ ] echtes Konto

Maßstab:               EN 301 549 / WCAG 2.2 Stufe AA
Werkzeuge:             axe-core 4.10.2 (jsDelivr, Datei vorab geladen und geprüft)
Hilfsmittel:           keine (siehe Abschnitt 8)
Browser und Versionen: Chromium des Cloud-Browsers, User-Agent Chrome/156
Betriebssysteme:       wie vom Cloud-Browser gemeldet (Windows-Kennung)
Viewports:             1280 × 900 (Regelprüfung), 320 × 640 (Reflow)

Gesamtergebnis:        [ ] keine wesentlichen Barrieren festgestellt
                       [x] Barrieren festgestellt, siehe Abschnitt 6
                       [x] Prüfung unvollständig, siehe Abschnitt 8

Freigabe durch:         offen
```

## 2. Automatisierte Prüfung

axe-core 4.10.2, vollständiger Regelsatz. Auf zehn Seiten zusätzlich auf die Tags
`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22a`, `wcag22aa` eingeschränkt –
gleiches Ergebnis, die zwei Befunde tragen ausschließlich das Tag
`best-practice`.

| Seite | Status | Verstöße (WCAG A/AA) | Befunde gesamt | Bemerkung |
| --- | --- | --- | --- | --- |
| `/` | 200 | 0 | 0 | – |
| `/premium` | 200 | 0 | 1 | `landmark-complementary-is-top-level` (best practice), siehe Abschnitt 6 |
| `/download` | 200 | 0 | 0 | – |
| `/activate` | 200 | 0 | 0 | – |
| `/help` | 200 | 0 | 1 | `heading-order` (best practice), siehe Abschnitt 6 |
| `/faq` | 200 | 0 | 0 | – |
| `/contact` | 200 | 0 | 0 | – |
| `/status` | 200 | 0 | 0 | – |
| `/docs/api` | 200 | 0 | 0 | Reflow-Fehler, den axe nicht prüft, siehe Abschnitt 6 |
| `/imprint` | 200 | 0 | 0 | – |
| `/privacy` | 200 | 0 | 0 | – |
| `/account-deletion` | 200 | 0 | 0 | – |
| `/terms` | 200 | 0 | 0 | – |
| `/subscription-terms` | 200 | 0 | 0 | – |
| `/withdrawal` | 200 | 0 | 0 | – |
| `/barrierefreiheit` | 200 | 0 | 0 | – |

Damit gilt: **keine WCAG-A/AA-Verstoßfeststellung durch axe auf 16 Seiten**, zwei
Hinweise aus Best-Practice-Regeln. Das ist ein automatisiertes Ergebnis, kein
Konformitätsnachweis – axe prüft nur einen Teil der Kriterien (siehe Abschnitt 8).

## 3. Wahrnehmbarkeit

| Kriterium | WCAG | Prüfmethode | Ergebnis | Nachweis |
| --- | --- | --- | --- | --- |
| Textkontrast ≥ 4,5:1, große Schrift ≥ 3:1 | 1.4.3 | axe-Regel `color-contrast` auf allen 16 Seiten bei 1280 × 900 | kein Verstoß | Abschnitt 2 |
| Kontrast von Bedienelementen und Grafiken ≥ 3:1 | 1.4.11 | axe-Regel `non-text-contrast` | kein Verstoß | Abschnitt 2 |
| Information nicht allein über Farbe | 1.4.1 | axe-Regel `link-in-text-block`, `color-contrast` | kein Verstoß | Abschnitt 2 |
| Text auf 200 % vergrößerbar | 1.4.4 | nicht in diesem Lauf geprüft | offen | – |
| Reflow bei 320 px | 1.4.10 | Fenster 320 × 640, `scrollWidth` gegen `clientWidth` | **1 Fehler**: `/docs/api` (588 px gegen 305 px) | Abschnitt 6, Barriere 1 |
| Textabstände anpassbar | 1.4.12 | nicht in diesem Lauf geprüft | offen | – |
| Untertitel für Videoinhalte | 1.2.2 | nicht in diesem Lauf geprüft | offen | – |
| Audiodeskription | 1.2.5 | nicht in diesem Lauf geprüft | offen | – |

Reflow-Messung je Seite: 15 von 16 Seiten haben bei 320 px kein horizontales
Scrollen (`scrollWidth` = `clientWidth` = 305). Ausnahme ist `/docs/api`.

## 4. Bedienbarkeit

| Kriterium | WCAG | Prüfmethode | Ergebnis | Nachweis |
| --- | --- | --- | --- | --- |
| Sichtbarer Fokus, Tastaturbedienung, Fokusreihenfolge | 2.1.1, 2.4.3, 2.4.7 | nicht in diesem Lauf geprüft; axe-Regel `focus-order-semantics` ohne Verstoß | offen | – |
| Sprungmarke zum Hauptinhalt | 2.4.1 | vorhanden auf allen Seiten, `a[href="#main"]`, sichtbar bei Fokus (`focus:not-sr-only`) | erfüllt | Messung in Abschnitt 5 |
| Zielgrößen ≥ 24 × 24 px | 2.5.8 | Rechtecke aller `a`, `button`, `input`, `select`, `textarea`, `summary` bei 320 px gemessen | erfüllt, ein Sonderfall geprüft | Abschnitt 5 |
| Kein Blinken über drei Mal pro Sekunde | 2.3.1 | axe-Regel `blink`, `marquee` | kein Verstoß | Abschnitt 2 |
| Bewegung steuerbar, reduzierte Bewegung respektiert | 2.2.2 | nicht in diesem Lauf geprüft | offen | – |
| Erzwungener Kontrastmodus | – | nicht in diesem Lauf geprüft | offen | – |

## 5. Verständlichkeit und Robustheit

| Kriterium | WCAG | Prüfmethode | Ergebnis | Nachweis |
| --- | --- | --- | --- | --- |
| Dokument- und Teilsprache ausgezeichnet | 3.1.1, 3.1.2 | `documentElement.lang` und Anzahl `[lang]` je Seite | erfüllt: `lang="de"` auf allen 16 Seiten, zusätzlich 9 bis 10 Elemente mit eigenem `lang` | Messung |
| Überschriftenhierarchie und Beschriftungen | 1.3.1, 2.4.6 | axe-Regeln `heading-order`, `label`, `aria-*` | ein Hinweis auf `/help` (best practice) | Abschnitt 6 |
| Statusmeldungen angesagt | 4.1.3 | Anzahl `[aria-live]`, `[role=status]`, `[role=alert]` je Seite | vorhanden, wo Rückmeldungen entstehen: `/premium` 3, `/download` 1, `/status` 1, `/docs/api` 1 | Messung |
| Fehlerzuordnung, Fokus auf Fehlerfeld | 3.3.1, 3.3.3 | nicht in diesem Lauf geprüft (Formular absichtlich fehlerhaft absenden) | offen | – |
| Anmeldung ohne kognitive Testaufgabe | 3.3.8 | nicht in diesem Lauf geprüft | offen | – |
| Zielgrößen-Sonderfall | 2.5.8 | `/contact`: Checkbox `#contact-privacy` ist 13 × 16 px, liegt aber in einem `<label>` von 554 × 39 px, das den Klick auslöst | erfüllt, effektive Zielgröße ist das Label | Messung |

Der einzige gemessene Unterschreiter der 24-px-Grenze ist die Sprungmarke mit
1 × 1 px (`sr-only`, `clip-path: inset(50%)`), die im Fokus auf volle Größe
aufklappt. Sie ist damit kein Bedienziel im Sinne von 2.5.8.

## 6. Festgestellte Barrieren

| Nr. | Seite oder Flow | Barriere | WCAG | Schwere | Ursache | Maßnahme | Status | Frist |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `/docs/api` | Bei 320 px Breite ist die Seite 588 px breit; die API-Tabelle läuft aus dem Viewport und ist nicht vollständig lesbar | 1.4.10 | erschwerend | `table.data-table` ist 568 px breit; der Container `.card` hat `overflow-hidden` und keine Querscroll-Lösung | Tabelle in einen Container mit horizontalem Scrollen setzen oder unterhalb von 768 px in gestapelte Zeilen umbauen; danach Reflow erneut messen | offen | – |
| 2 | `/premium` | `<aside class="card sticky top-24 p-6">` liegt in einem anderen Landmark | – (best practice) | kosmetisch | Struktur der Seitenleiste | `aside` außerhalb des Landmarks verschieben oder Rolle anpassen | offen | – |
| 3 | `/help` | Überschriftenfolge springt: `<h3>` innerhalb eines `summary`, ohne vorherige `h2` im selben Abschnitt | – (best practice) | kosmetisch | Aufbau der FAQ-Einträge | Überschriftenebene anpassen oder `summary`-Inhalt ohne eigene Überschrift auszeichnen | offen | – |

Barrieren 2 und 3 sind keine WCAG-A/AA-Verstöße, sondern Hinweise aus
Best-Practice-Regeln. Sie stehen hier, weil sie den Screenreader-Nutzen
verbessern, wenn sie behoben sind.

## 7. Prüfung mit assistiven Technologien

Nicht durchgeführt. Die Tabelle bleibt leer, statt ein Ergebnis zu behaupten.

| Hilfsmittel | Version | Browser | Betriebssystem | Geprüfte Aufgaben | Ergebnis | Bemerkung |
| --- | --- | --- | --- | --- | --- | --- |
| NVDA | – | – | Windows | – | nicht geprüft | kein Zugang zu Windows mit NVDA in dieser Umgebung |
| JAWS | – | – | Windows | – | nicht geprüft | kommerzielle Lizenz erforderlich |
| VoiceOver | – | – | macOS/iOS | – | nicht geprüft | kein Gerät in dieser Umgebung |
| TalkBack | – | – | Android | – | nicht geprüft | kein Gerät in dieser Umgebung |
| Nur Tastatur | – | – | – | – | nicht in diesem Lauf | in früheren Sitzungen geprüft, hier nicht wiederholt und nicht belegt |
| Zoom 400 % | – | – | – | – | nicht in diesem Lauf | – |

## 8. Grenzen dieser Prüfung

```
Nicht geprüft:           angemeldeter Bereich, Adminbereich, App, Checkout,
                         Zahlungs- und Amazon-Flows, englische Fassung,
                         Untertitel/Audiodeskription, Tastaturdurchlauf,
                         Zoom 200/400 %, Textabstände, erzwungener Kontrastmodus
Bekannte Einschränkungen: axe prüft nur einen Teil der Kriterien; 1.4.10, 2.4.7,
                         3.3.1 und 4.1.3 werden von axe nicht oder nur teilweise
                         erfasst. Ein grünes axe-Ergebnis ist kein
                         Konformitätsnachweis.
Warum nicht geprüft:     kein Zugang zu echten Screenreadern, Mobilgeräten,
                         Fire TV oder Produktionskonten in dieser Umgebung;
                         dieser Lauf war auf den öffentlichen Bereich beschränkt.
Geplante Nachholung:     Prüfung mit NVDA und VoiceOver durch eine Person mit
                         Zugang zu diesen Umgebungen, danach angemeldeter Bereich
                         und Checkout.
```

## 9. Ablage

- [x] Im Repository abgelegt.
- [ ] Nachbehebung von Barriere 1 als eigenes Protokoll nachtragen.
- Aufbewahrung: solange die Dienstleistung angeboten wird (§ 14 Abs. 2 BFSG),
  Nachweise auf Verlangen der Marktüberwachung (§ 14 Abs. 5 BFSG).
