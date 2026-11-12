# Prüfprotokoll: Kündigungsablauf im Kundenportal

Angelegt nach [../PRUEFPROTOKOLL-VORLAGE.md](../PRUEFPROTOKOLL-VORLAGE.md).

## 1. Kopf

```
Prüfgegenstand:        Kündigung des Premium-Abonnements im Web-Kanal
Umfang (Seiten/Flows): /dashboard/subscription – Kündigungsformular in vier
                       Zuständen (Ruhe, Übermittlung, Erfolg, Fehler), danach
                       der Zustand nach dem Neuladen
Nicht geprüft:         echte Screenreader (NVDA, JAWS, VoiceOver, TalkBack),
                       echter Stripe-Aufruf, Amazon-Kanal, Zoom 200 %,
                       Textabstands-Overrides, Windows-Kontrastmodus,
                       Kündigung auf echten Mobilgeräten

Datum:                 12.11.2026
Prüfende Person:       Codebuff (automatisierter Assistent), im Auftrag
Rolle:                 technische Prüfung; keine juristische Freigabe,
                       keine Freigabe durch eine qualifizierte Person

Stand der Anwendung:   Commit 7a08022 (main) / kein eigenes Release
Umgebung:              [x] lokal (Dev-Server mit Stripe-API-Stub)
Datenbasis:            [x] Testkonto (a11y-cancel@example.invalid, danach gelöscht)

Maßstab:               EN 301 549 / WCAG 2.2 Stufe AA
Werkzeuge:             axe-core 4.10.2 (Regelsatz wcag2a, wcag2aa, wcag21a,
                       wcag21aa, wcag22aa), Playwright-Messungen im DOM
Hilfsmittel:           Tastatur (Tab, Enter), Fokus- und Geometriemessung
Browser und Versionen: Chrome 156, Cloud-Browser in Freebuff (User-Agent meldet
                       Windows 10), Fensterbreiten 1280 px und 320 px
Betriebssysteme:       Linux (Host des Cloud-Browsers)

Gesamtergebnis:        [x] Barrieren festgestellt, siehe Abschnitt 6
                       (eine Barriere, erschwerend, nicht blockierend)

Freigabe durch:        ____________________  am ____________
```

Der Kündigungsablauf ist funktional vollständig per Tastatur bedienbar und in
allen geprüften Zuständen frei von axe-Verstößen. Die eine Barriere betrifft den
kurzen Zeitraum, in dem die Kündigung übermittelt wird.

## 2. Automatisierte Prüfung

| Seite oder Flow | URL | Werkzeug und Version | Verstöße | Schwere | Bemerkung |
| --- | --- | --- | --- | --- | --- |
| Kündigung, Ruhezustand | `/dashboard/subscription` | axe-core 4.10.2 | 0 | – | Knopf sichtbar, Live-Regionen vorhanden und leer |
| Kündigung, Übermittlung | dito | axe-core 4.10.2 | 0 | – | Knopf `disabled`, Spinner als SVG |
| Kündigung, Erfolg | dito | axe-core 4.10.2 | 0 | – | Erfolgsmeldung und Vormerkungs-Hinweis gleichzeitig sichtbar |
| Kündigung, Fehler | dito | axe-core 4.10.2 | 0 | – | Fehlermeldung im assertiven Bereich |
| Zustand nach Neuladen | dito | axe-core 4.10.2 | 0 | – | nur der Vormerkungs-Hinweis, keine Aktionsmeldung |

„0 Verstöße" heißt hier: keine der automatisch prüfbaren Regeln verletzt. Der
axe-Lauf ersetzt weder die Tastaturprüfung noch einen Screenreader.

## 3. Wahrnehmbarkeit

| Kriterium | WCAG | Prüfmethode | Ergebnis | Nachweis |
| --- | --- | --- | --- | --- |
| Textkontrast ≥ 4,5:1 | 1.4.3 | axe-Regel `color-contrast` in allen vier Zuständen | bestanden | 0 Verstöße, auch für Erfolgs- (`text-emerald-300`) und Fehlermeldung (`text-rose-300`) |
| Kontrast von Bedienelementen ≥ 3:1 | 1.4.11 | axe-Regel `non-text-contrast` | bestanden | 0 Verstöße |
| Information nicht allein über Farbe | 1.4.1 | Zustände gelesen | bestanden | Erfolg und Fehler stehen als Text, nicht nur als Farbe |
| Reflow bei 320 px ohne horizontales Scrollen | 1.4.10 | Fenster 320 px, `scrollWidth` gegen `clientWidth` | bestanden | 305 px = 305 px |
| Text auf 200 % vergrößerbar | 1.4.4 | nicht geprüft | offen | siehe Abschnitt 8 |
| Textabstände anpassbar | 1.4.12 | nicht geprüft | offen | siehe Abschnitt 8 |

