# Prüfprotokoll: Checkout-Erfolgsfall

Angelegt nach [../PRUEFPROTOKOLL-VORLAGE.md](../PRUEFPROTOKOLL-VORLAGE.md).
Schließt die Lücke aus
[pruefprotokoll-2026-11-12-angemeldeter-bereich.md](pruefprotokoll-2026-11-12-angemeldeter-bereich.md),
das nur den Fehlerpfad abdecken konnte.

## 1. Kopf

```
Prüfgegenstand:        Web-Checkout, Erfolgs- und Abbruchpfad, Abo-Zustand danach
Umfang (Seiten/Flows): Serverseitiger Ablauf über den Stripe-API-Stub des Repos
                       (35 Prüfpunkte) und die drei UI-Zustände
                       ?checkout=success, ?checkout=canceled, aktives Abo
Nicht geprüft:         echter Stripe-Testmodus (keine sk_test_-Schlüssel
                       vorhanden), Produktion (dort sind Live-Schlüssel
                       konfiguriert und wurden bewusst nicht benutzt),
                       Zahlung mit echter Karte, Stripe-Checkout-Oberfläche,
                       Hilfsmittel mit echten Screenreadern

Datum:                 12.11.2026
Prüfende Person:       Codebuff (Agent), im Auftrag des Betreibers
Rolle:                 technische Prüfung, keine juristische Bewertung

Stand der Anwendung:   Commit 030f120, App-Code identisch mit dem deployten Stand
Umgebung:              [x] Dev-Server mit Stripe-API-Stub  [ ] Produktion
Datenbasis:            [x] Testkonto, nach der Prüfung gelöscht

Maßstab:               EN 301 549 / WCAG 2.2 Stufe AA für die UI-Zustände;
                       funktionale Prüfung für den Zahlungsablauf
Werkzeuge:             scripts/stripe-smoke.mjs (35 Checks), axe-core 4.10.2
Hilfsmittel:           keine
Browser und Versionen: Chromium des Cloud-Browsers, User-Agent Chrome/156
Viewports:             1280 × 900, 320 × 640

Gesamtergebnis:        [x] Erfolgsfall funktional bestätigt (Stub)
                       [x] UI-Zustände ohne axe-Verstoß, Fokus und Ansage korrekt
                       [ ] Prüfung unvollständig: echter Stripe-Testmodus fehlt
Freigabe durch:         offen
```

## 2. Vorgehen

Ein Test gegen echtes Stripe setzt **Testmodus-Schlüssel** voraus (`sk_test_…`,
Testpreis). Im Projekt liegen keine: `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` und
`STRIPE_WEBHOOK_SECRET` sind in `.env.local` leer, in Produktion sind
Live-Schlüssel hinterlegt, die für einen Test nicht in Frage kommen.

Stattdessen wurde der im Repo vorhandene, dafür gebaute Aufbau benutzt:

```
STRIPE_SECRET_KEY=sk_test_stub STRIPE_PRICE_ID=price_stub \
STRIPE_WEBHOOK_SECRET=whsec_stub_secret \
STRIPE_API_BASE=http://127.0.0.1:4026 npm run dev

STRIPE_WEBHOOK_SECRET=whsec_stub_secret npm run stripe:smoke
```

Der Stub läuft lokal auf Port 4026 und beantwortet die Stripe-Endpunkte, die die
Anwendung aufruft. Es werden **keine echten Zahlungen** ausgelöst und keine
externen Konten berührt. Geprüft wird damit die Anwendungslogik, nicht das
Verhalten von Stripe selbst.

## 3. Ergebnis des Funktionslaufs

`35/35 checks passed.`

| Gruppe | Geprüft |
| --- | --- |
| Checkout-Sitzung | Testkunde angelegt, Sitzung erstellt (200), Provider-URL und Sitzungs-ID zurückgegeben, Modus `subscription`, konfigurierter Preis verwendet, Benutzer-ID an der Sitzung, `success_url` mit Sitzungsplatzhalter, lokaler Zustand `pending` vor der Zahlung, Stub-Sitzung mit Provider-Objekten verknüpft |
| Signierte Webhooks | Abschluss verarbeitet, Abo danach `active`, Abo- und Kunden-ID gespeichert, Periodenende gespeichert, `past_due` übernommen und gemappt, `invoice.paid` akzeptiert und wieder `active` |
| Kündigung zum Periodenende | Kündigung angenommen, an den Provider gesendet, `cancel_at_period_end` gesetzt, Zugang bleibt bis Periodenende, Löschung akzeptiert, Abo endet `canceled`, doppeltes Ereignis idempotent, gefälschte Signatur abgelehnt (400) ohne Zustandsänderung |
| Serverseitige Bestätigung und Eigentum | Zweiter Testkunde, zweite Sitzung, `confirm` bestätigt serverseitig (200), Bestätigung aktiviert das Abo, fremde Sitzung abgelehnt (403), kein Zustandswechsel |

