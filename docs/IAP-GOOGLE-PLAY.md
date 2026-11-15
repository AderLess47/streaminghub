# Google Play: Build, Kaufweg und offener Punkt

## Was der Play-Build ist

Der Produkt-Flavor `play` erzeugt ein signiertes Android App Bundle (`.aab`)
für Google Play. Er teilt Code, Version und Funktionen mit dem Sideload-Build
(`direct`) und dem Amazon-Build, unterscheidet sich aber in der Bezahlfläche:

| Flavor | Vertrieb | Kauf in der App | Web-Checkout verlinkt |
| --- | --- | --- | --- |
| `direct` | Website / Sideload | nein, Kauf auf der Website | ja, im Konto-Bereich |
| `amazon` | Amazon Appstore | Amazon In-App Purchasing | nein |
| `play` | Google Play | **noch nicht** | nein |

`PREMIUM_SALES=false` im Play-Build blendet den Kaufkarten-Block, den
Premium-Status und den Link „Konto im Web verwalten“ aus. Ein Konto, das bereits
über Website, Amazon oder Apple bezahlt hat, funktioniert weiterhin; die App
zeigt dann nur den vom Server bestätigten Status.

## Bauen

```bash
cd android
./gradlew bundlePlayRelease
# app/build/outputs/bundle/playRelease/app-play-release.aab
```

Der Release-Workflow `.github/workflows/android-release.yml` baut das AAB bei
jedem Lauf mit, prüft `PREMIUM_SALES=false`, verifiziert die Signatur und legt es
als Artefakt `streaminghub-play-aab` ab.

## Was noch fehlt: Google Play Billing

Ein kostenpflichtiges Abo im Play-Build braucht mehr als eine Bibliothek:

1. **Play Console:** App-Eintrag, Abo-Produkt mit Produkt-ID und eine
   Lizenztest-Konfiguration.
2. **Client:** Google Play Billing Library, Verbindung zum Abo-Produkt,
   Kaufabschluss erst nach Serverfreigabe.
3. **Server:** `POST /api/v1/google/purchase` mit Prüfung über die Google Play
   Developer API (Service-Account, `androidpublisher`-Scope), Paketname und
   Produkt-ID, plus Umgang mit Verlängerungen, Kündigungen und Erstattungen.
4. **Benachrichtigungen:** Real-time Developer Notifications (Pub/Sub) für
   Verlängerungen, damit der Status auch ohne App-Start stimmt.

Ohne diese Schritte bleibt der Play-Build bewusst ohne Kaufweg. Das ist
Play-konform (kein externer Checkout), aber es ist **kein** vollständiger
Verkaufskanal. Bis dahin läuft Premium im Play-Build nur als Anzeige eines
bereits bestehenden Abos.

## Verhältnis zu den anderen Clients

- Amazon: `docs/IAP-AMAZON.md`
- Apple: StoreKit 2 im Apple-Client, Serverprüfung über `APPLE_IAP_BUNDLE_ID`
- Vega OS: kein Kauf in der App, siehe `vega/README.md`
