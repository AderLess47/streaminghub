# App-Store-Käufe und das Premium-Abo

Wie das Premium-Abo auf iPhone, iPad und Mac verkauft, serverseitig geprüft und
im Konto geführt wird. Gegenstück zu [`IAP-AMAZON.md`](IAP-AMAZON.md).

## Ablauf

1. Die App lädt das Abo per StoreKit 2 (`premium_monthly`).
2. Der Kauf liefert eine **signierte Transaktion** (`VerificationResult.jwsRepresentation`).
3. Die App schickt sie mit ihrem Geräte-Token an `POST /api/v1/apple/purchase`.
4. Der Server prüft Signaturkette und Ansprüche, schreibt Beleg und Abo-Zeile und
   antwortet mit dem Abo-Stand.
5. Erst dann gilt Premium in der App. Ohne Serverantwort schaltet sie nichts frei.
6. Verlängerung, Erstattung und Ablauf meldet Apple zusätzlich selbst als
   **App Store Server Notification** an `/api/v1/apple/notifications` – dafür
   muss die App nicht laufen.

`POST /api/v1/apple/refresh` prüft den gespeicherten Zeitraum, wenn die App
startet: Ist er abgelaufen und hat weder die App noch Apple eine Verlängerung
gemeldet, endet Premium.

## Was der Server prüft

| Prüfung | Warum |
| --- | --- |
| JWS-Format, `alg = ES256` | Nur so ist die Transaktion überhaupt ein Beleg |
| Signatur mit dem Blattzertifikat (`ieee-p1363`) | JOSE kodiert ECDSA als rohes r‖s, nicht als DER |
| Kette bis **Apple Root CA G3** | Ein selbst gebautes Zertifikat reicht damit nicht |
| Gültigkeitszeiträume aller Zertifikate | Abgelaufene Zertifikate sind kein Vertrauensanker |
| `bundleId`, `productId` | Ein fremder Beleg darf kein Abo freischalten |
| `type = Auto-Renewable Subscription` | Einmalartikel sind kein Abo |
| `revocationDate`, `expiresDate` | Erstattung und Ablauf beenden Premium |
| `environment` | Sandbox nur mit ausdrücklicher Freigabe |

Die Wurzel liegt als Konstante in `src/lib/apple-root-ca.ts` (öffentliches
Zertifikat, Quelle: apple.com/certificateauthority). Sie wird nicht zur Laufzeit
geladen – die Prüfung soll nicht von einer zweiten Verbindung abhängen.

## Benachrichtigungen von Apple

App Store Server Notifications V2 gehen an `POST /api/v1/apple/notifications`.
Apple ruft den Endpunkt ohne Token auf – der Beleg ist das signierte
`signedPayload`. Geprüft werden die äußere Notification, die darin steckende
signierte Transaktion und, wenn vorhanden, die signierte Verlängerungsinfo,
jeweils mit derselben Kette bis Apple Root CA G3. Anders als beim Kauf sind
abgelaufene und erstattete Transaktionen hier gültige Nachrichten; genau das
teilen sie mit.

| Meldung | Wirkung |
| --- | --- |
| `SUBSCRIBED`, `DID_RENEW`, `OFFER_REDEEMED`, `RENEWAL_EXTENDED`, `REFUND_REVERSED`, `TEST` | Zeitraum und Status aus der Transaktion übernehmen |
| `REFUND`, `REVOKE` | Premium endet sofort (`revocationDate`) |
| `EXPIRED`, `GRACE_PERIOD_EXPIRED` | Premium endet, sobald der Zeitraum vorbei ist |
| `DID_CHANGE_RENEWAL_STATUS`, `DID_FAIL_TO_RENEW`, `CONSUMPTION_REQUEST`, `PRICE_INCREASE` | quittiert, ändert nichts – der laufende Zeitraum gilt weiter |
| unbekannte Typen | quittiert, damit Apple nicht tagelang erneut zustellt |

Zwei Schutzregeln:

- **Duplikate:** `notificationUUID` landet in `subscription_events`; dieselbe
  Meldung wird nur einmal angewendet.
- **Reihenfolge:** Eine Meldung, deren Zeitraum vor dem gespeicherten endet, wird
  verworfen. Sonst könnte eine verspätete `EXPIRED`-Meldung ein bereits
  verlängertes Abo beenden.

