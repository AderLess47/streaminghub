# BFSG-Pflichten-Checkliste

Was konkret zu tun ist, wenn StreamingHub die Kleinstunternehmen-Schwelle
überschreitet. Ergänzung zu [BFSG-ANWENDUNGSBEREICH.md](BFSG-ANWENDUNGSBEREICH.md),
das die Einordnung und ihre Grundlage festhält.

Stand: 12. November 2026. Kein Rechtsrat – die Bewertung muss eine qualifizierte
Person bestätigen.

## 0. Wann diese Checkliste greift

- **10 oder mehr Beschäftigte** (Vollzeitäquivalente) oder **mehr als 2 Mio. €**
  Jahresumsatz bzw. Bilanzsumme. Dann entfällt die Ausnahme nach § 3 Abs. 3
  Satz 1 BFSG, und die Pflichten greifen vollständig.
- **Hardware oder gebrandete Geräte** werden in den Verkehr gebracht. Dann
  gelten die Produktpflichten unabhängig von der Betriebsgröße (CE-Kennzeichnung,
  Konformitätsbewertung nach Anlage 2 BFSG, technische Dokumentation).
- Ein **Dritter** (Plattform, Partner, Investor) verlangt einen Nachweis der
  BFSG-Konformität. Das ist keine gesetzliche Pflicht, löst aber dieselbe Arbeit aus.

Die Schwellenprüfung selbst läuft automatisch: `npm run bfsg:review` und der
Workflow `.github/workflows/bfsg-review.yml`.

## 1. Tag 1: Einordnung umstellen

- [ ] Beschäftigtenzahl (Vollzeitäquivalente) und Jahresumsatz **oder**
      Jahresbilanzsumme des letzten Geschäftsjahres schriftlich festhalten.
- [ ] In `docs/BFSG-ANWENDUNGSBEREICH.md` Abschnitt 5 umstellen:
      `[ ] Kleinstunternehmen` → `[x] kein Kleinstunternehmen`, Zahlen und Datum
      eintragen, Quelle nennen.
- [ ] Den Satz zur Ausnahme auf `/barrierefreiheit` entfernen: in
      `src/content/accessibility.ts` die Formulierung „StreamingHub ist ein
      Kleinstunternehmen und nach § 3 Absatz 3 BFSG von der Pflicht zur
      barrierefreien Leistungserbringung ausgenommen; diese Informationen stellen
      wir freiwillig bereit." bzw. die englische Entsprechung ersetzen. Ab hier
      sind die Informationen **Pflicht** nach § 14 Abs. 1 Nr. 2 BFSG.
- [ ] Eine verantwortliche Person benennen, die Änderungen an der Dienstleistung
      auf ihre Wirkung für die Barrierefreiheit prüft.
- [ ] Rechtsprüfung beauftragen (offener Punkt aus dem Anwendungsbereich-Dokument).
- [ ] Die selbst gesetzte Frist notieren: Die Pflichten gelten ab dem Zeitpunkt,
      ab dem die Schwelle überschritten ist – nicht erst ab dem nächsten
      Geschäftsjahr.

## 2. Pflicht 1: Die Dienstleistung muss barrierefrei sein

