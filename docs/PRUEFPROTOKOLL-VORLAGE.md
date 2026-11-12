# Vorlage: Prüfprotokoll Barrierefreiheit

Vorlage zum Ausfüllen. Sie hält eine Prüfung so fest, dass sie einer
Marktüberwachungsbehörde als Nachweis dient – nicht als Selbsterklärung, sondern
als Beleg: was geprüft wurde, womit, von wem, mit welchem Ergebnis und was daraus
folgte.

Rechtsgrundlage der Auskunftspflicht: § 14 Abs. 5 BFSG. Aufbewahrung der
Informationen zur Barrierefreiheit: § 14 Abs. 2 BFSG. Ablauf, wenn die Schwelle
überschritten wird: [BFSG-PFLICHTEN-CHECKLISTE.md](BFSG-PFLICHTEN-CHECKLISTE.md).

Ein Protokoll pro Prüflauf. Dateiname:
`pruefprotokoll-JJJJ-MM-TT-<umfang>.md`, zum Beispiel
`pruefprotokoll-2026-11-12-oeffentliche-seiten.md`.

---

## 1. Kopf

```
Prüfgegenstand:        
Umfang (Seiten/Flows): 
Nicht geprüft:         

Datum:                 
Prüfende Person:       
Rolle:                 

Stand der Anwendung:   Commit ________  / Release ________  / Build ________
Umgebung:              [ ] lokal  [ ] Dev-Server  [ ] Produktion
Datenbasis:            [ ] keine Anmeldung  [ ] Testkonto  [ ] echtes Konto

Maßstab:               EN 301 549 / WCAG 2.2 Stufe AA
Werkzeuge:             
Hilfsmittel:           
Browser und Versionen: 
Betriebssysteme:       

Gesamtergebnis:        [ ] keine wesentlichen Barrieren festgestellt
                       [ ] Barrieren festgestellt, siehe Abschnitt 6
                       [ ] Prüfung unvollständig, siehe Abschnitt 8

Freigabe durch:         ____________________  am ____________
```

Der Stand der Anwendung ist der wichtigste Punkt: Ohne Commit, Release oder
Build ist das Protokoll später nicht auf einen Stand der Anwendung beziehbar und
damit als Nachweis wertlos.

## 2. Automatisierte Prüfung

Werkzeug mit Version nennen – Ergebnisse ändern sich mit der Regelversion.

| Seite oder Flow | URL | Werkzeug und Version | Verstöße | Schwere | Bemerkung |
| --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |

Auszufüllen je geprüfter Seite, auch für angemeldete Bereiche und den
Adminbereich. „Keine Verstöße" ist nur aussagekräftig zusammen mit Werkzeug,
Version und Seitenliste.

## 3. Wahrnehmbarkeit

| Kriterium | WCAG | Prüfmethode | Ergebnis | Nachweis |
| --- | --- | --- | --- | --- |
| Textkontrast ≥ 4,5:1, große Schrift ≥ 3:1 | 1.4.3 | Messung gegen den tatsächlich gezeichneten Hintergrund, alle Textknoten |  |  |
| Kontrast von Bedienelementen und Grafiken ≥ 3:1 | 1.4.11 | Messung von Rahmen, Fokusring, Icons |  |  |
| Information nicht allein über Farbe | 1.4.1 | Fehlerzustände, Status, Diagramme ansehen |  |  |
| Text auf 200 % vergrößerbar ohne Verlust | 1.4.4 | Browser-Zoom 200 % |  |  |
| Reflow bei 320 px ohne horizontales Scrollen | 1.4.10 | Fenster auf 320 px Breite |  |  |
| Textabstände anpassbar | 1.4.12 | Textabstands-Overrides anwenden |  |  |
| Untertitel für aufgezeichnete Videoinhalte | 1.2.2 |  |  |  |
| Audiodeskription oder Alternative | 1.2.5 |  |  |  |

## 4. Bedienbarkeit

| Kriterium | WCAG | Prüfmethode | Ergebnis | Nachweis |
| --- | --- | --- | --- | --- |
| Alles per Tastatur bedienbar | 2.1.1 | Nur Tab, Shift+Tab, Enter, Leertaste, Pfeiltasten |  |  |
| Keine Tastaturfalle | 2.1.2 | Menüs, Dialoge, Player |  |  |
| Sichtbarer Fokus | 2.4.7 | Durchtabben, Fokusring bei jedem Element |  |  |
| Fokusreihenfolge sinnvoll | 2.4.3 |  |  |  |
| Fokus nicht verdeckt | 2.4.11 | Sticky Header, Cookie-Banner, Toasts |  |  |
| Sprungmarken und Landmarken | 2.4.1 |  |  |  |
| Zielgrößen ≥ 24 × 24 px | 2.5.8 | Messen, auch bei 320 px Breite |  |  |
| Ziehen hat eine Alternative | 2.5.7 | Slider, Sortierlisten |  |  |
| Kein Inhalt blinkt mehr als drei Mal pro Sekunde | 2.3.1 |  |  |  |
| Bewegung anhaltbar, automatisierte Inhalte steuerbar | 2.2.2 |  |  |  |
| Reduzierte Bewegung respektiert | – | `prefers-reduced-motion`, auch Animationsverzögerungen |  |  |
| Erzwungener Kontrastmodus | – | Windows Kontrastmodus, `forced-colors` |  |  |

## 5. Verständlichkeit und Robustheit

