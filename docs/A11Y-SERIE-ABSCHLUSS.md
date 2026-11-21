# Abschluss der A11y-Serie (#361)

Stand: 21. November 2026. Dieses Dokument belegt, was von der in
[#361](https://github.com/AderLess47/streaminghub/issues/361) beschriebenen
Restarbeit tatsächlich nachweisbar ist, und schließt das Issue auf dieser
Grundlage ab. Es ersetzt kein Prüfprotokoll: die Messungen selbst stehen in
[`docs/pruefprotokolle/`](pruefprotokolle/README.md).

## 1. Ausgangslage

[#123](https://github.com/AderLess47/streaminghub/pull/123) brachte 16 Commits
der ursprünglichen A11y-Serie nach `main`. Die übrigen Commits (in #123 war von
rund 56 die Rede) existierten auf keinem Remote-Branch, waren in keinem
Force-Push-Ereignis enthalten, über die GitHub-Commit-Suche nicht zu finden und
im lokalen Klon nicht als unreachable Objekte vorhanden. #361 sollte diese
Arbeit einholen: die fehlenden Commits pushen, gegen `main` rebasen und die
Monetarisierungs-, Fokus- und Sprach-/Mail-Punkte abschließen.

## 2. Was nachweisbar war – und was nicht

Die fehlenden Commit-Objekte sind weiterhin nicht vorhanden. Sie lagen
vermutlich nur in der lokalen Arbeitskopie des anderen Chats und wurden nie
gepusht; sie lassen sich nicht rekonstruieren. Das wörtliche Abnahmekriterium
„alle Commits der Serie sind auf einem Remote-Branch vorhanden und in einem PR
reviewbar" ist damit **nicht erfüllbar** – nicht durch Arbeit, sondern weil die
Objekte nicht existieren.

Statt die Serie zu rekonstruieren, wurde ihre Wirkung in kleinen, einzeln
reviewbaren PRs neu umgesetzt und jeder Punkt am Deploy belegt. Damit ist jedes
inhaltliche Ziel aus #361 erreichbar, ohne die Original-Commits zu benötigen:

| PR | Inhalt |
| --- | --- |
| [#363](https://github.com/AderLess47/streaminghub/pull/363), [#364](https://github.com/AderLess47/streaminghub/pull/364), [#365](https://github.com/AderLess47/streaminghub/pull/365) | Zielgrößen 44 px: Sprachwahl im Header, Footer-Ziele, Footer-Logo |
| [#366](https://github.com/AderLess47/streaminghub/pull/366) | Monetarisierung: `aria-disabled` statt `disabled`, Zustand in der Live-Region |
| [#367](https://github.com/AderLess47/streaminghub/pull/367) | alle Formulare behalten den Tastaturfokus |
| [#368](https://github.com/AderLess47/streaminghub/pull/368) | Sitzungsende wird erklärt, Sprachwahl gilt in Mails |
| [#369](https://github.com/AderLess47/streaminghub/pull/369), [#370](https://github.com/AderLess47/streaminghub/pull/370) | Tests: Mailsprache für `fr`/`tr`, Persistenz der Sprachwahl |
| [#374](https://github.com/AderLess47/streaminghub/pull/374), [#375](https://github.com/AderLess47/streaminghub/pull/375) | Checkout: AGB-/Widerrufszustimmung, Fehlermeldung und `aria-invalid` |
| [#371](https://github.com/AderLess47/streaminghub/pull/371), [#377](https://github.com/AderLess47/streaminghub/pull/377)–[#386](https://github.com/AderLess47/streaminghub/pull/386) | Cookie-Banner: Fokus beim Speichern, Rückgabe, Escape, Reserve, Fehlerpfad, Persistenz, blockierter Speicher |
| [#372](https://github.com/AderLess47/streaminghub/pull/372), [#373](https://github.com/AderLess47/streaminghub/pull/373), [#376](https://github.com/AderLess47/streaminghub/pull/376) | AST-Tests sichern die Fokusregeln ab |
| [#387](https://github.com/AderLess47/streaminghub/pull/387), [#388](https://github.com/AderLess47/streaminghub/pull/388), [#389](https://github.com/AderLess47/streaminghub/pull/389) | Fokusprotokoll des Banners, 2.4.11-Prüfmethode in der Vorlage, Nachtrag 320 px |

## 3. Abnahmekriterien aus #361

| Kriterium | Nachweis | Stand |
| --- | --- | --- |
| Alle Commits der Serie auf einem Remote-Branch, in einem PR reviewbar | Die Original-Commits existieren nicht mehr (Abschnitt 2). Inhaltlich stattdessen die unten aufgelisteten, einzeln gemergten PRs, jeder mit Review und grüner CI | nicht wörtlich erfüllbar, inhaltlich erfüllt |
| CI (`Typecheck and tests`) grün auf dem neuen Head | Jeder der PRs lief mit 5/5 grünen Checks; `main` nach jedem Merge ebenfalls | erfüllt |
| Formular-Aktionen setzen `aria-disabled` und behalten den Fokus | `aria-disabled` in 16 Komponenten (`admin-mfa-form`, `language-switcher`, `cookie-consent`, `auth-forms`, `mfa-setup-form`, `cancellation-form`, `activate-form`, `withdrawal-form`, `checkout-button`, `retention-offer`, `resend-verification`, `cancel-subscription-form`, `contact-form`, `backup-panel`, `dashboard-forms`, `start-trial-button`); `npm run test:pending-focus` prüft die Regel, Live-Beleg im Monetarisierungs-Protokoll | erfüllt |
| `FormStatus`/`LiveRegion` werden weiterverwendet | Beide werden in Formularen, Admin-Seiten und im Cookie-Banner eingesetzt; die Zustände „wird gesendet", Erfolg und Fehler laufen darüber | erfüllt |
| Jahresabo, Coupons, Retention-Angebot und Support-Berechtigung funktionieren unverändert | Jahresabo: `src/lib/pricing.test.ts` (Jahrespreis, Ersparnis, Zuordnung der Price-ID) und `src/lib/entitlements.test.ts` (ein Jahresabo meldet sein Intervall). Coupons, Angebot, doppelte Annahme und Ablehnung: `src/lib/retention.test.ts`, dort auch der Conversion-Coupon nur für nicht zahlende Trials. `src/lib/flags.test.ts` prüft nur das Flag-Parsing und die stabilen Schlüssel, nicht das Verhalten. Support-Berechtigung: `scripts/support-tickets.test.ts` (ohne Abo kein Ticket, Anmeldung nötig, fremdes Ticket und Kundenrolle abgewiesen). Abo-Zyklus und Webhook: `scripts/stripe-webhook-routes.test.ts` | erfüllt |
| Keine stillen Logouts oder verlorenen Sprachwahlen in den Sprach-/Mail-Flows | `/login?expired=1` erklärt das Sitzungsende (`t.auth.sessionExpired`); `src/lib/subscription-mails.test.ts` prüft `fr` und `tr`; `scripts/api-routes.test.ts` prüft die Persistenz über `/api/locale`; `scripts/session-logout.test.ts` deckt den Logout ab | erfüllt |

Die Belegstellen dieser Zeile wurden am 21.11.2026 gegen `main` (`d7a15ef`)
stichprobenartig ausgeführt: `test:retention` 11/11, `test:entitlements`
(Flags, Preise, Ansprüche) 17/17, `test:support-tickets` 11/11 und
`test:stripe-webhook` 5/5 plus 1/1 im nicht konfigurierten Fall. Dabei fiel auf,
dass `src/lib/flags.test.ts` nur `isEnabledValue` und die Schlüssel aus
`FEATURE_FLAGS` prüft; das Verhalten des Conversion-Coupons steht in
`src/lib/retention.test.ts`. Die ursprüngliche Zuordnung war an dieser Stelle
falsch und ist oben berichtigt.

## 4. Checkliste aus #361

| Punkt | Nachweis | Stand |
| --- | --- | --- |
| `aria-disabled` statt `disabled` für laufende Formular-Aktionen | #366 für die Monetarisierung, #367 für die übrigen Formulare, #371 für den Cookie-Banner; `test:pending-focus` als Regressionsschutz | erledigt |
| Fokus-Protokolle, insbesondere Kündigung und Checkout | [Kündigungsablauf](pruefprotokolle/pruefprotokoll-2026-11-12-kuendigungsablauf.md), [Checkout-Erfolgsfall](pruefprotokolle/pruefprotokoll-2026-11-12-checkout-erfolgsfall.md), [Monetarisierung](pruefprotokolle/pruefprotokoll-2026-11-21-fokus-monetarisierung.md), [Cookie-Banner](pruefprotokolle/pruefprotokoll-2026-11-21-fokus-cookie-banner.md) | erledigt |
| Korrekturen an Sprach- und Mail-Flows (stiller Logout, Sprachwechsel) | #368 mit den Tests aus #369 und #370 | erledigt |
| Übrige Schritte der Serie | Zielgrößen #363–#365, Checkout-Compliance #374/#375, Cookie-Banner #371/#377–#386 | erledigt |

## 5. Prüfprotokolle als Nachweis

Alle Messungen sind nach
[PRUEFPROTOKOLL-VORLAGE.md](PRUEFPROTOKOLL-VORLAGE.md) angelegt und in
[pruefprotokolle/README.md](pruefprotokolle/README.md) aufgeführt. Sie decken
die öffentlichen Seiten, den angemeldeten Bereich, Checkout, Kündigung, die
Monetarisierungs-Aktionen und den Cookie-Banner bei 390 px und 320 px ab.

## 6. Grenzen

- **Keine echten Screenreader.** Die Belege sind DOM-, ARIA- und Messwerte;
  NVDA, JAWS, VoiceOver und TalkBack wurden nicht gefahren.
- **Zoom 200 %, Textabstands-Overrides, Windows-Kontrastmodus, andere Sprachen**
  und weitere Breiten über 320 und 390 px hinaus sind nicht geprüft.
- **Kein echter Zahlungsdienstleister.** Checkout und Kündigung liefen gegen den
  Stripe-Stub des Repos, nicht gegen Stripe-Test-Schlüssel; Amazon- und
  Apple-Kanal blieben außen vor.
- **Rolle.** Technische Prüfung durch einen automatisierten Assistenten, keine
  juristische Freigabe und keine Freigabe durch eine qualifizierte Person. Die
  BFSG-Einordnung steht in
  [BFSG-ANWENDUNGSBEREICH.md](BFSG-ANWENDUNGSBEREICH.md).
- **Die Original-Commits** aus #361 bleiben verschollen. Das ist kein offener
  Arbeitspunkt mehr, sondern eine nicht behebbare Lücke in der Überlieferung;
  die Wirkung ist durch die PRs oben belegt.

## 7. Ergebnis

#361 wird geschlossen. Die vier Punkte seiner Checkliste sind umgesetzt und
durch gemergte PRs, Tests und Prüfprotokolle belegt; die Abnahmekriterien sind
bis auf das wörtliche „alle Commits auf einem Remote-Branch" erfüllt, das wegen
der fehlenden Objekte nicht erreichbar ist und hier als solches festgehalten
wird. Die verbleibenden Grenzen aus Abschnitt 6 sind bekannt und in den
Protokollen vermerkt.