## 4. Bedienbarkeit

| Kriterium | WCAG | Prüfmethode | Ergebnis | Nachweis |
| --- | --- | --- | --- | --- |
| Alles per Tastatur bedienbar | 2.1.1 | vom Seitenanfang nur mit Tab bis zum Knopf, dann Enter | bestanden | Knopf nach 19 Tab-Schritten erreicht, Enter löst die Aktion aus |
| Keine Tastaturfalle | 2.1.2 | Durchtabben über den Knopf hinaus | bestanden | Fokus läuft weiter |
| Sichtbarer Fokus | 2.4.7 | `outline` des fokussierten Knopfs | bestanden | `solid 1.6px` |
| Fokusreihenfolge sinnvoll | 2.4.3 | Fokus vor, während und nach dem Absenden | **teilweise** | nach Abschluss zurück auf dem Knopf; **während der Übermittlung auf `<body>`** – Barriere 1 |
| Zielgröße ≥ 24 × 24 px | 2.5.8 | `getBoundingClientRect` | bestanden | 194 × 44 px, auch bei 320 px Breite |
| Bewegung anhaltbar / reduzierte Bewegung | 2.2.2, – | `prefers-reduced-motion: reduce` emuliert | bestanden | globale Regel in `globals.css` setzt Animations- und Übergangszeiten auf 0,001 ms, der Spinner dreht dann nicht |

## 5. Verständlichkeit und Robustheit

| Kriterium | WCAG | Prüfmethode | Ergebnis | Nachweis |
| --- | --- | --- | --- | --- |
| Überschriftenhierarchie | 1.3.1, 2.4.6 | Accessibility-Baum | bestanden | H1, danach nur H2 (`StreamingHub Premium`, `Abonnementbedingungen`, Footer) |
| Fehlermeldung benennt das Problem und nennt einen Weg | 3.3.1, 3.3.3 | Stub liefert HTTP 500 | bestanden | „Die Kündigung konnte nicht übermittelt werden. Bitte kontaktiere den Support." |
| Statusmeldungen werden angesagt | 4.1.3 | Live-Regionen vor und nach der Aktion | **teilweise** | Erfolg im `polite`-Bereich, Fehler im `assertive`-Bereich, beide dauerhaft im DOM; **für die Übermittlung selbst gibt es keine Ansage** – Teil von Barriere 1 |
| Name, Rolle, Wert korrekt | 4.1.2 | Accessibility-Baum | bestanden | `button` mit Namen „Abonnement kündigen", `type="submit"` |
| Zustand nach Neuladen verständlich | – | Seite neu geladen | bestanden | „Kündigung zum Periodenende vorgemerkt" bleibt als Text stehen; die Aktionsmeldung verschwindet, wie es sich für eine einmalige Rückmeldung gehört |

Messwerte der Live-Regionen:

| Zustand | `aria-live="polite"` | `aria-live="assertive"` | Fokus danach |
| --- | --- | --- | --- |
| Ruhe | leer | leer | – |
| Übermittlung | leer | leer | `<body>` (Barriere 1) |
| Erfolg | „Das Abonnement endet zum Ende des aktuellen Abrechnungszeitraums." | leer | `button` „Abonnement kündigen" |
| Fehler | leer | „Die Kündigung konnte nicht übermittelt werden. Bitte kontaktiere den Support." | `button` „Abonnement kündigen" |

## 6. Festgestellte Barrieren

