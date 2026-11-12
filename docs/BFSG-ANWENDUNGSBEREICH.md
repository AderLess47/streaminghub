# Fällt StreamingHub unter das BFSG?

Entscheidungshilfe für den Betreiber. Stand: 12. November 2026.
Kein Rechtsrat – die rechtliche Bewertung muss eine qualifizierte Person bestätigen.

## Kurzfassung

Die Website mit Abo-Abschluss ist eine **Dienstleistung im elektronischen
Geschäftsverkehr** und damit grundsätzlich im sachlichen Anwendungsbereich des
BFSG. Ob die Pflichten tatsächlich greifen, hängt an **einer** Frage: Ist der
Betreiber ein **Kleinstunternehmen**? Dafür fehlen im Projekt zwei Zahlen
(Beschäftigte, Jahresumsatz oder Bilanzsumme). Bis sie vorliegen, ist die
Entscheidung **offen**.

Umsetzung im Projekt ist davon unabhängig bereits erfolgt: Die Seite
`/barrierefreiheit` existiert, die Barrierefreiheitsarbeit an der Website ist
gemacht. Beides ist bei „Anwendungsbereich bejaht" Pflicht und bei
„Kleinstunternehmen" freiwillig – es muss also nichts zurückgebaut werden.

## 1. Sachlicher Anwendungsbereich: ja, mit hoher Wahrscheinlichkeit

| Prüfschritt | Ergebnis | Grundlage |
| --- | --- | --- |
| Handelt es sich um eine Dienstleistung für Verbraucher? | Ja. Abos werden gegenüber Verbrauchern angeboten und abgeschlossen. | § 1 Abs. 3 BFSG, § 2 Nr. 4 und Nr. 16 BFSG |
| Ist es eine „Dienstleistung im elektronischen Geschäftsverkehr"? | Ja. Der Vertrag kommt über die Website bzw. die mobile Anwendung elektronisch und auf individuelle Anfrage zustande. | § 1 Abs. 3 Nr. 5 BFSG, § 2 Nr. 26 BFSG |
| Wird die Dienstleistung nach dem 28. Juni 2025 erbracht? | Ja, laufender Betrieb. | § 1 Abs. 3 BFSG |

§ 2 Nr. 26 BFSG verweist auf „digitale Dienste nach § 1 Absatz 4 Nummer 1 des
Digitale-Dienste-Gesetzes, die über Webseiten und über Anwendungen auf
Mobilgeräten angeboten werden und elektronisch und auf individuelle Anfrage
eines Verbrauchers im Hinblick auf den Abschluss eines Verbrauchervertrags
erbracht werden". Ein Abo-Abschluss über die Website erfüllt das.

**Nicht erfasst** sind nach § 1 Abs. 4 BFSG unter anderem zeitbasierte Medien,
die vor dem 28. Juni 2025 veröffentlicht wurden, und Dateiformate von
Büro-Anwendungen aus der Zeit davor.

## 2. Persönlicher Anwendungsbereich: hier liegt die offene Frage

§ 3 Abs. 3 Satz 1 BFSG:

> „Absatz 1 gilt nicht für Kleinstunternehmen, die Dienstleistungen anbieten
> oder erbringen."

Kleinstunternehmen nach § 2 Nr. 17 BFSG:

> „ein Unternehmen, das weniger als zehn Personen beschäftigt und das entweder
> einen Jahresumsatz von höchstens 2 Millionen Euro erzielt oder dessen
> Jahresbilanzsumme sich auf höchstens 2 Millionen Euro beläuft"

Beide Bedingungen müssen zusammen erfüllt sein: **unter 10 Beschäftigte** und
**höchstens 2 Mio. € Umsatz oder Bilanzsumme**.

### Was im Projekt dazu bekannt ist

| Angabe | Stand |
| --- | --- |
| Beschäftigtenzahl | **unbekannt** – nicht im Repository hinterlegt |
| Jahresumsatz | **unbekannt** |
| Jahresbilanzsumme | **unbekannt** |
| Betreiberdaten (Firma, Adresse, Vertretung) | nur Platzhalter, siehe `src/lib/env.ts` (`OPERATOR_*`) |
| Hinweis auf Größenordnung | `OPERATOR_SMALL_BUSINESS` steuert die **umsatzsteuerliche** Kleinunternehmerregelung nach § 19 UStG (Grenzen 25.000 € / 100.000 €). Das ist **kein** Nachweis für die BFSG-Schwelle von 2 Mio. €, deutet aber auf einen kleinen Betrieb hin. |

### Zu klären, bevor entschieden wird

1. Wie viele Personen beschäftigt der Betreiber? Maßgeblich ist die Zahl nach
   der EU-Kleinstunternehmensdefinition (Vollzeitäquivalente, Teilzeit
   anteilig).
2. Wie hoch sind Jahresumsatz **oder** Jahresbilanzsumme des letzten
   abgeschlossenen Geschäftsjahres?

## 3. Zwei mögliche Ergebnisse

### A) Kleinstunternehmen (unter 10 Beschäftigte und ≤ 2 Mio. €)

- Die Pflicht zur barrierefreien Gestaltung der **Dienstleistung** entfällt
  (§ 3 Abs. 3 Satz 1 BFSG). Die Bundesfachstelle Barrierefreiheit formuliert
  das so: Kleinstunternehmen, die Dienstleistungen anbieten, sind vom BFSG
  ausgenommen.
