# Rechtliche Anforderungen: technischer Stand

Diese Datei hält fest, was im Code umgesetzt ist, was geprüft wurde und was nur
der Betreiber erledigen kann. Sie ist **keine Rechtsberatung** und ersetzt die
anwaltliche Prüfung von AGB, Widerrufsbelehrung und Datenschutzerklärung nicht.

Stand: 13. November 2026.

## 1. Widerruf über die Website (§ 356a BGB)

| Anforderung | Umsetzung |
| --- | --- |
| Ohne Anmeldung erreichbar | `/widerruf` – öffentliche Seite, keine Sitzung nötig |
| Klar bezeichnete Schaltfläche | „Verträge hier widerrufen“ (de) / „Withdraw contracts here“ (en) |
| Unmittelbare Bestätigung | Weiterleitung auf `/widerruf/bestaetigung?ref=…` mit Datum, Vertrag, Referenz |
| Bestätigung in Textform | E-Mail über `src/lib/mail.ts` (`withdrawalMail`), zusätzlich Meldung an den Betreiber |
| Nachweis | Tabelle `contract_requests` (Art, Vertrag, Zeitpunkt, Status, IP) plus Audit-Log `withdrawal.submitted` |
| Belehrung angepasst | `src/content/legal.ts`, Widerrufsinformationen nennen die Online-Funktion |

Grenze: Die Erstattung selbst läuft weiterhin manuell über den Zahlungsanbieter.
Die Bestätigung sagt das offen; ein automatischer Refund ist nicht implementiert.

## 2. Kündigung über die Website (§ 312k BGB)

| Anforderung | Umsetzung |
| --- | --- |
| Ohne Anmeldung erreichbar | `/kuendigung` |
| Schaltfläche „Jetzt kündigen“ | exakt so beschriftet, ein Klick löst die Kündigung aus |
| Bestätigungsseite | `/kuendigung/bestaetigung?ref=…` mit Datum, Inhalt und Wirkung |
| Bestätigung in Textform | `cancellationMail` mit Datum, Vertrag und Endzeitpunkt |
| Sofortige Wirkung beim Web-Abo | `cancelSubscription()` setzt `cancel_at_period_end` bei Stripe |
| Store-Abos | Status `store_channel`: belegt und bestätigt, Kündigung zusätzlich im Store |

Grenze: Bei Apple und Amazon liegt der Vertrag beim Store. Die Website kann dort
technisch nicht kündigen; die Bestätigung sagt das ausdrücklich.

## 3. Premium-Funktionsangaben

Abgeglichen am 13. November 2026:

| Aussage | Wo | Stand |
| --- | --- | --- |
| Geräteübergreifendes Weiterschauen | Premium-Seite („Verfügbar“), i18n, README | **stimmt**: Android holt den Stand beim Öffnen des Senders, Apple und Vega beim Start |
| VPN-/Proxy-Funktion | Premium-Seite, Hilfe, Datenschutz, AGB § 4 | „In Entwicklung“ – nicht implementiert, aus dem Leistungsumfang ausgenommen |
| Erweiterte Streaming-Optimierung | Premium-Seite, AGB § 4 | „In Entwicklung“ |
| Amazon-Kauf | Premium-Seite, AGB § 3, Datenschutz § 5 | **korrigiert**: vorher „nicht erhältlich“, tatsächlich ist `PREMIUM_SALES = true` und Amazon IAP vorgesehen |
| Geräteverwaltung | Premium-Seite | stimmt (Dashboard, Kopplung, Entkopplung) |

## 4. Datenschutz gegen tatsächliche Verarbeitung

Geprüft wurden die Tabellen in `src/lib/schema.ts` gegen die Datenschutzerklärung.

