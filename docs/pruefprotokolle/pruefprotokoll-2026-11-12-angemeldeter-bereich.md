# Prüfprotokoll: angemeldeter Bereich und Checkout

Angelegt nach [../PRUEFPROTOKOLL-VORLAGE.md](../PRUEFPROTOKOLL-VORLAGE.md).
Ergänzt [pruefprotokoll-2026-11-12-oeffentliche-seiten.md](pruefprotokoll-2026-11-12-oeffentliche-seiten.md),
das den angemeldeten Bereich ausdrücklich ausspart.

## 1. Kopf

```
Prüfgegenstand:        Kundenportal (Dashboard) und Web-Checkout
Umfang (Seiten/Flows): /dashboard, /dashboard/subscription, /dashboard/settings,
                       /dashboard/support, Checkout-Knopf, Fehlerpfad Passwortwechsel
Nicht geprüft:         Adminbereich, echte Zahlung (kein Zahlungsanbieter
                       verbunden), Amazon-Käufe, Support-Ticketdetail (keine
                       Tickets vorhanden), MFA-Einrichtung, englische Fassung,
                       Hilfsmittel mit echten Screenreadern

Datum:                 12.11.2026
Prüfende Person:       Codebuff (Agent), im Auftrag des Betreibers
Rolle:                 technische Prüfung, keine juristische Bewertung

Stand der Anwendung:   Commit bc77a79, App-Code identisch mit dem deployten
                       Stand (Deploy zu bc77a79)
Umgebung:              [x] Dev-Server  [ ] lokal  [ ] Produktion
Datenbasis:            [x] Testkonto (temporäre Sitzung, danach gelöscht)

Maßstab:               EN 301 549 / WCAG 2.2 Stufe AA
Werkzeuge:             axe-core 4.10.2, Messung über getBoundingClientRect,
                       scrollWidth und document.activeElement
Hilfsmittel:           keine (siehe Abschnitt 7)
Browser und Versionen: Chromium des Cloud-Browsers, User-Agent Chrome/156
Viewports:             1280 × 900 (Regelprüfung), 320 × 640 (Reflow)

Gesamtergebnis:        [ ] keine Barrieren festgestellt
                       [x] Barrieren festgestellt, siehe Abschnitt 6
                       [x] Prüfung unvollständig, siehe Abschnitt 8
Freigabe durch:         offen
```

## 2. Vorgehen und Datenbasis

Für die Prüfung wurde eine temporäre Sitzung in der lokalen SQLite-Datenbank
angelegt (`sessions` mit SHA-256 des Tokens, 60 Minuten gültig, `mfa_ok = 1`),
als `sh_session`-Cookie im Browser gesetzt und nach der Prüfung wieder gelöscht.
Es wurden keine Kundendaten verändert: Der Passwortwechsel wurde absichtlich mit
falschem aktuellem Passwort ausgelöst, sodass keine Änderung gespeichert wurde.
Nach der Prüfung standen 0 Support-Tickets in der Datenbank, es wurde also nichts
angelegt.

Hinweis zur Reproduzierbarkeit: Die temporäre Sitzung musste während der Prüfung
einmal neu angelegt werden, weil sie zwischendurch nicht mehr erkannt wurde. Das
ist ein Artefakt des Testaufbaus, kein Befund am Produkt.

## 3. Automatisierte Prüfung

axe-core 4.10.2, vollständiger Regelsatz, angemeldet als Kundenkonto.

| Seite | Verstöße | Live-Regionen | Überschriften | Bemerkung |
| --- | --- | --- | --- | --- |
| `/dashboard` | 0 | 5 | H1 Dashboard → H2 Geräte, Gerät koppeln, Schnellzugriff | – |
| `/dashboard/subscription` | 0 | 3 | H1 Abonnement → H2 … | Checkout-Bereich, siehe Abschnitt 5 |
| `/dashboard/settings` | 0 | 10 | H1 Kontoeinstellungen → H2 Profil, Passwort ändern, Daten & Datenschutz | 4 kleine Ziele, alle mit Label, siehe Abschnitt 4 |
| `/dashboard/support` | 0 | 2 | H1 Support-Anfragen → H2 Neue Anfrage … | – |

Keine WCAG-A/AA-Verstoßfeststellung durch axe auf den vier Seiten. Das ist ein
automatisiertes Ergebnis und deckt die in Abschnitt 8 genannten Lücken nicht ab.

## 4. Wahrnehmbarkeit und Bedienbarkeit

