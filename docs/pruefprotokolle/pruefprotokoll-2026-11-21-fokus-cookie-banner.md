# Prüfprotokoll: Fokusführung im Cookie-Banner

Angelegt nach [../PRUEFPROTOKOLL-VORLAGE.md](../PRUEFPROTOKOLL-VORLAGE.md).
Das Protokoll schließt die Fokus-Punkte ab, die in den Korrekturen am Banner
zwischen dem 20. und 21.11.2026 behoben wurden.

## 1. Kopf

```
Prüfgegenstand:        Fokusführung im Cookie-Banner: Erscheinen, Tabulatur,
                       Escape, Schließen, Wiederöffnen, Reload sowie die
                       Fokusreserve am Seitenende
Umfang (Seiten/Flows): Startseite `/` bei 390 px – Erstaufruf ohne Cookie,
                       Tabulatur im und aus dem Banner, Escape bei Fokus
                       außerhalb, Reload nach Escape, Öffnen über den
                       Auslöser im Footer, Fokus auf dem Auslöser am Seitenende
Nicht geprüft:         echte Screenreader (NVDA, JAWS, VoiceOver, TalkBack),
                       mobile assistive Technologien, Zoom 200 %,
                       Textabstands-Overrides, Kontrastmodus, angemeldeter
                       Bereich, andere Breiten als 390 px

Datum:                 21.11.2026
Prüfende Person:       Codebuff (automatisierter Assistent), im Auftrag
Rolle:                 technische Prüfung; keine juristische Freigabe,
                       keine Freigabe durch eine qualifizierte Person

Stand der Anwendung:   f96df5b (main), ausgeliefert unter https://streaminghub.org
Umgebung:              [x] Produktion (DOM-Messung), [x] Quelltextprüfung
Datenbasis:            [x] keine Anmeldung, kein Einwilligungs-Cookie gesetzt
                       [ ] Testkonto (nicht verwendet)

Maßstab:               EN 301 549 / WCAG 2.2 Stufe AA
Werkzeuge:             Playwright-DOM-Messung, Quelltextprüfung; axe-core in
                       diesem Lauf nicht eingesetzt
Hilfsmittel:           Tastatur (Tab, Shift+Tab, Escape), Messung von
                       Fokusrechtecken, `activeElement` und berechneten Stilen
Browser und Versionen: Chromium 156 (Cloud-Browser), 390 × 844 px
Betriebssysteme:       Linux (Host des Cloud-Browsers)

Gesamtergebnis:        [x] keine offenen Fokus-Barrieren im geprüften Umfang
                       [ ] keine wesentlichen Barrieren insgesamt – offen
                       bleibt die Gegenprobe mit einem echten Screenreader

Freigabe durch:        ____________________  am ____________
```

Gemessen wurde der gerenderte Banner auf der Produktionsseite; die Aussagen zu
Rückgabezielen sind zusätzlich am Quelltext geprüft.

## 2. Zustände und Fokus

| Zustand | Banner | Fokus laut `document.activeElement` | Ergebnis |
| --- | --- | --- | --- |
| Erstaufruf ohne Cookie | offen, 305 px hoch, Oberkante bei 539 px | Dialog selbst (`role="dialog"`, `tabIndex` -1) | bestanden |
| `Tab` im Banner | offen | „Mehr erfahren" → „Alle akzeptieren" → „Nur notwendige" → `BODY` → „Zum Inhalt springen" → „StreamingHub" → Sprachwahl | bestanden (keine Falle, siehe Abschnitt 4) |
| `Escape` | geschlossen | Fokus bleibt, wo er war; lag er im Banner, geht er auf den Auslöser im Footer | bestanden |
| Reload nach Escape | bleibt geschlossen | `BODY`, `scrollY` 0 – kein Fokusraub | bestanden |
| Öffnen über den Auslöser | offen | Dialog selbst | bestanden |

Messwerte des Erstaufrufs bei 390 × 844 px:

| Messung | Wert |
| --- | --- |
| Bannerrechteck | Oberkante 539 px, Höhe 305 px, Unterkante 844 px (Fensterunterkante) |
| Fokusrechteck des Dialogs | 539–844 px, also vollständig im sichtbaren Bereich |
| `--consent-banner-space` auf `<html>` | `305px` |
| `scroll-padding-bottom` auf `<html>` | `305px` |
| `padding-bottom` auf `<body>` | `305px` |
| maximaler Scrollweg mit Banner | 8863 px |

## 3. Wahrnehmbarkeit

Der Fokusring ist im Banner und auf dem Auslöser sichtbar: berechnet
`solid 1.6px rgb(6, 182, 212)` bei fokussiertem „Cookie-Einstellungen". Der
Dialog hat keinen eigenen Rahmen, der ihn überdecken könnte.

Die Höhenreserve ist keine reine Optik: Sie liefert den Scrollweg, den der
Browser braucht, um ein fokussiertes Element über dem Banner zu halten
(Abschnitt 4). Ohne sie wäre der Scrollweg um genau die Bannerhöhe kürzer.

## 4. Bedienbarkeit

**Escape erreicht den Banner unabhängig vom Fokus.** Der Tastendruck wird auf
`document` ausgewertet, nicht am Dialog. Wer während des offenen Banners
außerhalb tabbt – etwa in die Fußzeile –, schließt ihn weiterhin mit `Escape`.
Gemessen mit Fokus auf „StreamingHub" im Kopfbereich: Banner zu, Ansage
„Einstellungen geschlossen – es wurde nichts gespeichert.", kein Cookie
gesetzt.

