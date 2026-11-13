# StreamingHub für iOS, iPadOS, macOS und Apple TV

Native SwiftUI-App für iPhone, iPad, Mac und Apple TV – ein Target, vier
Plattformen. Apple TV nutzt dieselbe Bundle-ID und damit Universal Purchase:
ein Abo gilt auf allen Geräten, und die Serverprüfung bleibt dieselbe.
Funktionaler Zwilling der Android-App (`../android`) und der Vega-App
(`../vega`): Playlist-Import, Live/Filme/Serien, Kategorien, Suche, Favoriten,
Wiedergabe mit Fortsetzungspunkt, XMLTV-Programmführer mit echten
Benachrichtigungen, Gerätekopplung, Kontostatus, Premium-Anbindung über
StoreKit 2, Demo-Modus, Low-Spec-Modus, Diagnose-Protokoll sowie Datenschutz-,
Impressum- und Kontolöschungs-Links.

Die App ist kein Inhaltsangebot: Sie liest ausschließlich die vom Nutzer
importierten Quellen. Übertragen werden nur Konto-, Geräte- und Abo-Metadaten
sowie optional die vom Kunden freigegebene M3U-Quell-URL (`../docs/API.md`).

## Aufbau

```
Package.swift              SwiftPM-Paket „StreamingHubCore" (Foundation, ohne UI)
Sources/StreamingHubCore/  Modell, M3U-/XMLTV-Parser, API-Client, Regeln, Demo
Tests/StreamingHubCoreTests/ XCTest für Parser, Regeln und Demo-Bibliothek
StreamingHub/              SwiftUI-App (iOS, iPadOS, macOS, tvOS)
  App/                     AppModel, lokale Ablage, Schlüsselbund, Erinnerungen, StoreKit
  UI/                      Ansichten und Bausteine
project.yml                XcodeGen-Spezifikation
```

Die Trennung ist Absicht: Parser und Regeln hängen an keiner Oberfläche und
lassen sich ohne Simulator prüfen; die App-Schicht bleibt dünn.

## Bauen

```bash
brew install xcodegen
cd apple
xcodegen generate            # erzeugt StreamingHub.xcodeproj (nicht eingecheckt)
open StreamingHub.xcodeproj  # oder:
xcodebuild -scheme StreamingHub_iOS -destination 'platform=iOS Simulator,name=iPhone 16' build
xcodebuild -scheme StreamingHub_tvOS -destination 'platform=tvOS Simulator,name=Apple TV 4K (3rd generation)' build
swift test                   # Prüfungen der Core-Bibliothek
```

XcodeGen legt für die Plattformliste je ein Target an (`StreamingHub_iOS`,
`StreamingHub_macOS`, `StreamingHub_tvOS`), alle mit `PRODUCT_NAME`
`StreamingHub` und derselben Bundle-ID. Voraussetzungen: Xcode 15+, Swift 5.9,
Deployment-Ziele iOS 17 / macOS 14 / tvOS 17.
Ein `.pbxproj` von Hand zu pflegen wäre unlesbar; `project.yml` beschreibt
dasselbe Ziel in wenigen Zeilen.

## Stand der Prüfung

**Wichtig und ehrlich:** In der Umgebung, in der dieser Code entstand, gibt es
weder Xcode noch einen Swift-Compiler. Das heißt:

| Geprüft | Wie |
| --- | --- |
| Core-Bibliothek kompiliert und XCTest-Suite läuft | CI-Job `Apple core tests` mit offizieller Swift-Toolchain; **14 Prüfungen, alle grün** |
| Parser, Regeln, Demo gegen die Kotlin- und TypeScript-Fassung | dieselben Fälle wie dort, zusätzlich hier als Test festgeschrieben |
| SwiftUI-Oberfläche, Build im Simulator, Gerät, VoiceOver, StoreKit | **nicht geprüft** – dafür braucht es Xcode |
| tvOS-Target (Projektdatei, Fokusführung, Wiedergabe auf dem Fernseher) | **nicht geprüft** – weder tvOS-SDK noch Simulator vorhanden |