| Kriterium | WCAG | Prüfmethode | Ergebnis | Nachweis |
| --- | --- | --- | --- | --- |
| Überschriftenhierarchie und Beschriftungen | 1.3.1, 2.4.6 | Accessibility-Baum |  |  |
| Dokument- und Teilsprache ausgezeichnet | 3.1.1, 3.1.2 | `lang`-Attribute prüfen |  |  |
| Fehler werden benannt und dem Feld zugeordnet | 3.3.1 | Formular absichtlich falsch absenden |  |  |
| Fehlermeldung nennt eine Lösung | 3.3.3 |  |  |  |
| Fokus springt auf das erste Fehlerfeld | – |  |  |  |
| Pflichtfelder erkennbar, nicht nur über Farbe | 3.3.2 |  |  |  |
| Bereits eingegebene Daten nicht erneut verlangen | 3.3.7 | Mehrschrittige Formulare, Checkout |  |  |
| Hilfe an konsistenter Stelle | 3.2.6 |  |  |  |
| Anmeldung ohne kognitive Testaufgabe | 3.3.8 | Login, Zwei-Faktor-Code, Captcha |  |  |
| Statusmeldungen werden angesagt | 4.1.3 | Live-Regionen im Accessibility-Baum, Rolle und `aria-live` |  |  |
| Name, Rolle, Wert korrekt | 4.1.2 | Accessibility-Baum je Bedienelement |  |  |
| Navigation und Bezeichnungen konsistent | 3.2.3, 3.2.4 |  |  |  |

## 6. Festgestellte Barrieren

Jede Barriere mit Schwere, Ursache und Maßnahme. Das ist der Abschnitt, den eine
Behörde zuerst liest.

| Nr. | Seite oder Flow | Barriere | WCAG | Schwere | Ursache | Maßnahme | Status | Frist |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 |  |  |  |  |  |  |  |  |

Schwere: `blockierend` (Aufgabe nicht lösbar), `erschwerend` (lösbar mit
Umwegen), `kosmetisch`. Status: `offen`, `in Arbeit`, `behoben am …`.

## 7. Prüfung mit assistiven Technologien

Diese Tabelle ist der Teil, den automatisierte Werkzeuge nicht ersetzen können.
Wenn sie fehlt, ist die Prüfung unvollständig – das gehört dann in Abschnitt 8.

| Hilfsmittel | Version | Browser | Betriebssystem | Geprüfte Aufgaben | Ergebnis | Bemerkung |
| --- | --- | --- | --- | --- | --- | --- |
| NVDA |  | Firefox / Chrome | Windows | Anmeldung, Checkout, Abo-Verwaltung |  |  |
| JAWS |  | Chrome | Windows |  |  |  |
| VoiceOver |  | Safari | macOS |  |  |  |
| VoiceOver |  | Safari | iOS |  |  |  |
| TalkBack |  | Chrome | Android |  |  |  |
| Nur Tastatur | – |  |  | kompletter Durchlauf |  |  |
| Zoom 400 % | – |  |  |  |  |  |

Aufgaben, die je Durchlauf mindestens zu prüfen sind: Startseite lesen,
Registrierung, Anmeldung mit Zwei-Faktor-Code, Checkout, Abo-Verwaltung,
Support-Anfrage, Fehlermeldung im Formular.

## 8. Grenzen dieser Prüfung

Ehrlich ausfüllen. Ein Protokoll, das Vollständigkeit behauptet, ohne sie zu
haben, ist schlechter als eines mit Lücken.

```
Nicht geprüft:                
Bekannte Einschränkungen:     
Warum nicht geprüft:          
Geplante Nachholung:          
```

## 9. Beispiel für einen ausgefüllten Eintrag

So sieht ein brauchbarer Eintrag aus – Werte sind ein Beispiel, keine Messung
aus diesem Projekt:

| Nr. | Seite oder Flow | Barriere | WCAG | Schwere | Ursache | Maßnahme | Status | Frist |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `/checkout` | Fokusring des Gutschein-Felds bei 320 px Breite nicht sichtbar | 2.4.7 | erschwerend | `overflow: hidden` am Container schneidet den Ring ab | Container auf `overflow: visible` umgestellt, Nachprüfung im selben Lauf | behoben am 12.11.2026 | – |

## 10. Ablage und Aufbewahrung

- [ ] Protokoll im Repository unter `docs/pruefprotokolle/` ablegen, nicht nur
      lokal.
- [ ] Dateiname mit Datum und Umfang, damit die Reihenfolge erkennbar bleibt.
- [ ] Änderungen an der Anwendung, die eine Nachprüfung auslösen, im Protokoll
      oder im Pull Request verlinken.
- [ ] Protokolle nicht nachträglich beschönigen: Korrekturen als neues Protokoll
      mit Verweis auf das alte.
- [ ] Aufbewahrung: solange die Dienstleistung angeboten wird, mindestens aber so
      lange, wie eine Behördenanfrage möglich ist (§ 14 Abs. 2 und Abs. 5 BFSG).

## 11. Was ein Protokoll nachweisfähig macht

Vier Dinge, an denen sich ein Nachweis von einer Behauptung unterscheidet:

1. **Bezug zum Stand:** Commit, Release oder Build plus Datum.
2. **Nachvollziehbarkeit:** Werkzeuge mit Version, Hilfsmittel mit Version,
   Browser und Betriebssystem, Prüfmethode.
3. **Vollständigkeit mit Grenzen:** welche Seiten und Flows, und was ausdrücklich
   nicht geprüft wurde.
4. **Folge:** festgestellte Barrieren mit Maßnahme, Verantwortlichem und Datum
   der Behebung.

Ein axe-Lauf ohne Seitenliste, ein Screenshot ohne Datum und ein „geprüft, alles
gut" ohne Methode erfüllen keinen dieser vier Punkte.