| Verarbeitung | Tabelle | In der Erklärung |
| --- | --- | --- |
| Konto, Sitzungen, Rollen | `users`, `sessions`, `mfa_secrets` | § 3 |
| Geräte und Kopplung | `devices`, `pairing_requests`, `device_tokens` | § 4 |
| Verwaltete Playlist | `customer_playlists` | § 4 |
| Zahlungen, Stripe | `subscriptions`, `subscription_events` | § 5 |
| Amazon-/Apple-Belege | `iap_receipts` | § 5 – **ergänzt**: Belegkennung, Nutzerkennung, Produkt, Daten, Prüfstatus |
| Wiedergabepositionen | `watch_progress` | § 5/§ 12 – **ergänzt** |
| Widerruf und Kündigung | `contract_requests` | § 5/§ 12 – **ergänzt** |
| Support und Kontakt | `support_tickets`, `ticket_messages`, `contact_messages` | § 6 |
| E-Mail-Ausgang | `outbox_emails` | § 7 |
| Audit und Zugriffe | `audit_log`, `request_log` | § 10; `request_log` wird nicht personenbezogen gespeichert |

Bewusst **nicht** gespeichert: Zahlungs- und Kartendaten, Playlist-Inhalte,
Stream-Verläufe außerhalb der Premium-Positionen, keine Analyse- oder
Marketing-Cookies.

Offen (Betreiber): Auftragsverarbeitungsverträge mit Fly.io, Stripe, Resend und
Cloudflare abschließen und die genannten Fristen (90 Tage Audit, 30 Tage Logs,
24 Monate Support, Verjährung für Erklärungen) im Löschkonzept bestätigen.

## 5. APK, Lizenzen, Marken

Software-Inventar (aus den Manifesten):

| Bestandteil | Lizenz | Hinweis |
| --- | --- | --- |
| AndroidX, Compose, Media3/ExoPlayer, Coil, Kotlin-Coroutines | Apache-2.0 | Namensnennung im About-/Lizenzhinweis nötig |
| Next.js, React, Tailwind, Zod | MIT | unkritisch |
| Vega: React Native, AsyncStorage, xmldom | MIT / Apache-2.0 | unkritisch |
| Vega: `@amazon-devices/*` | Amazon-Nutzungsbedingungen | nur im Vega-Build, nicht weitergeben |
| Shaka-Player (Vega, HLS) | proprietär | **nicht im Repo**, wird lokal per `npm run setup:shaka` ergänzt; Lizenz vor Auslieferung prüfen |
| Apple: AVKit, StoreKit, SwiftUI | Apple-SDK | keine Drittbibliothek |

Marken: „Amazon“, „Fire TV“, „App Store“, „Apple TV“ werden nur beschreibend
verwendet („für Fire TV“), nicht als Produktname. „StreamingHub“ ist eine eigene
Bezeichnung ohne registrierte Marke; eine Recherche auf ältere Rechte steht aus.
Die Store-Screenshots unter `store/amazon/` sind Renderings, keine
Geräteaufnahmen – das ist im README vermerkt und vor der Einreichung zu ersetzen.

## 6. Stripe und Amazon

- Checkout und Kündigung laufen ausschließlich über den Server; der Browser
  erhält keine Preise oder Statuswechsel ohne bestätigte Webhook-/API-Antwort.
- Preisdarstellung: 2,49 € als Endpreis, § 19 UStG, kein Umsatzsteuerausweis.
- Im Amazon-Build gibt es keine externen Zahlungsaufforderungen und keinen Link
  auf den Web-Checkout; der Kauf läuft über Amazon IAP.
- Amazon-Richtlinie zur Kontolöschung: `/account-deletion` ist ohne Anmeldung
  erreichbar und im Formular zu verlinken (`docs/ACCOUNT-DELETION.md`).

Offen (Betreiber): Amazon-IAP-Artikel anlegen, `AMAZON_RVS_SHARED_SECRET` und
RTN registrieren, Stripe-Preis und Webhook Secret setzen. Ohne diese Werte
bleiben die Endpunkte bei `503` – das ist beabsichtigt.

## 7. Werbung

Es sind keine Kampagnen, Pixel oder Werbekonten im Projekt aktiv. Vor dem Start
sind die Aussagen zu prüfen, die die Seite selbst macht: „kein Inhalt, nur
Player“, „2,49 € Endpreis“, „jederzeit kündbar“, „14 Tage Widerruf“. Alle drei
sind jetzt durch Funktion und Text gedeckt. Nicht verwendet werden dürfen
Aussagen zu VPN, Optimierung oder „unbegrenzten“ Geräten.
