// swift-tools-version: 5.9
import PackageDescription

// Die Core-Bibliothek enthält alles, was ohne Apple-Oberflächen auskommt:
// Datenmodell, Parser, API-Client und die Regeln für Fortschritt und
// Erinnerungen. Dadurch lässt sie sich unabhängig von der App prüfen und von
// iOS, iPadOS und macOS gemeinsam nutzen.
let package = Package(
    name: "StreamingHubCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "StreamingHubCore", targets: ["StreamingHubCore"])
    ],
    targets: [
        .target(name: "StreamingHubCore"),
        .testTarget(name: "StreamingHubCoreTests", dependencies: ["StreamingHubCore"])
    ]
)