Rechtsgrundlage: § 3 Abs. 1 BFSG („ohne besondere Erschwernis und grundsätzlich
ohne fremde Hilfe auffindbar, zugänglich und nutzbar"), § 14 Abs. 1 Nr. 1 und
Abs. 3 BFSG (dauerhaft, auch bei Änderungen), konkretisiert durch die BFSGV,
insbesondere § 12 (allgemeine Anforderungen an Dienstleistungen) und § 19
(zusätzliche Anforderungen an Dienstleistungen im elektronischen
Geschäftsverkehr). Praktischer Maßstab: EN 301 549 mit WCAG 2.2 Stufe AA.

### 2.1 Informationsbereitstellung (BFSGV § 12 Nr. 2)

- [ ] Informationen über die Funktionsweise der Dienstleistung werden über
      **mehr als einen sensorischen Kanal** bereitgestellt (Text plus
      zugängliche Alternative, nicht nur Bild oder nur Video).
- [ ] Diese Informationen sind auffindbar, verständlich und in einer Form, die
      Verbraucher wahrnehmen können.
- [ ] Der Inhalt liegt in **Textformaten** vor, aus denen sich alternative
      assistive Formate erzeugen lassen (kein PDF-Scan, kein Text im Bild).
- [ ] Schriftgröße, Schriftform, Kontrast und Abstände sind angemessen.
- [ ] Für nicht-textliche Inhalte gibt es eine **alternative Darstellung**.
- [ ] Digitale Informationen, die für die Erbringung nötig sind, sind
      wahrnehmbar, bedienbar, verständlich und robust gestaltet.

### 2.2 Elektronischer Geschäftsverkehr (BFSGV § 19)

Betrifft genau die Flows, die StreamingHub anbietet: Registrierung, Anmeldung,
Zwei-Faktor-Code, Checkout, Abo-Verwaltung, Geräteaktivierung.

- [ ] **Identifizierung** (Registrierung, Anmeldung) ist wahrnehmbar, bedienbar,
      verständlich und robust – auch mit Screenreader und ohne Maus.
- [ ] **Authentifizierung** einschließlich Zwei-Faktor-Code funktioniert mit
      Hilfsmitteln; der Code ist ohne Zeitdruck eingebbar, und es gibt einen
      alternativen Weg, wenn ein Kanal nicht nutzbar ist.
- [ ] **Sicherheitsfunktionen** (Captcha, Rate-Limits, Fehlermeldungen) sind
      zugänglich und haben eine barrierefreie Alternative.
- [ ] **Zahlungsfunktionen** sind ohne fremde Hilfe bedienbar – inklusive der
      Seite des Zahlungsdienstleisters, soweit sie in den Ablauf eingebunden ist.

### 2.3 Unterstützungsdienste (BFSGV § 12 Nr. 3)

- [ ] Support, Help-Desk und Kontaktwege sind barrierefrei erreichbar und geben
      Auskunft über Barrierefreiheit und Kompatibilität mit assistiven
      Technologien – über barrierefreie Kommunikationsmittel.
- [ ] Auf Anfrage werden Informationen mündlich oder in einer anderen
      wahrnehmbaren Form erläutert (steht bereits auf `/barrierefreiheit`).

### 2.4 Nachweis der Barrierefreiheit

- [ ] Prüfung mit echten Hilfsmitteln: NVDA und JAWS unter Windows, VoiceOver
      unter macOS und iOS, TalkBack unter Android, Tastatur ohne Maus,
      Zoom bis 400 %, erzwungener Kontrastmodus.
- [ ] Prüfung mit betroffenen Nutzerinnen und Nutzern.
- [ ] Automatisierte Prüfung (axe-core) auf allen Seiten, auch im angemeldeten
      Bereich und im Adminbereich, mit festgehaltenem Ergebnis.
- [ ] App für Fire TV und Android: eigene Prüfung, da sie Teil der
      Dienstleistung ist.
- [ ] Untertitel und Audiodeskription für Videoinhalte, soweit solche angeboten
      werden.
- [ ] Für jeden Prüflauf ein Protokoll nach
      [PRUEFPROTOKOLL-VORLAGE.md](PRUEFPROTOKOLL-VORLAGE.md) anlegen und ablegen.

## 3. Pflicht 2: Informationen zur Barrierefreiheit

Rechtsgrundlage: § 14 Abs. 1 Nr. 2 BFSG in Verbindung mit Anlage 3 Nr. 1 BFSG.
Die Informationen sind zu **erstellen** und der **Allgemeinheit in barrierefreier
Form zugänglich zu machen** – ohne Aufforderung, dauerhaft. Aufbewahrung nach
§ 14 Abs. 2 BFSG, solange die Dienstleistung angeboten wird.

Anlage 3 Nr. 1 verlangt die Angabe in den AGB **oder auf andere deutlich
wahrnehmbare Weise**, mit mindestens diesen Elementen:

| Element | Inhalt | Stand im Projekt |
| --- | --- | --- |
| a) | Allgemeine Beschreibung der Dienstleistung in einem barrierefreien Format | vorhanden, Abschnitt 1 auf `/barrierefreiheit` |
| b) | Beschreibungen und Erläuterungen, die zum Verständnis der Durchführung nötig sind | vorhanden, Abschnitte 1 und 3 |
| c) | Beschreibung, wie die Dienstleistung die Anforderungen der BFSGV erfüllt | vorhanden, Abschnitt 2 – muss die noch offenen Lücken ehrlich benennen |
| d) | Angabe der zuständigen Marktüberwachungsbehörde | vorhanden, Abschnitt 6 |