- Die Ausnahme gilt **nicht** für Produkte: Wer Produkte in den Verkehr
  bringt, bleibt in der Pflicht. StreamingHub vertreibt nach heutigem Stand
  keine Hardware, sondern eine Dienstleistung samt App – das ist zu
  bestätigen, sobald Hardware oder gebrandete Geräte dazukommen.
- **Rechtliche Feinheit, die eine Fachperson prüfen sollte:** § 3 Abs. 3 Satz 1
  nimmt formal nur Absatz 1 (Barrierefreiheit) aus. Ob daraus folgt, dass auch
  die Informationspflicht nach § 14 Abs. 1 Nr. 2 BFSG entfällt, ist nicht
  ausdrücklich geregelt. Die Aufsichtspraxis der Bundesfachstelle geht von
  einem vollständigen Ausnehmen aus.
- Unabhängig davon gilt Wettbewerbsrecht: Die IHK weist darauf hin, dass
  Mitbewerber wegen fehlender Barrierefreiheit abmahnen können. Freiwillige
  Barrierefreiheit bleibt also wirtschaftlich sinnvoll.

### B) Kein Kleinstunternehmen (10 oder mehr Beschäftigte oder über 2 Mio. €)

- Seit dem 28. Juni 2025 gilt: Die Dienstleistung muss barrierefrei sein
  (§ 3 Abs. 1 BFSG, konkretisiert durch die BFSGV).
- Pflichtangaben nach § 14 Abs. 1 Nr. 2 BFSG in Verbindung mit Anlage 3 Nr. 1
  BFSG müssen barrierefrei zugänglich sein, einschließlich der Angabe der
  zuständigen Marktüberwachungsbehörde. Das ist mit `/barrierefreiheit`
  umgesetzt.
- Zuständige Behörde ist die Marktüberwachungsstelle der Länder für die
  Barrierefreiheit von Produkten und Dienstleistungen (MLBF AöR),
  Carl-Miller-Straße 6, 39112 Magdeburg, kontakt@mlbf-barrierefrei.de.
  Sie überwacht nach §§ 28 ff. BFSG und kann Maßnahmen bis hin zu
  Bußgeldern nach § 37 BFSG ergreifen.
- Übergangsregelungen nach § 38 BFSG betreffen Produkte, die schon vor dem
  28. Juni 2025 eingesetzt wurden (bis 27. Juni 2030), und Altverträge. Sie
  sind **keine** allgemeine Fristverlängerung für die Dienstleistung selbst.

## 4. Was im Projekt bereits umgesetzt ist

Unabhängig vom Ausgang erledigt und deployed:

- `/barrierefreiheit` mit Beschreibung der Dienstleistung, Maßnahmen,
  bekannten Lücken, Kontakt und Marktüberwachungsbehörde, verlinkt in Footer,
  Rechts-Navigation und Sitemap.
- Barrierefreiheitsarbeit an der Website: Kontraste, Tastaturbedienung,
  Fokusführung, Live-Regionen, Reflow bis 320 px, Zielgrößen, reduzierte
  Bewegung, erzwungener Kontrastmodus.
- Sprachauszeichnung für teilübersetzte Sprachen.

## 5. Entscheidung (vom Betreiber auszufüllen)

```
Beschäftigte (Vollzeitäquivalente): ______________________
Jahresumsatz letztes Geschäftsjahr: ______________________ EUR
oder Jahresbilanzsumme:            ______________________ EUR

Ergebnis:  [ ] Kleinstunternehmen nach § 2 Nr. 17 BFSG
           [ ] kein Kleinstunternehmen

Begründung / Quelle der Zahlen: ______________________________________

Entschieden am: ____________  von: ______________________
Rechtsprüfung durch: ______________________ (offen)
```

## 6. Quellen

Alle am 12. November 2026 abgerufen.

- § 1 BFSG (Anwendungsbereich): https://www.gesetze-im-internet.de/bfsg/__1.html
- § 2 BFSG (Begriffsbestimmungen, Nr. 17 und Nr. 26): https://www.gesetze-im-internet.de/bfsg/__2.html
- § 3 BFSG (Barrierefreiheit, Kleinstunternehmen-Ausnahme): https://www.gesetze-im-internet.de/bfsg/__3.html
- § 28 BFSG (Marktüberwachung von Dienstleistungen): https://www.gesetze-im-internet.de/bfsg/__28.html
- § 38 BFSG (Übergangsbestimmungen): https://www.gesetze-im-internet.de/bfsg/__38.html
- Bundesfachstelle Barrierefreiheit, FAQ zum BFSG (Kleinstunternehmen, Dienstleistungen): https://www.bundesfachstelle-barrierefreiheit.de/DE/Barrierefreiheitsstaerkungsgesetz/FAQ/faq_node
- Bundesfachstelle Barrierefreiheit, FAQ „Informationen zur Barrierefreiheit (Dienstleistungen)": https://www.bundesfachstelle-barrierefreiheit.de/DE/Fachwissen/Produkte-und-Dienstleistungen/Barrierefreiheitsstaerkungsgesetz/FAQ-Dienstleistungen/faq-dienstleistungen_node
- BMAS, Leitlinien für Barrierefreiheit (PDF): https://www.bmas.de/SharedDocs/Downloads/DE/Teilhabe/leitlinien-barrierefreiheit.pdf
- MLBF AöR, Kontakt: https://www.mlbf-barrierefrei.de/Über-Uns/Kontakt/
- IHK Schwerin, Barrierefreiheit ab Juni 2025 (Abmahnrisiko): https://www.ihk.de/schwerin/recht/aktuelles/barrierefreiheit-ab-juni-2025-fuer-unternehmen-pflicht-6005058
