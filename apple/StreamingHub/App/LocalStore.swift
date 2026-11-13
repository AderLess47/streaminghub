import Foundation
import StreamingHubCore

/// Lokale Ablage als JSON-Dateien in Application Support.
///
/// Bewusst keine `UserDefaults`: Eine Playlist mit zehntausenden Einträgen und
/// ein XMLTV-Abbild gehören nicht in die Einstellungsdatei des Systems. Alles
/// hier bleibt auf dem Gerät; nichts davon wird an StreamingHub gesendet.
struct LocalStore {

    enum StoreError: LocalizedError {
        case writeFailed(String)

        var errorDescription: String? {
            switch self {
            case .writeFailed(let name): return "Die Datei „\(name)“ konnte nicht geschrieben werden."
            }
        }
    }

    private let directory: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder

    init(directory: URL? = nil) {
        let base = directory ?? FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("StreamingHub", isDirectory: true)
        self.directory = base
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        self.encoder = encoder

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    private func url(_ name: String) -> URL {
        directory.appendingPathComponent(name).appendingPathExtension("json")
    }

    private func read<T: Decodable>(_ type: T.Type, _ name: String) -> T? {
        guard let data = try? Data(contentsOf: url(name)) else { return nil }
        return try? decoder.decode(type, from: data)
    }

    private func write<T: Encodable>(_ value: T, _ name: String) throws {
        do {
            let data = try encoder.encode(value)
            try data.write(to: url(name), options: .atomic)
        } catch {
            throw StoreError.writeFailed(name)
        }
    }

    private func remove(_ name: String) {
        try? FileManager.default.removeItem(at: url(name))
    }

    // MARK: - Playlist

    func loadPlaylist() -> PlaylistCache {
        read(PlaylistCache.self, "playlist") ?? .empty
    }

    func savePlaylist(_ cache: PlaylistCache) throws {
        try write(cache, "playlist")
    }

    func clearPlaylist() {
        remove("playlist")
        remove("favorites")
        remove("progress")
    }

    // MARK: - Programm

    func loadProgrammes() -> ProgrammeCache {
        read(ProgrammeCache.self, "programmes") ?? .empty
    }

    func saveProgrammes(_ cache: ProgrammeCache) throws {
        try write(cache, "programmes")
    }

    func clearProgrammes() {
        remove("programmes")
    }

    // MARK: - Favoriten und Fortschritt

    func loadFavorites() -> Set<String> {
        Set(read([String].self, "favorites") ?? [])
    }

    func saveFavorites(_ favorites: Set<String>) {
        try? write(Array(favorites).sorted(), "favorites")
    }

    func loadPositions() -> [String: WatchPosition] {
        let stored = read([String: WatchPosition].self, "progress") ?? [:]
        return stored.filter { $0.value.positionMs > 0 }
    }

    func savePositions(_ positions: [String: WatchPosition]) {
        try? write(positions, "progress")
    }

    // MARK: - Einstellungen und Erinnerungen

    func loadSettings() -> Settings {
        read(Settings.self, "settings") ?? .standard
    }

    func saveSettings(_ settings: Settings) {
        try? write(settings, "settings")
    }

    func loadReminders() -> [Reminder] {
        read([Reminder].self, "reminders") ?? []
    }

    func saveReminders(_ reminders: [Reminder]) {
        try? write(reminders, "reminders")
    }
}
