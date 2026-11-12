# Fällt StreamingHub unter das BFSG?

Entscheidungshilfe für den Betreiber. Stand der Prüfung: 12. November 2026.
Kein Rechtsrat – die rechtliche Bewertung muss eine qualifizierte Person bestätigen.

## Ergebnis

**StreamingHub ist nach den Angaben des Betreibers ein Kleinstunternehmen. Die
Pflichten des BFSG für Dienstleistungen greifen deshalb nicht.**

- Sachlich wäre die Leistung erfasst: Der Abo-Abschluss über Website und App ist
  eine Dienstleistung im elektronischen Geschäftsverkehr nach § 1 Abs. 3 Nr. 5
  BFSG i. V. m. § 2 Nr. 26 BFSG.
- Persönlich greift die Ausnahme: § 3 Abs. 3 Satz 1 BFSG nimmt Kleinstunternehmen
  aus, die Dienstleistungen anbieten oder erbringen. Kleinstunternehmen nach
  § 2 Nr. 17 BFSG ist, wer **weniger als zehn Personen beschäftigt** und
  **entweder höchstens 2 Mio. € Jahresumsatz erzielt oder höchstens 2 Mio. €
  Bilanzsumme** hat. Beide Bedingungen sind nach Betreiberangabe erfüllt.

Die Umsetzung im Projekt bleibt trotzdem bestehen: `/barrierefreiheit` und die
Barrierefreiheitsarbeit an der Website sind jetzt **freiwillig** – sie müssen
nicht zurückgebaut werden und schaden nicht.

## 1. Sachlicher Anwendungsbereich: ja

| Prüfschritt | Ergebnis | Grundlage |
| --- | --- | --- |
| Dienstleistung für Verbraucher? | Ja. Abos werden gegenüber Verbrauchern angeboten und abgeschlossen. | § 1 Abs. 3 BFSG, § 2 Nr. 4 und Nr. 16 BFSG |
| „Dienstleistung im elektronischen Geschäftsverkehr"? | Ja. Der Vertrag kommt über Website bzw. mobile Anwendung elektronisch und auf individuelle Anfrage zustande. | § 1 Abs. 3 Nr. 5 BFSG, § 2 Nr. 26 BFSG |
| Nach dem 28. Juni 2025 erbracht? | Ja, laufender Betrieb. | § 1 Abs. 3 BFSG |

§ 2 Nr. 26 BFSG verlangt „digitale Dienste nach § 1 Absatz 4 Nummer 1 des
Digitale-Dienste-Gesetzes, die über Webseiten und über Anwendungen auf
Mobilgeräten angeboten werden und elektronisch und auf individuelle Anfrage
eines Verbrauchers im Hinblick auf den Abschluss eines Verbrauchervertrags
erbracht werden". Ein Abo-Abschluss über die Website erfüllt das.

Nicht erfasst sind nach § 1 Abs. 4 BFSG unter anderem zeitbasierte Medien, die
vor dem 28. Juni 2025 veröffentlicht wurden, und Dateiformate von
Büro-Anwendungen aus der Zeit davor.

## 2. Persönlicher Anwendungsbereich: Ausnahme greift

§ 3 Abs. 3 Satz 1 BFSG:

> „Absatz 1 gilt nicht für Kleinstunternehmen, die Dienstleistungen anbieten
> oder erbringen."

§ 2 Nr. 17 BFSG:

> „ein Unternehmen, das weniger als zehn Personen beschäftigt und das entweder
> einen Jahresumsatz von höchstens 2 Millionen Euro erzielt oder dessen
> Jahresbilanzsumme sich auf höchstens 2 Millionen Euro beläuft"

### Angaben des Betreibers (Selbstauskunft, 12.11.2026)

| Angabe | Wert | Bedingung |
| --- | --- | --- |
| Beschäftigte (Vollzeitäquivalente) | unter 10 | erfüllt |
| Jahresumsatz oder Bilanzsumme | höchstens 2 Mio. € | erfüllt |

Beide Bedingungen müssen **zusammen** erfüllt sein – das ist hier der Fall.

Einordnung der vorhandenen Datenlage: `OPERATOR_SMALL_BUSINESS` in
`src/lib/env.ts` steuert die **umsatzsteuerliche** Kleinunternehmerregelung nach
§ 19 UStG (25.000 € / 100.000 €). Das ist **kein** Nachweis für die
BFSG-Schwelle von 2 Mio. €, passt aber zum Bild eines kleinen Betriebs. Die
BFSG-Einordnung stützt sich auf die Angaben des Betreibers, nicht auf dieses
Flag.

## 3. Was daraus folgt

### Gilt nicht (wegen der Ausnahme)

- Pflicht zur barrierefreien Gestaltung der Dienstleistung nach § 3 Abs. 1 BFSG.
- Informationspflicht nach § 14 Abs. 1 Nr. 2 BFSG mit den Pflichtangaben der
  Anlage 3 Nr. 1 BFSG.

### Gilt weiterhin

- **Produkte:** Die Ausnahme gilt nicht für Wirtschaftsakteure, die Produkte in
  den Verkehr bringen. StreamingHub vertreibt derzeit keine Hardware. Das ändert
  sich, sobald gebrandete Geräte oder Zubehör dazukommen – dann ist die
  Einordnung neu zu prüfen.
- **Wettbewerbsrecht:** Die IHK weist darauf hin, dass Mitbewerber wegen
  fehlender Barrierefreiheit abmahnen können. Barrierefreiheit bleibt also
  wirtschaftlich sinnvoll, auch ohne BFSG-Pflicht.