| Nr. | Seite oder Flow | Barriere | WCAG | Schwere | Ursache | Maßnahme | Status | Frist |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `/dashboard/subscription`, Kündigung | Während der Übermittlung wird der Knopf `disabled`, der Tastaturfokus fällt auf `<body>`; der laufende Vorgang wird nicht angesagt (kein Text in einer Live-Region, kein `aria-busy`) | 2.4.3, 4.1.3 | erschwerend | `disabled={pending}` macht den Knopf unfokussierbar; der Spinner ist rein visuell | Vorschlag: `aria-disabled` statt `disabled` (wie im Checkout-Knopf nach Protokoll 2), Fokus auf dem Knopf halten, Zustand über eine Live-Region ansagen | offen | vor dem nächsten Release |

Dauer der Unterbrechung im Test: 4 Sekunden, weil der Stub die Antwort künstlich
verzögert hat. Bei normaler Antwort liegt sie unter einer Sekunde. Das mildert die
Wirkung, beseitigt sie aber nicht: Der Fokusverlust tritt bei jeder Kündigung auf.

Beobachtungen ohne Barriere, zur Entscheidung durch den Betreiber:

1. Es gibt keinen Bestätigungsschritt: Ein Tastendruck kündigt. Die Kündigung
   wirkt zum Periodenende und ist im Portal nicht rücknehmbar. Für
   Tastatur- und Screenreader-Nutzung ist ein versehentlicher Treffer damit
   folgenreicher als für Zeigegeräte-Nutzung.
2. Nach vorgemerkter Kündigung bleibt der Knopf „Abonnement kündigen" aktiv und
   unverändert beschriftet; ein erneuter Druck wiederholt nur dieselbe Meldung.
   Der Zustand ist korrekt, das Angebot aber irreführend.

## 7. Prüfung mit assistiven Technologien

| Hilfsmittel | Version | Browser | Betriebssystem | Geprüfte Aufgaben | Ergebnis | Bemerkung |
| --- | --- | --- | --- | --- | --- | --- |
| Nur Tastatur | – | Chrome 156 | Linux-Host | Kündigung absenden, Erfolg und Fehler prüfen | bestanden, mit Einschränkung | Barriere 1 |
| NVDA | – | – | – | – | nicht geprüft | kein Zugang in dieser Umgebung |
| JAWS | – | – | – | – | nicht geprüft | kein Zugang in dieser Umgebung |
| VoiceOver (macOS/iOS) | – | – | – | – | nicht geprüft | kein Zugang in dieser Umgebung |
| TalkBack | – | – | – | – | nicht geprüft | kein Zugang in dieser Umgebung |
| Zoom 400 % | – | – | – | – | nicht geprüft | siehe Abschnitt 8 |

## 8. Grenzen dieser Prüfung

```
Nicht geprüft:            echte Screenreader (NVDA, JAWS, VoiceOver, TalkBack),
                          Zoom 200 % und 400 %, Textabstands-Overrides,
                          Windows-Kontrastmodus, Bedienung auf echten Mobil- und
                          TV-Geräten, Kündigung gegen echtes Stripe, Kündigung
                          im Amazon-Kanal (im Portal nicht angeboten)
Bekannte Einschränkungen: Der Kündigungsaufruf ging an einen lokalen
                          Stripe-API-Stub, nicht an Stripe. Damit sind
                          Oberfläche, Serveraktion und Datenbankweg geprüft,
                          nicht aber das Verhalten des echten Anbieters.
                          Die Ansage der Live-Regionen wurde über DOM-Zustand
                          und Attribute belegt, nicht über gehörte Ausgabe.
Warum nicht geprüft:      In dieser Umgebung gibt es keine installierten
                          Screenreader, keine echten Mobil- und TV-Geräte und
                          keine Stripe-Testschlüssel.
Geplante Nachholung:      Screenreader-Durchlauf durch eine Person mit
                          entsprechendem Arbeitsplatz; echter Stripe-Testmodus
                          nach Hinterlegen von Testschlüsseln
                          (`npm run stripe:live-test`).
```

## 9. Ablage und Aufbewahrung

- [x] Protokoll im Repository unter `docs/pruefprotokolle/`.
- [x] Dateiname mit Datum und Umfang.
- [x] Testdaten nach der Prüfung entfernt: Testkonto, Abo-Datensatz, Sitzung und
      Prüfskripte gelöscht; Datenbank danach 2 Nutzer, 2 Abo-Datensätze (Bestand),
      0 Test-Sitzungen.
- [x] Keine Secrets im Protokoll: Der Stub-Schlüssel ist ein Platzhalter und
      nicht geheim.
