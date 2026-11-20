import Foundation

/// Gemeinsames Datenmodell von App und Core.
///
/// Die Begriffe entsprechen dem Android- und dem Vega-Client, damit dieselben
/// Playlist-Dateien und dieselben API-Antworten überall gleich verstanden werden.

public enum MediaKind: String, Codable, CaseIterable, Sendable {
    case live
    case movie
    case series
}

public struct Channel: Identifiable, Codable, Hashable, Sendable {
    public var id: String { url }
    public let name: String
    public let url: String
    public let logo: String?
    public let group: String
    public let tvgID: String?
    public let kind: MediaKind

    public init(
        name: String,
        url: String,
        logo: String? = nil,
        group: String = "Ohne Kategorie",
        tvgID: String? = nil,
        kind: MediaKind = .live
    ) {
        self.name = name
        self.url = url
        self.logo = logo
        self.group = group
        self.tvgID = tvgID
        self.kind = kind
    }

    /// Nicht jede Playlist-Zeile ist eine gültige URL; die Wiedergabe prüft das.
    public var playbackURL: URL? {
        guard let url = URL(string: url), let scheme = url.scheme?.lowercased() else { return nil }
        return ["http", "https", "rtsp", "rtmp", "file"].contains(scheme) ? url : nil
    }

    public var isAdaptive: Bool {
        let path = url.split(separator: "?").first.map(String.init)?.lowercased() ?? ""
        return path.hasSuffix(".m3u8") || path.hasSuffix(".mpd")
    }
}

public struct Programme: Identifiable, Codable, Hashable, Sendable {
    public var id: String { "\(channelID):\(startMs)" }
    public let channelID: String
    public var channelName: String
    public let startMs: Int64
    public let stopMs: Int64
    public var title: String
    public var detail: String?

    public init(
        channelID: String,
        channelName: String,
        startMs: Int64,
        stopMs: Int64,
        title: String,
        detail: String? = nil
    ) {
        self.channelID = channelID
        self.channelName = channelName
        self.startMs = startMs
        self.stopMs = stopMs
        self.title = title
        self.detail = detail
    }

    public var start: Date { Date(timeIntervalSince1970: Double(startMs) / 1000) }
    public var stop: Date { Date(timeIntervalSince1970: Double(stopMs) / 1000) }

    public func isRunning(at date: Date) -> Bool {
        let now = Int64(date.timeIntervalSince1970 * 1000)
        return startMs <= now && stopMs > now
    }
}

public struct Reminder: Identifiable, Codable, Hashable, Sendable {
    public let id: String
    public let channelID: String
    public let channelName: String
    public let title: String
    public let startMs: Int64

    public init(programme: Programme) {
        self.id = programme.id
        self.channelID = programme.channelID
        self.channelName = programme.channelName
        self.title = programme.title
        self.startMs = programme.startMs
    }

    public var start: Date { Date(timeIntervalSince1970: Double(startMs) / 1000) }
}

public struct WatchPosition: Codable, Hashable, Sendable {
    public let url: String
    public var positionMs: Int64
    public var durationMs: Int64
    public var updatedAt: Date?

    public init(url: String, positionMs: Int64, durationMs: Int64, updatedAt: Date? = nil) {
        self.url = url
        self.positionMs = positionMs
        self.durationMs = durationMs
        self.updatedAt = updatedAt
    }
}

public struct ManagedPlaylist: Codable, Hashable, Sendable {
    public let url: String
    public let updatedAt: String?
}

public struct Account: Codable, Hashable, Sendable {
    public let email: String
    public let displayName: String
    public let deviceName: String
    public let platform: String
    public let plan: String
    public let subscriptionStatus: String
    public let channel: String
    public let currentPeriodEnd: String?
    public let premiumActive: Bool
    public let playlist: ManagedPlaylist?

    public init(
        email: String,
        displayName: String,
        deviceName: String,
        platform: String,
        plan: String,
        subscriptionStatus: String,
        channel: String,
        currentPeriodEnd: String?,
        premiumActive: Bool,
        playlist: ManagedPlaylist?
    ) {
        self.email = email
        self.displayName = displayName
        self.deviceName = deviceName
        self.platform = platform
        self.plan = plan
        self.subscriptionStatus = subscriptionStatus
        self.channel = channel
        self.currentPeriodEnd = currentPeriodEnd
        self.premiumActive = premiumActive
        self.playlist = playlist
    }
}

public struct PlaylistCache: Codable, Sendable {
    public var channels: [Channel]
    public var sourceURL: String?
    public var sourceLabel: String
    public var updatedAt: Date?

    public init(channels: [Channel], sourceURL: String?, sourceLabel: String, updatedAt: Date?) {
        self.channels = channels
        self.sourceURL = sourceURL
        self.sourceLabel = sourceLabel
        self.updatedAt = updatedAt
    }

    public static let empty = PlaylistCache(channels: [], sourceURL: nil, sourceLabel: "", updatedAt: nil)
}

public struct ProgrammeCache: Codable, Sendable {
    public var programmes: [Programme]
    public var sourceURL: String?
    public var updatedAt: Date?

    public init(programmes: [Programme], sourceURL: String?, updatedAt: Date?) {
        self.programmes = programmes
        self.sourceURL = sourceURL
        self.updatedAt = updatedAt
    }

    public static let empty = ProgrammeCache(programmes: [], sourceURL: nil, updatedAt: nil)
}

public struct Settings: Codable, Sendable, Equatable {
    public var lowSpec: Bool
    public var demoMode: Bool

    public init(lowSpec: Bool = false, demoMode: Bool = false) {
        self.lowSpec = lowSpec
        self.demoMode = demoMode
    }

    public static let standard = Settings()
}
