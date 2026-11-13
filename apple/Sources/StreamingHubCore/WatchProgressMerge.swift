import Foundation

/// Führt den lokal gespeicherten Wiedergabestand mit dem aus dem Konto zusammen.
///
/// Regel wie auf Android und Vega OS: Je Eintrag gewinnt der **weiter
/// fortgeschrittene** Stand. Ein offline vorgespulter Film fällt damit nicht auf
/// einen älteren Serverstand zurück. Einträge ohne bekannte Laufzeit – also
/// Live-Sender und alles, was der Server nicht als fortsetzbar kennt – werden
/// nicht übernommen.
public enum WatchProgressMerge {

    public struct RemoteEntry: Sendable {
        public let url: String
        public let positionMs: Int64
        public let durationMs: Int64
        public let updatedAt: Date?

        public init(url: String, positionMs: Int64, durationMs: Int64, updatedAt: Date? = nil) {
            self.url = url
            self.positionMs = positionMs
            self.durationMs = durationMs
            self.updatedAt = updatedAt
        }
    }

    public static func merge(
        _ local: [String: WatchPosition],
        remote: [RemoteEntry]
    ) -> [String: WatchPosition] {
        var result = local
        for entry in remote {
            guard entry.positionMs > 0, entry.durationMs > 0 else { continue }
            if let current = result[entry.url], current.positionMs >= entry.positionMs {
                continue
            }
            result[entry.url] = WatchPosition(
                url: entry.url,
                positionMs: entry.positionMs,
                durationMs: entry.durationMs,
                updatedAt: entry.updatedAt
            )
        }
        return result
    }
}