Der erste CI-Lauf hat zwei echte Fehler gefunden, die ohne Compiler niemand
gesehen hätte: `URLSession.data(for:)` gibt es nur in Apples Foundation (jetzt
über `dataTask` und eine Continuation gelöst), und ein Erwartungswert im Test
rechnete die Zeitzone falsch (`20:00 +0100` ist 19:00 UTC, nicht 19:30). Genau
deshalb läuft die Suite in CI und nicht nur auf dem Papier.

Warum kein macOS-Runner: In diesem Repository werden macOS-Jobs sofort
abgebrochen. Die Core-Prüfungen laufen deshalb im Linux-Container
(`swift:5.10`); die Oberfläche bleibt bis zum ersten Mac-Build ungeprüft.

## Was auf Apple-Plattformen besser ist als auf Vega

- **Wiedergabe:** AVPlayer spielt HLS und progressive Dateien ohne Zusatzpaket.
  Auf Vega braucht HLS einen MSE-Player aus Amazons gepatchtem Shaka-Paket.
- **Erinnerungen:** `UNUserNotificationCenter` plant echte Benachrichtigungen zu
  einem Zukunftstermin – auch bei geschlossener App. Vega OS kennt für Apps nur
  das Install-Ereignis, dort erinnert die App nur im Vordergrund.
- **Token:** Das Aktivierungstoken liegt im Schlüsselbund (`KeychainToken`), nicht
  in einer unverschlüsselten Ablage.
- **EPG:** `XMLParser` statt regulärer Ausdrücke – Entities und CDATA sind damit
  kein Sonderfall.

## Datei-Import

Playlist (M3U/M3U8) und XMLTV lassen sich neben der URL auch aus einer Datei
laden: *Einstellungen → Playlist → Playlist aus Datei laden* bzw.
*Programmdaten aus Datei laden*. Der Systemdialog liefert eine
security-scoped URL; die App liest sie innerhalb des Scopes, begrenzt auf 50 MB,
und fällt bei der Kodierung von UTF-8 auf ISO-8859-1 zurück. Importierte Dateien
ersetzen die URL als Quelle – die Hintergrund-Auffrischung entfällt dann, weil
es keine Adresse gibt. Auf dem Apple TV fehlen diese Knöpfe, weil tvOS keinen
Dokumentendialog anbietet.

## Diagnose

Die App schreibt ein Protokoll für Fehler und Hardware nach
`Application Support/StreamingHub/diagnostics.log`: einmal je Start ein Kopf mit
Systemstand, Modell, Bildschirm, Sprache und App-Version, danach Fehler aus
Playlist-, EPG-, Konto-, Erinnerungs- und Wiedergabepfaden. Die Einstellungen
zeigen die Einträge und löschen sie; übertragen wird nichts automatisch. Tokens,
E-Mail-Adressen und URL-Query-Parameter werden nicht geschrieben. Format und
Grenzen: `../docs/APP-PARITAET.md`.

Unter *Rechtliches und Konto* stehen Datenschutz, Impressum und die öffentliche
Kontolöschung. Auf dem Apple TV werden die Adressen angezeigt statt geöffnet,
weil tvOS keinen Browser mitbringt.

## Premium und App-Store-Regeln

Premium läuft über StoreKit 2 (`PremiumStore`). Die Regel ist dieselbe wie in
allen anderen Clients: **Der Client schaltet nichts frei.** StoreKit liefert
eine signierte Transaktion; erst wenn der Server sie gegen Apples
Zertifikatskette geprüft und `premiumActive` bestätigt hat, gilt das Abo.