Damit ist der Erfolgsfall **funktional** belegt: Sitzung erstellen, Zahlung
bestätigen, Abo wird aktiv, Kündigung wirkt zum Periodenende.

## 4. UI-Zustände

Gemessen im Browser mit einem Testkonto, das ein aktives Abo hatte.

| Zustand | Ergebnis |
| --- | --- |
| `?checkout=success` | Erfolgsmeldung vorhanden, `role="status"`, `tabindex="-1"`, **Fokus liegt auf der Meldung** (wird also angesagt): „Danke! Deine Zahlung wird serverseitig geprüft. Der Status aktualisiert sich nach Bestätigung durch den Zahlungsanbieter." |
| `?checkout=canceled` | Meldung vorhanden, `role="status"`, Fokus liegt auf der Meldung: „Der Checkout wurde abgebrochen. Es wurde keine Zahlung ausgelöst." |
| Aktives Abo | Seite zeigt „Abonnement kündigen"; axe 0 Verstöße |

Zusätzlich: axe-core 4.10.2 **0 Verstöße** auf dem Erfolgszustand und auf der
Seite mit aktivem Abo; Reflow bei 320 px 305 = 305.

## 5. Befund außerhalb der Barrierefreiheit

| Nr. | Seite | Beobachtung | Schwere | Status |
| --- | --- | --- | --- | --- |
| 1 | `/dashboard/subscription` | Bei aktivem Abo wird zusätzlich zum Kündigungs-Knopf weiterhin „Premium im Web abschließen" angeboten. Der Server lehnt einen zweiten Abschluss mit einem Konflikt ab, doppelte Zahlung ist also nicht möglich – die Oberfläche bietet aber eine Handlung an, die zwangsläufig scheitert | kosmetisch (UX) | offen, Empfehlung: Checkout-Bereich bei aktivem Abo ausblenden oder durch „Abo verwalten" ersetzen |

Kein Barrierefreiheitsbefund: Rollen, Fokus und Beschriftungen sind korrekt. Es
ist ein Widerspruch im Handlungsangebot.

Nachtrag 12.11.2026: **Befund 1 ist behoben.** Der Checkout-Bereich wird nur noch
angezeigt, wenn der Status nicht `active` ist – genau die Bedingung, unter der
auch der Server einen zweiten Abschluss ablehnt (`already_active` in
`lib/payments.ts`). Die Kündigung bleibt sichtbar.

Nachgeprüft mit serverseitig gerendertem HTML (zwei Testkonten, gleiche URL):

| Konto | „Abonnement kündigen" | „Premium im Web abschließen" |
| --- | --- | --- |
| Abo aktiv | vorhanden (1×) | **nicht vorhanden** (0×) |
| kein Abo | nicht vorhanden (0×) | vorhanden (1×) |

Zusätzlich im Browser für das aktive Konto gemessen: nur noch die Knöpfe
„Abmelden", „Abonnement kündigen" und „Cookie-Einstellungen", axe 0 Verstöße,
Reflow bei 320 px 305 = 305.

## 6. Grenzen dieser Prüfung

```
Nicht geprüft:            echter Stripe-Testmodus, Stripe-Checkout-Oberfläche,
                          Zahlung mit Testkarte 4242 4242 4242 4242,
                          Webhooks aus dem Stripe-Dashboard (nur lokal signiert),
                          Produktionsverhalten, Bildschirmleser
Bekannte Einschränkungen: Der Stub prüft die Anwendungslogik, nicht das Verhalten
                          von Stripe. Fehlerfälle der echten API (Timeouts,
                          Kartenfehler, 3-D Secure) sind damit nicht abgedeckt.
Warum nicht geprüft:      keine Testmodus-Schlüssel im Projekt; Live-Schlüssel
                          aus Produktion dürfen dafür nicht verwendet werden.
Geplante Nachholung:      Testmodus-Schlüssel als Projekt-Secret hinterlegen,
                          dann scripts/stripe-live-test.mjs und ein manueller
                          Durchlauf mit der Testkarte.
```

So lässt sich der echte Testmodus nachholen, ohne Schlüssel im Chat zu nennen:
`STRIPE_SECRET_KEY` (Testmodus) und `STRIPE_PRICE_ID` als Projekt-Secret bzw. in
`.env.local` eintragen, Dev-Server damit starten, `npm run stripe:live-test`
ausführen. Das Skript verweigert Live-Schlüssel, solange `ALLOW_LIVE_STRIPE`
nicht gesetzt ist.

## 7. Ablage

- [x] Im Repository abgelegt.
- [x] Testdaten entfernt: beide Stub-Testnutzer, ihre Abos und Ereignisse sowie
      die temporäre Sitzung gelöscht; Stub beendet, Dev-Server ohne Stub neu
      gestartet. Datenbank danach: 0 Abos mit Stripe-Anbindung, 0 Ereignisse,
      2 Nutzer (unverändert), 0 Test-Sitzungen.
