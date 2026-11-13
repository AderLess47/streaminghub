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

Verlängerungen kommen als neue Transaktion über `Transaction.updates` und laufen
durch denselben Endpunkt. `POST /api/v1/apple/refresh` prüft nur den gespeicherten
Zeitraum: Ist er abgelaufen und hat die App keine Verlängerung gemeldet, endet
Premium.

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

- **Kein App Store Server API und keine Server Notifications V2.** Verlängerungen
  kennt der Server deshalb erst, wenn die App sie meldet. Wer die App monatelang
  nicht öffnet, verliert Premium (die Periode läuft ab) und bekommt es beim
  nächsten Start zurück, sobald die Transaktion eintrifft. Wer das ohne App-Start
  braucht, ergänzt einen Webhook auf `signedPayload` – die Prüflogik dafür ist
  bereits vorhanden.
- **Kein `appAccountToken`.** Die Zuordnung läuft über den Geräte-Token des
  Aufrufs, nicht über eine im Kauf mitgegebene Konto-ID.
- **Keine Erstattungs-Ereignisse in Echtzeit.** `revocationDate` wird bei der
  nächsten gemeldeten Transaktion bzw. beim Refresh ausgewertet.

## Prüfungen

`npm run test:apple-iap` prüft gegen eine eigens erzeugte Zertifikatskette
(`src/lib/__fixtures__/apple/`): gültige Transaktion, fehlendes Zwischenzertifikat,
manipulierte Nutzlast, fremder Schlüssel, unbekannte Wurzel, fremdes Bundle,
fremdes Produkt, falscher Produkttyp, Sandbox ohne Freigabe, Ablauf, Widerruf,
kaputte Eingaben, Zustandsregeln, Konfliktregeln und das Replay-Fenster.
Die Testkette ist kein Geheimnis und nicht für den Produktivbetrieb gedacht.