- **Allgemeine Diskriminierungsverbote** und die DSGVO bleiben unberührt.

### Formale Feinheit, die eine Fachperson prüfen sollte

§ 3 Abs. 3 Satz 1 nimmt formal nur Absatz 1 (Barrierefreiheit) aus. Ob daraus
folgt, dass auch die Informationspflicht nach § 14 BFSG entfällt, steht nicht
ausdrücklich im Gesetz; die FAQ der Bundesfachstelle Barrierefreiheit geht von
einer vollständigen Ausnahme aus. Für StreamingHub ist das praktisch ohne
Risiko: Die Informationen nach Anlage 3 sind freiwillig vorhanden. Sollte die
Rechtsprüfung zu einem anderen Ergebnis kommen, ist nichts nachzuholen.

## 4. Was im Projekt umgesetzt ist (freiwillig)

- `/barrierefreiheit` mit Beschreibung der Dienstleistung, Maßnahmen, bekannten
  Lücken, Kontakt und Marktüberwachungsbehörde, verlinkt in Footer,
  Rechts-Navigation und Sitemap. Die Seite benennt die Kleinstunternehmen-
  Ausnahme ausdrücklich, damit sie keine Pflicht suggeriert.
- Barrierefreiheitsarbeit an der Website: Kontraste, Tastaturbedienung,
  Fokusführung, Live-Regionen, Reflow bis 320 px, Zielgrößen, reduzierte
  Bewegung, erzwungener Kontrastmodus.
- Sprachauszeichnung für teilübersetzte Sprachen.

## 5. Entschieden

```
Beschäftigte (Vollzeitäquivalente): unter 10
Jahresumsatz / Bilanzsumme:        höchstens 2 Mio. EUR

Ergebnis:  [x] Kleinstunternehmen nach § 2 Nr. 17 BFSG
           [ ] kein Kleinstunternehmen

Begründung / Quelle der Zahlen: Selbstauskunft des Betreibers
Entschieden am: 12.11.2026
Rechtsprüfung durch: offen
```

## 6. Wann die Prüfung wiederholt werden muss

Automatische Erinnerung: `npm run bfsg:review` prüft das Datum im
Entscheidungsblock und schlägt nach 365 Tagen an. Dieselbe Prüfung läuft
jährlich am 1. Februar als GitHub-Workflow `.github/workflows/bfsg-review.yml`
und legt dann ein Issue mit Checkliste an. Der Workflow kann auch von Hand
unter „Actions → BFSG review → Run workflow“ gestartet werden.

Einschränkung, die man kennen muss: GitHub pausiert geplante Workflows nach 60
Tagen ohne Repository-Aktivität. Das Issue kommt dann nicht – die Prüfung ist
also eine Erinnerung, keine Garantie. Bei einem ruhigen Repository lieber
zusätzlich einen eigenen Kalendertermin am Jahresanfang setzen.

- Jedes Jahr zum Jahresabschluss, wenn Beschäftigtenzahl und Umsatz feststehen.
- Sofort, wenn **10 oder mehr Personen** beschäftigt werden oder Umsatz bzw.
  Bilanzsumme **2 Mio. € überschreiten**. Dann greifen die BFSG-Pflichten, und
  die freiwilligen Maßnahmen werden zur Pflicht – die Website erfüllt den
  Großteil davon bereits.
- Wenn Hardware oder gebrandete Geräte in den Verkehr gebracht werden (dann
  Produktpflichten, unabhängig von der Größe).
- Wenn die Seite `/barrierefreiheit` geändert wird: Der Satz zur
  Kleinstunternehmen-Ausnahme muss zur jeweils aktuellen Einordnung passen.

## 7. Quellen

Alle am 12. November 2026 abgerufen.

- § 1 BFSG (Anwendungsbereich): https://www.gesetze-im-internet.de/bfsg/__1.html
- § 2 BFSG (Begriffsbestimmungen, Nr. 17 und Nr. 26): https://www.gesetze-im-internet.de/bfsg/__2.html
- § 3 BFSG (Barrierefreiheit, Kleinstunternehmen-Ausnahme): https://www.gesetze-im-internet.de/bfsg/__3.html
- § 28 BFSG (Marktüberwachung von Dienstleistungen): https://www.gesetze-im-internet.de/bfsg/__28.html
- § 38 BFSG (Übergangsbestimmungen): https://www.gesetze-im-internet.de/bfsg/__38.html
- Bundesfachstelle Barrierefreiheit, FAQ zum BFSG (Kleinstunternehmen): https://www.bundesfachstelle-barrierefreiheit.de/DE/Barrierefreiheitsstaerkungsgesetz/FAQ/faq_node
- Bundesfachstelle Barrierefreiheit, FAQ „Informationen zur Barrierefreiheit (Dienstleistungen)": https://www.bundesfachstelle-barrierefreiheit.de/DE/Fachwissen/Produkte-und-Dienstleistungen/Barrierefreiheitsstaerkungsgesetz/FAQ-Dienstleistungen/faq-dienstleistungen_node
- BMAS, Leitlinien für Barrierefreiheit (PDF): https://www.bmas.de/SharedDocs/Downloads/DE/Teilhabe/leitlinien-barrierefreiheit.pdf
- MLBF AöR, Kontakt: https://www.mlbf-barrierefrei.de/Über-Uns/Kontakt/
- IHK Schwerin, Barrierefreiheit ab Juni 2025 (Abmahnrisiko): https://www.ihk.de/schwerin/recht/aktuelles/barrierefreiheit-ab-juni-2025-fuer-unternehmen-pflicht-6005058
