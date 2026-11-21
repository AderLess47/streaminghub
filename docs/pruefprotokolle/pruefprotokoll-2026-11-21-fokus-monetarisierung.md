# Prüfprotokoll: Fokuswege in den Monetarisierungs-Aktionen

Angelegt nach [../PRUEFPROTOKOLL-VORLAGE.md](../PRUEFPROTOKOLL-VORLAGE.md).
Dieses Protokoll nimmt die Barriere 1 aus
[pruefprotokoll-2026-11-12-kuendigungsablauf.md](pruefprotokoll-2026-11-12-kuendigungsablauf.md)
wieder auf.

## 1. Kopf

```
Prüfgegenstand:        Zustand „Übermittlung" in Kündigung, Retention-Angebot,
                       Trial-Start und Checkout
Umfang (Seiten/Flows): /dashboard/subscription – Kündigungsformular,
                       Retention-Angebot, Trial-Knopf, Checkout monatlich und
                       jährlich; /premium – Checkout monatlich und jährlich
Nicht geprüft:         echte Screenreader (NVDA, JAWS, VoiceOver, TalkBack),
                       angemeldeter Durchlauf mit echtem Stripe-Aufruf,
                       Amazon- und Apple-Kanal, mobile assistive Technologien,
                       Zoom 200 %, Textabstands-Overrides, Kontrastmodus

Datum:                 21.11.2026
Prüfende Person:       Codebuff (automatisierter Assistent), im Auftrag
Rolle:                 technische Prüfung; keine juristische Freigabe,
                       keine Freigabe durch eine qualifizierte Person

Stand der Anwendung:   Ausgangsstand Commit bbb906e (main), geprüfter Stand
                       Branch feat/a11y-monetization
Umgebung:              [x] Produktion (DOM-Messung), [x] Quelltextprüfung
Datenbasis:            [x] keine Anmeldung (Checkout im nicht angemeldeten
                       Zustand), [ ] Testkonto (nicht verwendet)

Maßstab:               EN 301 549 / WCAG 2.2 Stufe AA
Werkzeuge:             Playwright-DOM-Messung, Quelltextprüfung; axe-core in
                       diesem Lauf nicht eingesetzt
Hilfsmittel:           Tastatur (Tab, Enter), Fokus- und Stilmesung im DOM
Browser und Versionen: Chromium 156 (Cloud-Browser), Fensterbreite 390 px
Betriebssysteme:       Linux (Host des Cloud-Browsers)

Gesamtergebnis:        [x] Barriere 1 aus dem Kündigungsprotokoll behoben
                       [ ] keine wesentlichen Barrieren festgestellt – offen
                       bleibt die Gegenprobe mit einem echten Screenreader

Freigabe durch:        ____________________  am ____________
```

Gemessen wurde der Zielzustand des Knopfes: `aria-disabled="true"` bei
unverändertem Beschriftungstext, gesetzt auf der Produktionsseite im
gerenderten Checkout-Knopf. Die übrigen Aktionen sind quelltextseitig geprüft;
ihr Übermittlungszustand ist nur mit einem angemeldeten Konto und einer
Antwort des Zahlungsdienstes erreichbar.

## 2. Attribut- und Zustandsprüfung

| Aktion | Zustand während der Übermittlung | `disabled` | `aria-disabled` | Fokus | Ansage | Ergebnis |
| --- | --- | --- | --- | --- | --- | --- |
| Checkout (`/premium`, gemessen) | Beschriftung bleibt „Premium entdecken", Spinner statt Kartensymbol | nicht gesetzt | `true` | bleibt auf dem Knopf (`document.activeElement`, `tabIndex` 0) | `role="status"`, Text „Wird gesendet …" | bestanden |
| Checkout (`/dashboard/subscription`) | wie oben, monatlich und jährlich | nicht gesetzt | `true` | bleibt auf dem Knopf | `role="status"` | bestanden (Quelltext) |
| Kündigung | Beschriftung bleibt „Abonnement kündigen", Spinner statt Kreuz | nicht gesetzt | `true` | bleibt auf dem Knopf | `role="status"` plus `aria-busy` am Formular | bestanden (Quelltext) |
| Retention-Angebot | Beschriftung bleibt stehen, Spinner statt Haken | nicht gesetzt | `true` | bleibt auf dem Knopf | `role="status"` | bestanden (Quelltext) |
| Trial-Start | Beschriftung bleibt stehen, Spinner statt Funken | nicht gesetzt | `true` | bleibt auf dem Knopf | `role="status"` | bestanden (Quelltext) |

Auf der Produktionsseite gemessene Werte am Checkout-Knopf:

