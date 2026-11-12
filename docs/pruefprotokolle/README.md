# Prüfprotokolle

Ein Protokoll je Prüflauf, angelegt nach
[../PRUEFPROTOKOLL-VORLAGE.md](../PRUEFPROTOKOLL-VORLAGE.md).

Dateiname: `pruefprotokoll-JJJJ-MM-TT-<umfang>.md`, zum Beispiel
`pruefprotokoll-2026-11-12-oeffentliche-seiten.md`.

Protokolle werden nicht überschrieben und nicht nachträglich beschönigt. Eine
Korrektur ist ein neues Protokoll mit Verweis auf das vorherige.

## Vorhandene Protokolle

| Datum | Umfang | Ergebnis |
| --- | --- | --- |
| 12.11.2026 | [Öffentliche Seiten](pruefprotokoll-2026-11-12-oeffentliche-seiten.md), 16 Seiten | keine axe-Verstöße gegen WCAG 2.2 A/AA, 2 Best-Practice-Hinweise, 1 Barriere beim Reflow auf `/docs/api` |
| 12.11.2026 | [Reflow `/docs/api` behoben](pruefprotokoll-2026-11-12-docs-api-reflow.md), 1 Seite, 4 Breiten | Barriere 1 behoben: Seite bleibt bei 320 px bei 305 px, Tabelle scrollt im eigenen Bereich, axe 0 Verstöße |
| 12.11.2026 | [Angemeldeter Bereich und Checkout](pruefprotokoll-2026-11-12-angemeldeter-bereich.md), 4 Dashboard-Seiten + Checkout-Fehlerpfad | axe 0 Verstöße, Reflow sauber; 3 Barrieren im Checkout gefunden, später behoben (Nachtrag im Protokoll) |
| 12.11.2026 | [Checkout-Erfolgsfall](pruefprotokoll-2026-11-12-checkout-erfolgsfall.md), 35 Funktionschecks + 3 UI-Zustände | Erfolgs- und Abbruchpfad funktional bestätigt (Stripe-API-Stub); Erfolgsmeldung mit `role="status"` und Fokus; axe 0 Verstöße; echter Stripe-Testmodus offen, weil keine Testschlüssel vorliegen |