| Kriterium | WCAG | Prüfmethode | Ergebnis |
| --- | --- | --- | --- |
| Reflow bei 320 px | 1.4.10 | `scrollWidth` gegen `clientWidth` je Seite | erfüllt: 305 = 305 auf allen vier Seiten |
| Zielgrößen ≥ 24 × 24 px | 2.5.8 | Rechtecke aller Bedienelemente gemessen | erfüllt; Details unten |
| Dokument- und Teilsprache | 3.1.1, 3.1.2 | `lang` geprüft | `lang="de"` auf allen Seiten |
| Statusmeldungen angesagt | 4.1.3 | Live-Regionen gezählt und Inhalt geprüft | vorhanden, siehe Abschnitt 5 und 6 |
| Fehlerzuordnung und Fokus | 3.3.1, 3.3.3 | Passwortformular mit falschem aktuellem Passwort abgeschickt | erfüllt, siehe unten |
| Textkontrast | 1.4.3, 1.4.11 | axe-Regeln `color-contrast`, `non-text-contrast` | kein Verstoß |

Kleine Ziele auf `/dashboard/settings`: Die Sprungmarke (1 × 1 px, klappt im
Fokus auf) und drei Kontrollkästchen mit 13 bis 16 px Kantenlänge. Alle drei
liegen in einem `<label>` von 365 bis 398 × 44 px, das den Klick auslöst – die
effektive Zielgröße ist damit deutlich über 24 px.

Fehlerpfad Passwortwechsel, gemessen nach dem Absenden mit falschem aktuellem
Passwort:

- `#current-password` erhält `aria-invalid="true"` und
  `aria-describedby="current-password-error"`.
- Die Meldung „Das aktuelle Passwort ist falsch." steht in
  `#current-password-error`.
- Der Fokus liegt nach der Antwort auf dem Absende-Knopf – die dokumentierte
  Fokusführungsstrategie des Portals.

## 5. Checkout

Der Web-Checkout ist in dieser Umgebung **nicht mit einem Zahlungsanbieter
verbunden** (die Stripe-Variablen sind leer). Damit ist der Fehlerpfad prüfbar,
der Erfolgsfall nicht.

Gemessen:

- Der Knopf trägt `aria-disabled="true"` und einen `title` mit der Erklärung
  „Die Zahlungsabwicklung ist noch nicht mit einem Zahlungsanbieter verbunden.
  Es wurde keine Zahlung ausgelöst."
- Aktivierung per Tastatur (Enter auf dem fokussierten Knopf) und per Klick löst
  einen Aufruf von `POST /api/subscription/checkout` aus.
- Die Antwort erscheint in einer assertiven Live-Region:
  „Die Zahlungsabwicklung ist noch nicht mit einem Zahlungsdienstleister
  verbunden. Es wurde keine Zahlung ausgelöst."
- Keine Navigation, keine Zahlung, keine Änderung am Abonnement.

## 6. Festgestellte Barrieren

| Nr. | Seite oder Flow | Barriere | WCAG | Schwere | Ursache | Maßnahme | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `/dashboard/subscription`, Checkout-Knopf | `aria-disabled="true"` an einem Knopf, der weiterhin bedienbar ist; Screenreader kündigen ihn als deaktiviert an, Enter löst trotzdem eine Anfrage aus | 4.1.2 | erschwerend | `aria-disabled` wird gesetzt, `disabled` nur während des Ladens (`pending`) | Entweder wirklich deaktivieren und die Erklärung stehen lassen, oder `aria-disabled` entfernen und den Knopf als bedienbar mit verständlicher Rückmeldung führen | offen |
| 2 | `/dashboard/subscription` | Zwei Meldungen zum selben Sachverhalt mit unterschiedlichem Wortlaut: der statische Hinweis („Zahlungsanbieter") in einem `role="status"`-Bereich und die Fehlermeldung („Zahlungsdienstleister") in der assertiven Live-Region | 4.1.3 (Nähe) | kosmetisch | Zwei Textquellen: `i18n/de.ts` für den statischen Hinweis, `lib/payments.ts` für die API-Antwort; der statische Hinweis liegt in einer Statusregion | Wortlaut vereinheitlichen und dem statischen Hinweis die Statusrolle nehmen, damit er nicht als Aktualisierung angesagt wird | offen |
| 3 | `/dashboard/subscription`, Checkout-Fehler | Nach der Fehlerantwort geht der Fokus verloren (`document.activeElement` ist `body`), anders als im Passwortformular, wo er auf dem Absende-Knopf bleibt | 2.4.3 | erschwerend | Der Knopfinhalt wechselt während `pending`, der fokussierte Knoten wird ersetzt; keine Fokusrückgabe wie in `useSubmitFocus` | Fokus nach der Antwort auf den Checkout-Knopf zurückgeben, gleiches Muster wie in den Dashboard-Formularen | offen |