Der Kauf ist angeschlossen: `AppModel.bootstrap()` setzt den Prüfer auf
`POST /api/v1/apple/purchase` (`StreamingHubAPI.verifyApplePurchase`). Fehlt die
Serverkonfiguration (`APPLE_IAP_BUNDLE_ID`), antwortet der Server mit `503` und
die App zeigt den Grund, statt einen Kauf anzunehmen und nichts freizuschalten.

Ein App-Store-Build darf außerdem nicht auf einen externen Checkout verweisen;
die App enthält deshalb keinen Link zur Web-Bezahlung.

## Apple TV (tvOS)

Dasselbe Target läuft auf dem Apple TV; die Oberfläche bleibt geteilt, nur wo
sich Fernsehen anders bedient, gibt es einen eigenen Zweig:

- **Kopplung statt Anmeldung:** Der Code aus der App wird auf
  `streaminghub.org/activate` eingetragen – auf dem Fernseher über die
  Bildschirmtastatur, die Remote-App oder eine Bluetooth-Tastatur. Damit gibt es
  auf dem TV kein Passwortfeld.
- **Fokus statt Zeiger:** Kacheln nutzen auf tvOS den Fokus-Stil `.card`, damit
  sichtbar ist, was die Fernbedienung gerade ausgewählt hat. Die Navigation
  liegt in der Tableiste am oberen Rand, nicht in einer Seitenleiste.
- **Hintergründe:** tvOS kennt die gruppierten Systemfarben nicht; die Karten-
  und Seitenfarben sind dort fest und dunkel (`Theme`).
- **Erinnerungen:** Plant weiterhin `UNUserNotificationCenter`. Apple TV zeigt
  sie als Hinweis am App-Symbol, nicht als eingeblendeten Text; die Sendung
  selbst steht jederzeit im Programmführer unter „Vorgemerkt“.
- **Premium:** StoreKit 2 ist auf tvOS verfügbar; der Kauf läuft über denselben
  Serverendpunkt. Ein Kauf gilt dank gleicher Bundle-ID auch auf iPhone, iPad
  und Mac.

Nicht gebaut: In dieser Umgebung gibt es weder Xcode noch ein tvOS-SDK. Die
tvOS-Zweige sind deshalb nur gelesen, nicht kompiliert.

## Kleinere Einschränkungen

- `docs/API.md` kennt die Plattformwerte `firetv`, `androidtv`, `android`, `ios`
  und `web` – weder macOS noch tvOS haben einen eigenen Wert. Beide melden sich
  deshalb als `ios` (`AppModel.platform`). Sauber wäre ein zusätzlicher Wert in
  der API.
- Verlängerungen und Erstattungen kommen auch ohne App-Start an: Apple schickt
  sie als App Store Server Notifications an `/api/v1/apple/notifications`.
  Meldet die App zusätzlich eine Transaktion, gilt derselbe Zustand –
  Duplikate erkennt der Server.
- Die Playlist wird vollständig im Speicher gehalten. Bei sehr großen Listen
  (Zehntausende Einträge) wäre eine seitenweise Ablage nötig; der Low-Spec-Modus
  ist bisher nur ein Schalter ohne eigene Grenze.
- Der Fortschritt wird beim Verlassen und alle zehn Sekunden gespeichert, nicht
  bei jedem Sprung.
- Für VoiceOver, Dynamic Type und Kontrast gibt es sprechende Labels, 44-pt-Ziele
  und textliche Zustände – geprüft ist davon nichts, solange kein Gerät läuft.

## Nächste Schritte

1. `xcodegen generate`, Build in den Simulatoren für iOS und tvOS, `swift test`
   laufen lassen.
2. Fehler aus dem ersten echten Build beheben (erwartbar: Kleinigkeiten an
   `AVKit`/`StoreKit`-Verfügbarkeiten und an tvOS-Fokus).
3. Prüfprotokoll nach `../docs/PRUEFPROTOKOLL-VORLAGE.md` auf iPhone, iPad, Mac
   und Apple TV – inklusive VoiceOver und Dynamic Type.