Ohne gespeicherten Beleg gibt es kein Konto, dem eine Meldung gehört; sie wird mit
`200` quittiert, aber nicht angewendet. Ungültige Belege bekommen `400` und
landen im Audit-Log.

## Konfiguration

| Variable | Bedeutung |
| --- | --- |
| `APPLE_IAP_BUNDLE_ID` | Bundle-ID der App, z. B. `org.streaminghub.app`. **Ohne sie bleibt die Anbindung aus** (503), damit kein Testsystem versehentlich echte Belege annimmt. |
| `APPLE_IAP_PRODUCT_ID` | Produkt-ID des Abos, Standard `premium_monthly` |
| `APPLE_IAP_ALLOW_SANDBOX` | `1`, wenn Testkäufe aus dem Sandbox-/TestFlight-Konto akzeptiert werden sollen. In Produktion aus lassen. |

Keine Secrets: Der private Schlüssel der App liegt nicht auf dem Server. Für die
Prüfung genügt Apples öffentliche Zertifikatskette.

## Konflikte

Es gibt keine stille Zusammenführung zwischen Web-, Amazon- und App-Store-Abo:

- Ist bereits ein Abo eines anderen Kanals aktiv, antwortet der Server mit `409`
  und dem Hinweis, sich an den Support zu wenden.
- Gehört die Transaktion (`originalTransactionId`) bereits zu einem anderen
  Konto, ebenfalls `409`. Ein Unique-Index
  (`idx_subs_apple_customer`) verhindert das zusätzlich auf Datenbankebene.
- Kündigen lässt sich ein App-Store-Abo nur bei Apple; die Website verweist
  darauf, statt eine Stripe-Kündigung zu versuchen.

## Grenzen dieser Fassung

- **Kein App Store Server API.** Der Server fragt Apple nicht aktiv nach dem
  Status; er kennt nur, was Käufe und Notifications melden. Für den Normalfall
  reicht das, für Nachfragen beim Support wäre die API der nächste Schritt.
- **Kein `appAccountToken`.** Die Zuordnung läuft über den Geräte-Token des
  Aufrufs, nicht über eine im Kauf mitgegebene Konto-ID.
- **Benachrichtigungen brauchen die öffentliche URL.** Ein lokal laufender
  Server bekommt keine Zustellung; Testläufe brauchen ein Deployment oder eine
  Weiterleitung.

## Prüfungen

`npm run test:apple-iap` prüft gegen eine eigens erzeugte Zertifikatskette
(`src/lib/__fixtures__/apple/`): gültige Transaktion, fehlendes Zwischenzertifikat,
manipulierte Nutzlast, fremder Schlüssel, unbekannte Wurzel, fremdes Bundle,
fremdes Produkt, falscher Produkttyp, Sandbox ohne Freigabe, Ablauf, Widerruf,
kaputte Eingaben, Zustandsregeln, Konfliktregeln und das Replay-Fenster – plus
dieselben Regeln für Notifications (äußere Hülle, innere Transaktion,
Verlängerungsinfo, manipulierte Hülle, fehlende Transaktion, Sandbox, Wirkung der
Meldungstypen). Die Testkette ist kein Geheimnis und nicht für den
Produktivbetrieb gedacht.

`src/lib/apple-subscriptions.test.ts` prüft zusätzlich die Schreibwege gegen eine
echte SQLite-Datei: Beleg und Abo-Zeile entstehen in einer Transaktion, eine
Verlängerung aktualisiert denselben Beleg statt einen zweiten anzulegen, der
Unique-Index verhindert die Zuordnung zu einem zweiten Konto, eine Erstattung
beendet Premium sofort, und der Refresh beendet eine abgelaufene Periode, ohne
eine laufende anzutasten. Für Notifications kommt dazu: unbekannte Transaktion
wird quittiert statt geschrieben, `DID_RENEW` verlängert ohne App-Start, `REFUND`
beendet Premium sofort, `EXPIRED` beendet eine abgelaufene Periode, eine
verspätete `EXPIRED`-Meldung kann ein verlängertes Abo nicht kippen, dieselbe
`notificationUUID` wirkt nur einmal, und ein Web-Abo wird nicht übernommen.