Alle drei Befunde betreffen ausschließlich den Checkout-Bereich und sind mit
dem fehlenden Zahlungsanbieter verknüpft: Solange kein Anbieter verbunden ist,
ist der Knopf der einzige Weg zu dieser Rückmeldung.

Nachtrag 12.11.2026: **Barrieren 1 bis 3 sind behoben.**

1. `aria-disabled` und `title` sind entfernt. Der Knopf bleibt bedienbar, weil er
   der einzige Weg zur Rückmeldung ist; die Erklärung ist über
   `aria-describedby="checkout-unavailable-hint"` mit ihm verknüpft und bleibt
   sichtbar unter dem Knopf.
2. `lib/payments.ts` nutzt jetzt denselben Wortlaut wie die Oberfläche
   („Zahlungsanbieter"). Die statischen Hinweise auf `/dashboard/subscription`
   und `/premium` haben mit `live={false}` keine Statusrolle mehr; `Alert` hat
   dafür ein optionales Prop bekommen, die Vorgabe bleibt die Live-Region.
3. `CheckoutButton` nutzt `useSubmitFocus(pending)` wie die Dashboard-Formulare
   und gibt den Fokus nach der Antwort zurück.

Nachgeprüft im Dev-Browser, angemeldet als Testkonto:

- Kein `aria-disabled` mehr am Knopf, `aria-describedby` gesetzt, der
  Playwright-Klick wird nicht mehr als „element is not enabled“ abgelehnt.
- Nach der Fehlerantwort nur noch **eine** Meldung, in der assertiven
  Live-Region, Wortlaut „…mit einem Zahlungsanbieter verbunden…“;
  `role="status"` kommt auf beiden Seiten nicht mehr vor.
- `document.activeElement` ist nach der Antwort wieder der Knopf
  „Premium im Web abschließen“.
- axe-core 4.10.2: 0 Verstöße auf `/premium` und `/dashboard/subscription`,
  Reflow bei 320 px weiter 305 = 305.

Nicht geprüft bleibt der Erfolgsfall des Checkouts (kein Zahlungsanbieter in
dieser Umgebung) und die Wirkung mit echten Screenreadern.

## 7. Prüfung mit assistiven Technologien

Nicht durchgeführt; die Tabelle bleibt leer statt ein Ergebnis zu behaupten.

| Hilfsmittel | Version | Browser | Betriebssystem | Geprüfte Aufgaben | Ergebnis | Bemerkung |
| --- | --- | --- | --- | --- | --- | --- |
| NVDA | – | – | Windows | – | nicht geprüft | kein Zugang in dieser Umgebung |
| JAWS | – | – | Windows | – | nicht geprüft | kommerzielle Lizenz erforderlich |
| VoiceOver | – | – | macOS/iOS | – | nicht geprüft | kein Gerät verfügbar |
| TalkBack | – | – | Android | – | nicht geprüft | kein Gerät verfügbar |

## 8. Grenzen dieser Prüfung

```
Nicht geprüft:            Adminbereich, erfolgreicher Checkout und
                          Zahlungsseite des Anbieters, Amazon-Käufe,
                          Support-Ticketdetail, MFA-Einrichtung und -Prüfung,
                          Kündigungs- und Reaktivierungsabläufe, englische
                          Fassung, Tastaturdurchlauf über alle Seiten,
                          Textzoom und Textabstände
Bekannte Einschränkungen: Der Erfolgsfall des Checkouts ist ohne Zahlungsanbieter
                          nicht prüfbar; geprüft ist nur der Fehlerpfad.
                          Die Sitzung wurde künstlich erzeugt, nicht über die
                          Anmeldemaske.
Warum nicht geprüft:      kein Zahlungsanbieter in dieser Umgebung, kein Zugang
                          zu echten Hilfsmitteln und Geräten, keine
                          Support-Tickets und keine Abos im Testkonto.
Geplante Nachholung:      Erfolgsfall mit Stripe-Testmodus, danach Support-
                          Ticketdetail und Kündigungsablauf; zusätzlich
                          Prüfung mit NVDA.
```

## 9. Ablage

- [x] Im Repository abgelegt.
- [x] Temporäre Sitzung nach der Prüfung gelöscht, keine Testdaten zurückgelassen.
- [ ] Nachbehebung der Barrieren 1 bis 3 als eigenes Protokoll nachtragen.