**Keine Tastaturfalle.** Der Banner ist bewusst nicht modal (`aria-modal="false"`):
Die Seite bleibt bedienbar, und `Tab` verlässt den Dialog nach den drei
Banner-Elementen wieder. Das ist bei einem Einwilligungsbanner gewollt; eine
Falle im Sinne von 2.1.2 entsteht dadurch nicht.

**Fokus nicht verdeckt (2.4.11).** Am Seitenende, bei geöffnetem Banner und
maximalem Scrollweg (8863 px), liegt der fokussierte Auslöser
„Cookie-Einstellungen" bei 407–451 px, die Banneroberkante bei 539 px. Der
Fokusring bleibt vollständig sichtbar. Möglich machen das
`scroll-padding-bottom` (damit der Browser beim Fokussieren oberhalb des
Banners einrastet) und das `padding-bottom` am `<body>` (damit überhaupt
Scrollweg existiert).

**Bekannter Klemmsprung beim Schließen am Seitenende.** Mit Banner beträgt der
maximale Scrollweg 8863 px, ohne Banner 8558 px; die Differenz entspricht der
Reserve von 305 px. Wer ganz unten steht und den Banner schließt, springt um
diesen Betrag nach unten. Der Sprung ist die freigegebene Reserve selbst; eine
fokusabhängige Reserve würde nur zusätzlichen Code und keinen anderen Effekt
bedeuten und wurde deshalb verworfen.

**Fokus nach dem Schließen.** `close()` gibt den Fokus an das Element zurück,
das ihn vor dem Öffnen hatte – aber nur, wenn der Fokus im Banner lag. Wer
inzwischen im Seiteninhalt arbeitet, behält seinen Fokus. Erschien der Banner
von selbst, gibt es kein Rückgabeziel; dann geht der Fokus auf den Auslöser im
Footer statt auf `BODY`, ohne die Seite zu scrollen.

## 5. Verständlichkeit und Robustheit

- Der Dialog trägt `role="dialog"`, `aria-labelledby="consent-title"` und
  `aria-describedby="consent-text"`; Name und Beschreibung sind damit
  zugeordnet.
- Während des Speicherns steht `aria-busy="true"` am Dialog, die Live-Region
  außerhalb des Dialogs sagt „Deine Auswahl wird gespeichert …" an; danach
  „… wurde gespeichert." beziehungsweise den Fehler über `role="alert"`.
- Nach `Escape` merkt sich der Tab die Ablehnung in `sessionStorage` und der
  Banner kommt beim Reload nicht zurück. Wirft der Speicher (privater Modus,
  blockierte Website-Daten), erscheint der Banner trotzdem und `Escape`
  schließt ihn weiterhin; nur das Merken entfällt dann.

## 6. Festgestellte Barrieren

| Nr. | Barriere | WCAG | Ursache | Maßnahme | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | `Escape` schloss den Banner nur, wenn der Fokus im Dialog lag | 2.1.1 | Tastendruck wurde am Dialog ausgewertet | Auswertung auf `document`, solange der Banner offen ist | behoben |
| 2 | Fokussierte Elemente lagen am Seitenende unter dem Banner | 2.4.11 | Keine Reserve für die Bannerhöhe; Fokus blieb verdeckt | Höhe per `ResizeObserver` messen, `--consent-banner-space`, `scroll-padding-bottom` und `body`-Padding | behoben (gemessen) |
| 3 | Der laufende Speichervorgang wurde nicht angesagt | 4.1.3 | Kein Zustand am Dialog, keine Live-Meldung | `aria-busy` am Dialog, Live-Region außerhalb | behoben (gemessen) |
| 4 | Nach `Escape` und Reload erschien der Banner erneut und nahm wieder den Fokus | 2.4.3, 3.2.6 | Ablehnung wurde nirgends festgehalten | `sessionStorage`-Notiz, Reload bleibt ruhig (`BODY`, `scrollY` 0) | behoben (gemessen) |
| 5 | Bei werfendem `sessionStorage` blieb der Banner still aus oder `Escape` blockierte | 2.1.1, 4.1.3 | Speicherzugriff ohne Absicherung brach Effekt und Handler ab | Lesen und Schreiben gekapselt, Fehler zählt wie „nicht abgelehnt" | behoben (gemessen) |

In diesem Lauf wurden keine neuen Barrieren festgestellt.

## 7. Prüfung mit assistiven Technologien

Nicht durchgeführt. Die Aussagen zu Ansagen stützen sich auf das Vorhandensein
einer dauerhaft gerenderten `role="status"`-Region mit Text, nicht auf einen
Screenreader-Lauf. Diese Gegenprobe bleibt offen und ist der nächste sinnvolle
Schritt.

## 8. Grenzen dieser Prüfung

- Gemessen wurde ausschließlich 390 × 844 px; 320 px, 200 % Zoom,
  Textabstands-Overrides und der erzwungene Kontrastmodus sind offen.
- Der Fokus wurde über `document.activeElement` und Rechtecke geprüft, nicht
  über einen Screenreader oder eine Sprachausgabe.
- axe-core lief in diesem Lauf nicht; die Aussage ist keine Aussage über
  sämtliche automatisch prüfbaren Regeln.
- Die Bannerhöhe hängt vom Text ab; andere Sprachen als Deutsch wurden in
  diesem Lauf nicht gemessen.

## 9. Ablage und Aufbewahrung

Ablage im Repository unter `docs/pruefprotokolle/`, Aufbewahrung nach
§ 14 Abs. 2 BFSG wie in der
[BFSG-Pflichten-Checkliste](../BFSG-PFLICHTEN-CHECKLISTE.md) beschrieben. Das
Protokoll wird nicht überschrieben; eine spätere Korrektur ist ein neues
Protokoll mit Verweis auf dieses.