Zusätzlich zu prüfen:

- [ ] Die Informationen erfüllen auch die Verbraucherinformation nach
      Artikel 246 EGBGB, soweit anwendbar.
- [ ] Die Informationen selbst sind barrierefrei zugänglich (BFSGV): Textformat,
      Screenreader-tauglich, ohne fremde Hilfe erreichbar, in beiden Sprachen.
- [ ] Der Link steht an einer Stelle, die ohne Umwege gefunden wird – derzeit
      Footer, Rechts-Navigation und Sitemap jeder Seite.
- [ ] Der Satz zur Kleinstunternehmen-Ausnahme ist entfernt (siehe Tag 1).
- [ ] „Bekannte Lücken" ist aktuell: Was noch nicht geprüft ist, darf nicht als
      konform dargestellt werden.
- [ ] Die Seite nennt Datum und Fassung der letzten Prüfung.

## 4. Pflicht 3: Laufende Konformität und Korrektur

- [ ] **Dauerhaftigkeit** (§ 14 Abs. 3 BFSG): Änderungen an der Dienstleistung,
      an den Anforderungen und an den angewandten Normen werden daraufhin
      geprüft, ob die Barrierefreiheit erhalten bleibt. Das gehört in den
      Änderungsprozess, nicht in ein Jahresprojekt.
- [ ] **Korrekturmaßnahmen** (§ 14 Abs. 4 Satz 1 BFSG): Bei festgestellter
      Nichtkonformität wird unverzüglich nachgebessert.
- [ ] **Meldung an die Marktüberwachung** (§ 14 Abs. 4 Satz 2 BFSG): Wenn die
      Dienstleistung den Anforderungen nicht genügt, werden die zuständige
      Behörde und die Behörden der anderen EU-Mitgliedstaaten, in denen die
      Dienstleistung angeboten wird, unverzüglich informiert – mit Art der
      Nichtkonformität und ergriffenen Maßnahmen.
- [ ] **Auskunftspflicht** (§ 14 Abs. 5 BFSG): Auf begründetes Verlangen der
      Behörde werden Nachweise vorgelegt und Maßnahmen unterstützt.

## 5. Aufsicht und Sanktionen

- Zuständig für die Überwachung von Dienstleistungen ist nach § 28 BFSG die
  Marktüberwachungsstelle der Länder für die Barrierefreiheit von Produkten und
  Dienstleistungen (MLBF AöR).
- Verbraucherinnen und Verbraucher können dort Barrieren melden und einen Antrag
  nach § 32 Abs. 1 BFSG stellen. Für Streitigkeiten aus dem BFSG ist die
  Schlichtungsstelle nach § 16 BGG zuständig.
- **Bußgeld:** Wer entgegen § 14 Abs. 1 BFSG eine Dienstleistung anbietet oder
  erbringt, handelt nach § 37 Abs. 1 Nr. 8 BFSG ordnungswidrig; nach § 37 Abs. 2
  BFSG bis zu **100.000 €**. Vorsatz und Fahrlässigkeit genügen.

## 6. Unterlagen, die vorzuhalten sind

Damit eine Behördenanfrage nicht zum Projekt wird, sammelt man laufend:

- [ ] Die Einordnung mit Zahlen und Datum (`docs/BFSG-ANWENDUNGSBEREICH.md`).
- [ ] Die Informationen zur Barrierefreiheit mit Fassungsdatum, auch ältere
      Fassungen (Aufbewahrungspflicht nach § 14 Abs. 2 BFSG).
- [ ] Prüfprotokolle: axe-Berichte, Kontrastmessungen, Tastatur- und
      Reflow-Prüfungen, Datum und Umfang jeweils – Form und Pflichtfelder nach
      [PRUEFPROTOKOLL-VORLAGE.md](PRUEFPROTOKOLL-VORLAGE.md).
- [ ] Protokolle der Prüfungen mit assistiven Technologien.
- [ ] Liste der bekannten Lücken mit Stand und geplanter Behebung.
- [ ] Nachweise über Korrekturmaßnahmen und, falls es dazu kommt, die Meldung an
      die Marktüberwachung.