| Messung | Ruhezustand | Zielzustand (`aria-disabled="true"`) |
| --- | --- | --- |
| `disabled`-Attribut | nicht gesetzt | nicht gesetzt |
| `aria-disabled` | nicht gesetzt | `true` |
| Fokussierbar | ja | ja, `tabIndex` 0 |
| `opacity` | 1 | 0,55 |
| `cursor` | `pointer` | `not-allowed` |
| Beschriftung | „Premium entdecken" | „Premium entdecken" |
| Höhe | 46 px | 46 px |

Die Optik des laufenden Zustands kommt aus `.btn[aria-disabled="true"]` in
`src/app/globals.css`; der Knopf sieht damit weiterhin gesperrt aus, bleibt aber
im Tastaturfluss.

## 3. Wahrnehmbarkeit

Der Spinner bleibt rein visuell und ist als SVG `aria-hidden`. Den Zustand
tragen zwei andere Signale: die unveränderte Beschriftung (der Name des Knopfes
springt nicht auf „…") und die Live-Region mit „Wird gesendet …". Die
Ergebnismeldungen laufen unverändert über `LiveMessage`: Erfolg höflich,
Fehler sofort.

## 4. Bedienbarkeit

Tastaturweg für den Checkout: `Tab` bis zum Knopf, `Enter` löst die Anfrage aus.
Während der Anfrage bleibt der Fokus auf dem Knopf; `Tab` führt von dort weiter
zu den übrigen Aktionen. Nach der Antwort steht der Fokus weiterhin auf dem
Knopf, ohne dass ihn ein Effekt zurückholen muss.

Zwei Folgen davon:

1. Der bisherige Hook `useSubmitFocus` entfällt in diesen vier Komponenten. Er
   holte den Fokus nach der Antwort zurück und konnte dabei einen Fokus
   stehlen, den die Person in der Zwischenzeit selbst gesetzt hatte.
2. Ein zweiter Auslöser wird nicht mehr durch das Attribut verhindert, sondern
   im Zustand: `if (pending) return` in den drei Knopf-Komponenten und
   `event.preventDefault()` im `onSubmit` des Kündigungsformulars.

## 5. Verständlichkeit und Robustheit

`aria-disabled` beschreibt den Zustand, ohne das Element aus dem
Barrierefreiheitsbaum zu nehmen; Name, Rolle und Beschreibung bleiben lesbar.
Das Kündigungsformular trägt zusätzlich `aria-busy` am `<form>`, sodass
Screenreader den Bereich als „wird aktualisiert" führen.

## 6. Festgestellte Barrieren

| Nr. | Seite oder Flow | Barriere | WCAG | Schwere | Ursache | Maßnahme | Status | Frist |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Kündigung, Retention, Trial, Checkout | Während der Übermittlung wurde der Knopf `disabled`; der Tastaturfokus fiel auf `<body>`, der laufende Vorgang wurde nicht angesagt | 2.4.3, 4.1.3 | erschwerend | `disabled={pending}` macht den Knopf unfokussierbar; der Spinner ist rein visuell | `aria-disabled` statt `disabled`, Fokus auf dem Knopf halten, Zustand über `FormStatus`/`LiveRegion` ansagen, Doppelauslösung im Zustand abfangen | behoben (Code und DOM-Messung) | – |

Neue Barrieren wurden in diesem Lauf nicht festgestellt.

## 7. Prüfung mit assistiven Technologien

Nicht durchgeführt. Die Aussagen zur Ansage stützen sich auf das Vorhandensein
einer dauerhaft gerenderten `role="status"`-Region mit Text, nicht auf einen
Screenreader-Lauf. Diese Gegenprobe bleibt offen und ist der nächste sinnvolle
Schritt.

## 8. Grenzen dieser Prüfung

- Der Übermittlungszustand wurde an einer Aktion im gerenderten DOM gemessen,
  die übrigen vier nur im Quelltext.
- Ohne angemeldetes Konto und ohne Antwort eines Zahlungsdienstes ist die
  tatsächliche Dauer des Zustands nicht gemessen.
- axe-core lief in diesem Lauf nicht; die Aussage ist keine Aussage über
  sämtliche automatisch prüfbaren Regeln.
- Store-Kanäle (Amazon, Apple) haben eigene Knöpfe und wurden nicht geprüft.

## 9. Ablage und Aufbewahrung

Ablage im Repository unter `docs/pruefprotokolle/`, Aufbewahrung nach
§ 14 Abs. 2 BFSG wie in der
[BFSG-Pflichten-Checkliste](../BFSG-PFLICHTEN-CHECKLISTE.md) beschrieben. Das
Protokoll wird nicht überschrieben; eine spätere Korrektur ist ein neues
Protokoll mit Verweis auf dieses.
