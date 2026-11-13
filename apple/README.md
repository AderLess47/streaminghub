# StreamingHub für iOS, iPadOS und macOS

Native SwiftUI-App für iPhone, iPad und Mac – ein Target, drei Plattformen.
Funktionaler Zwilling der Android-App (`../android`) und der Vega-App
(`../vega`): Playlist-Import, Live/Filme/Serien, Kategorien, Suche, Favoriten,
Wiedergabe mit Fortsetzungspunkt, XMLTV-Programmführer mit echten
Benachrichtigungen, Gerätekopplung, Kontostatus, Premium-Anbindung über
StoreKit 2, Demo-Modus und Low-Spec-Modus.

Die App ist kein Inhaltsangebot: Sie liest ausschließlich die vom Nutzer
importierten Quellen. Übertragen werden nur Konto-, Geräte- und Abo-Metadaten
sowie optional die vom Kunden freigegebene M3U-Quell-URL (`../docs/API.md`).

## Aufbau

```
Package.swift              SwiftPM-Paket „StreamingHubCore" (Foundation, ohne UI)
Sources/StreamingHubCore/  Modell, M3U-/XMLTV-Parser, API-Client, Regeln, Demo
Tests/StreamingHubCoreTests/ XCTest für Parser, Regeln und Demo-Bibliothek
StreamingHub/              SwiftUI-App (iOS, iPadOS, macOS)
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
xcodebuild -scheme StreamingHub -destination 'platform=iOS Simulator,name=iPhone 16' build
swift test                   # Prüfungen der Core-Bibliothek
```

Voraussetzungen: Xcode 15+, Swift 5.9, Deployment-Ziele iOS 17 / macOS 14.
Ein `.pbxproj` von Hand zu pflegen wäre unlesbar; `project.yml` beschreibt
dasselbe Ziel in wenigen Zeilen.

## Stand der Prüfung

**Wichtig und ehrlich:** In der Umgebung, in der dieser Code entstand, gibt es
weder Xcode noch einen Swift-Compiler. Das heißt:

| Geprüft | Wie |
| --- | --- |
| Aufbau, Verträge, Verhalten der Parser und Regeln | durchgelesen und gegen die Kotlin- und TypeScript-Fassung abgeglichen |
| XCTest-Suite (Parser, Regeln, Demo) | **geschrieben, aber nicht ausgeführt** – ohne Toolchain nicht startbar |
| Kompilierung, Build, Simulator, Gerät, VoiceOver, StoreKit | **nicht geprüft** |

Die Prüfungen sind so geschrieben, dass `swift test` sie auf jedem Mac sofort
ausführt; die Erwartungswerte (etwa `20261112203000 +0100` = `1794511800000`)
wurden von Hand gegen die UTC-Rechnung kontrolliert. Bis zum ersten echten Lauf
gilt der Apple-Teil als ungebaut.

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

## Premium und App-Store-Regeln

Premium läuft über StoreKit 2 (`PremiumStore`). Die Regel ist dieselbe wie in
allen anderen Clients: **Der Client schaltet nichts frei.** StoreKit liefert
eine signierte Transaktion; erst wenn der Server sie geprüft und
`premiumActive` bestätigt hat, gilt das Abo.

Was dafür noch fehlt: ein Serverendpunkt, der eine App-Store-Transaktion
(JWS) prüft – `docs/API.md` kennt bisher nur den Amazon-Weg
(`/api/v1/amazon/purchase`). Solange dieser Endpunkt fehlt, ist der Kauf
bewusst gesperrt und die App sagt das, statt einen Kauf anzunehmen und nichts
freizuschalten. Sobald der Endpunkt existiert, genügt in `AppModel.bootstrap()`
ein Aufruf von `premium.configure(verifier:)`.

Ein App-Store-Build darf außerdem nicht auf einen externen Checkout verweisen;
die App enthält deshalb keinen Link zur Web-Bezahlung.

## Kleinere Einschränkungen

- `docs/API.md` kennt die Plattformwerte `firetv`, `androidtv`, `android`, `ios`
  und `web` – keinen für macOS. Der Mac meldet sich deshalb als `ios`
  (`AppModel.platform`). Sauber wäre ein zusätzlicher Wert in der API.
- Die Playlist wird vollständig im Speicher gehalten. Bei sehr großen Listen
  (Zehntausende Einträge) wäre eine seitenweise Ablage nötig; der Low-Spec-Modus
  ist bisher nur ein Schalter ohne eigene Grenze.
- Der Fortschritt wird beim Verlassen und alle zehn Sekunden gespeichert, nicht
  bei jedem Sprung.
- Für VoiceOver, Dynamic Type und Kontrast gibt es sprechende Labels, 44-pt-Ziele
  und textliche Zustände – geprüft ist davon nichts, solange kein Gerät läuft.

## Nächste Schritte

1. `xcodegen generate`, Build im Simulator, `swift test` laufen lassen.
2. Fehler aus dem ersten echten Build beheben (erwartbar: Kleinigkeiten an
   `AVKit`/`StoreKit`-Verfügbarkeiten pro Plattform).
3. Serverendpunkt für die App-Store-Prüfung festlegen, dann
   `premium.configure(verifier:)` anschließen.
4. Prüfprotokoll nach `../docs/PRUEFPROTOKOLL-VORLAGE.md` auf iPhone, iPad und
   Mac – inklusive VoiceOver und Dynamic Type.