## 7. Reihenfolge, wenn es akut wird

1. Abschnitt 1 (Tag 1) vollständig – besonders der Satz auf `/barrierefreiheit`,
   weil er aktiv etwas Falsches behaupten würde.
2. Abschnitt 2.2: Registrierung, Anmeldung und Checkout mit echten Hilfsmitteln
   prüfen. Dort entstehen Verträge, dort ist das Risiko am größten.
3. Abschnitt 3: Informationen zur Barrierefreiheit gegen die Tabelle prüfen und
   die Lücken ehrlich ergänzen.
4. Abschnitt 2.4: vollständige Prüfung inklusive App und betroffener Nutzer.
5. Abschnitt 4: Barrierefreiheit in den Änderungsprozess aufnehmen.

## 8. Was bereits steht (Stand 12.11.2026)

Die Website ist kein Neubaufall. Aus der bisherigen Arbeit vorhanden:

| Anforderung | Stand |
| --- | --- |
| Textkontraste ≥ 4,5:1 (groß 3:1) | umgesetzt, gemessen |
| Tastaturbedienung mit sichtbarem Fokus | umgesetzt und geprüft |
| Fokusführung nach Fehlern und nach dem Speichern | umgesetzt und geprüft |
| Formularfehler mit Feldbezug und Fokus auf das erste Fehlerfeld | umgesetzt und geprüft |
| Live-Regionen für Rückmeldungen, dauerhaft vorhanden | umgesetzt und geprüft |
| Reflow ohne horizontales Scrollen bis 320 px | umgesetzt und geprüft |
| Zielgrößen ≥ 24 × 24 px (Hauptbedienelemente 44 px) | umgesetzt und geprüft |
| Reduzierte Bewegung, inklusive Animationsverzögerungen | umgesetzt und geprüft |
| Erzwungener Kontrastmodus | umgesetzt |
| Semantik, Landmarken, Überschriftenhierarchie, Sprachauszeichnung | umgesetzt und geprüft |
| axe-core ohne Verstöße auf 14 Seiten | geprüft |
| Informationen zur Barrierefreiheit nach Anlage 3 Nr. 1 | vorhanden, deutsch und englisch |

## 9. Offene Lücken

Diese Punkte sind **nicht** erledigt und müssen vor einer Konformitätsaussage
angegangen werden:

- Kein Test mit echten Screenreadern (NVDA, JAWS, VoiceOver, TalkBack) und
  keiner mit betroffenen Nutzerinnen und Nutzern.
- App für Fire TV und Android nicht systematisch geprüft; sie ist Teil der
  Dienstleistung.
- Produktions-Flows mit echten Konten (Checkout, Abo-Kündigung, Amazon-Käufe)
  nicht durchgetestet; der angemeldete Bereich wurde auf einem Testsystem
  geprüft.
- Keine geprüften Untertitel und keine Audiodeskription in Player-Oberflächen.
- Sechs Sprachen nur teilweise übersetzt; nicht übersetzte Inhalte erscheinen
  auf Englisch.
- Rechtsprüfung durch eine qualifizierte Person steht aus.

## 10. Quellen

Alle am 12. November 2026 abgerufen.

- § 3 BFSG (Barrierefreiheit, Verordnungsermächtigung, Kleinstunternehmen):
  https://www.gesetze-im-internet.de/bfsg/__3.html
- § 14 BFSG (Pflichten des Dienstleistungserbringers):
  https://www.gesetze-im-internet.de/bfsg/__14.html
- § 28 BFSG (Marktüberwachung von Dienstleistungen):
  https://www.gesetze-im-internet.de/bfsg/__28.html
- § 37 BFSG (Bußgeldvorschriften):
  https://www.gesetze-im-internet.de/bfsg/__37.html
- Anlage 3 BFSG (Informationen über Dienstleistungen):
  https://www.gesetze-im-internet.de/bfsg/anlage_3.html
- Anlage 2 BFSG (Konformitätsbewertung für Produkte):
  https://www.gesetze-im-internet.de/bfsg/anlage_2.html
- BFSGV, insbesondere §§ 12 und 19 (Anforderungen an Dienstleistungen):
  https://www.gesetze-im-internet.de/bfsgv/BJNR092800022.html
- MLBF AöR (Marktüberwachung, Kontakt): https://www.mlbf-barrierefrei.de/
