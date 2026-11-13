import Foundation
import Observation
import StreamingHubCore

/// Zustand und Aktionen der App.
///
/// Die Oberfläche liest hier nur; alle Schreibvorgänge laufen über die Methoden,
/// damit lokale Ablage, Schlüsselbund und Server nie auseinanderlaufen.
@MainActor
@Observable
final class AppModel {

    // MARK: - Daten

    private(set) var channels: [Channel] = []
    private(set) var programmes: [Programme] = []
    private(set) var favorites: Set<String> = []
    private(set) var positions: [String: WatchPosition] = [:]
    private(set) var reminders: [Reminder] = []
    private(set) var settings: Settings = .standard
    private(set) var account: Account?
    private(set) var sourceLabel = ""
    private(set) var sourceURL: String?
    private(set) var playlistUpdatedAt: Date?
    private(set) var epgUpdatedAt: Date?
    private(set) var isPaired = false

    // MARK: - Oberflächenzustand

    var notice: String?
    var errorMessage: String?
    private(set) var busy: String?
    var player: Channel?
    var showingPairing = false
    var kindFilter: MediaKind?

    let premium = PremiumStore()

    // MARK: - Abhängigkeiten

    private let api = StreamingHubAPI()
    private let store = LocalStore()
    private let reminderScheduler = ReminderScheduler()
    private var token: String?
    private var appliedManagedURL: String?
    private let appVersion = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"

    var categories: [String] { M3UParser.groups(in: filteredByKind) }

    var filteredByKind: [Channel] {
        guard let kindFilter else { return channels }
        return channels.filter { $0.kind == kindFilter }
    }

    var continueWatching: [Channel] {
        positions
            .filter { $0.value.positionMs > ProgressRules.minimumPositionMs }
            .sorted { $0.value.updatedAt ?? .distantPast > $1.value.updatedAt ?? .distantPast }
            .compactMap { entry in channels.first { $0.url == entry.key } }
    }

    var favoriteChannels: [Channel] {
        channels.filter { favorites.contains($0.url) }
    }

    // MARK: - Start

    func bootstrap() async {
        let cachedPlaylist = store.loadPlaylist()
        let cachedProgrammes = store.loadProgrammes()
        favorites = store.loadFavorites()
        positions = store.loadPositions()
        settings = store.loadSettings()
        reminders = store.loadReminders()
        token = KeychainToken.load()
        isPaired = token != nil

        if settings.demoMode {
            channels = DemoLibrary.channels
            programmes = DemoLibrary.programmes()
            sourceLabel = DemoLibrary.sourceLabel
            sourceURL = nil
        } else {
            channels = cachedPlaylist.channels
            programmes = cachedProgrammes.programmes
            sourceLabel = cachedPlaylist.sourceLabel
            sourceURL = cachedPlaylist.sourceURL
            playlistUpdatedAt = cachedPlaylist.updatedAt
            epgUpdatedAt = cachedProgrammes.updatedAt
        }

        reminderScheduler.cancelOutdated(reminders)

        // Der Server prüft die signierte Transaktion gegen Apples Wurzelzertifikat;
        // die App schaltet nichts selbst frei.
        let api = self.api
        premium.configure(verifier: { jws, _ in
            guard let token = KeychainToken.load() else {
                throw PurchaseError.notPaired
            }
            return try await api.verifyApplePurchase(token: token, jws: jws)
        })
        await premium.load()
        await refreshAccount()
    }

    // MARK: - Playlist

    func importPlaylist(from address: String) async {
        guard let url = Self.normalizedURL(address) else {
            errorMessage = "Bitte eine vollständige Adresse angeben, zum Beispiel https://anbieter.example/playlist.m3u"
            return
        }
        busy = "playlist"
        defer { busy = nil }
        do {
            let text = try await download(url)
            let parsed = M3UParser.parse(text)
            guard !parsed.isEmpty else {
                errorMessage = "Die Datei enthielt keine lesbaren Einträge."
                return
            }

            let cache = PlaylistCache(
                channels: parsed,
                sourceURL: url.absoluteString,
                sourceLabel: url.host ?? url.absoluteString,
                updatedAt: Date()
            )
            try store.savePlaylist(cache)
            channels = parsed
            sourceURL = cache.sourceURL
            sourceLabel = cache.sourceLabel
            playlistUpdatedAt = cache.updatedAt
            settings.demoMode = false
            store.saveSettings(settings)
            appliedManagedURL = nil
            notice = "\(parsed.count) Einträge geladen."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func loadDemo() {
        let demo = DemoLibrary.channels
        channels = demo
        programmes = DemoLibrary.programmes()
        sourceLabel = DemoLibrary.sourceLabel
        sourceURL = nil
        playlistUpdatedAt = Date()
        appliedManagedURL = nil
        settings.demoMode = true
        store.saveSettings(settings)
        notice = "Demo-Inhalte geladen: öffentliche Teststreams, keine echten Sender."
    }

    func removePlaylist() {
        store.clearPlaylist()
        channels = []
        favorites = []
        positions = {}
        sourceLabel = ""
        sourceURL = nil
        playlistUpdatedAt = nil
        settings.demoMode = false
        store.saveSettings(settings)
        notice = "Playlist entfernt."
    }

    // MARK: - Programmdaten

    func importProgrammes(from address: String) async {
        guard let url = Self.normalizedURL(address) else {
            errorMessage = "Bitte eine vollständige Adresse der XMLTV-Datei angeben."
            return
        }
        busy = "epg"
        defer { busy = nil }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let parsed = XMLTVParser.parse(data)
            guard !parsed.isEmpty else {
                errorMessage = "Die XMLTV-Datei enthielt keine lesbaren Sendungen."
                return
            }
            let cache = ProgrammeCache(programmes: parsed, sourceURL: url.absoluteString, updatedAt: Date())
            try store.saveProgrammes(cache)
            programmes = parsed
            epgUpdatedAt = cache.updatedAt
            notice = "\(parsed.count) Sendungen geladen."
        } catch {
            errorMessage = "Die Programmdaten konnten nicht geladen werden: \(error.localizedDescription)"
        }
    }

    func removeProgrammes() {
        store.clearProgrammes()
        programmes = []
        epgUpdatedAt = nil
        notice = "Programmdaten entfernt."
    }

    // MARK: - Favoriten, Fortschritt, Erinnerungen

    func toggleFavorite(_ channel: Channel) {
        if favorites.contains(channel.url) {
            favorites.remove(channel.url)
        } else {
            favorites.insert(channel.url)
        }
        store.saveFavorites(favorites)
    }

    func resumePosition(for channel: Channel) -> Double {
        guard let stored = positions[channel.url] else { return 0 }
        return Double(stored.positionMs) / 1000
    }

    func handleProgress(channel: Channel, positionSeconds: Double, durationSeconds: Double) {
        let positionMs = Int64(max(0, positionSeconds) * 1000)
        let durationMs = Int64(max(0, durationSeconds) * 1000)
        guard durationMs > 0 else { return }

        if ProgressRules.shouldStore(positionMs: positionMs, durationMs: durationMs) {
            positions[channel.url] = WatchPosition(
                url: channel.url,
                positionMs: positionMs,
                durationMs: durationMs,
                updatedAt: Date()
            )
        } else {
            positions.removeValue(forKey: channel.url)
        }
        store.savePositions(positions)

        // Fortsetzen auf anderen Geräten ist ein Premium-Zusatz; lokal ist der
        // Stand bereits gespeichert, ein Fehler hier darf nichts kaputt machen.
        if let token, account?.premiumActive == true {
            let api = self.api
            let url = channel.url
            Task {
                try? await api.saveWatchProgress(token: token, url: url, positionMs: positionMs, durationMs: durationMs)
            }
        }
    }

    func isReminderSet(_ programme: Programme) -> Bool {
        ReminderRules.contains(reminders, programme: programme)
    }

    func removeReminder(_ reminder: Reminder) {
        reminderScheduler.cancel(reminder)
        reminders.removeAll { $0.id == reminder.id }
        store.saveReminders(reminders)
        notice = "Erinnerung für „\(reminder.title)“ entfernt."
    }

    func toggleReminder(_ programme: Programme) async {
        if let existing = reminders.first(where: { $0.id == programme.id }) {
            reminderScheduler.cancel(existing)
            reminders.removeAll { $0.id == programme.id }
            store.saveReminders(reminders)
            notice = "Erinnerung für „\(programme.title)“ entfernt."
            return
        }

        guard ReminderRules.canSchedule(programme) else {
            errorMessage = "Diese Sendung hat bereits begonnen."
            return
        }
        let reminder = Reminder(programme: programme)
        do {
            try await reminderScheduler.schedule(reminder)
            reminders.append(reminder)
            reminders.sort { $0.startMs < $1.startMs }
            store.saveReminders(reminders)
            notice = "Erinnerung für „\(programme.title)“ vorgemerkt."
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    // MARK: - Konto

    func refreshAccount() async {
        guard let token else {
            account = nil
            return
        }
        do {
            let info = try await api.me(token: token)
            account = info
            if let managed = info.playlist?.url,
               managed != sourceURL,
               managed != appliedManagedURL {
                appliedManagedURL = managed
                await applyManagedPlaylist(managed)
            }
        } catch let error as StreamingHubAPI.APIError where error.status == 401 || error.status == 403 {
            await unpair(silently: true)
            errorMessage = error.message
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func applyManagedPlaylist(_ address: String) async {
        guard let url = Self.normalizedURL(address) else { return }
        do {
            let text = try await download(url)
            let parsed = M3UParser.parse(text)
            guard !parsed.isEmpty else { return }
            let cache = PlaylistCache(
                channels: parsed,
                sourceURL: url.absoluteString,
                sourceLabel: "Vom Konto hinterlegt",
                updatedAt: Date()
            )
            try store.savePlaylist(cache)
            channels = parsed
            sourceURL = cache.sourceURL
            sourceLabel = cache.sourceLabel
            playlistUpdatedAt = cache.updatedAt
            notice = "Die im Konto hinterlegte Playlist wurde geladen."
        } catch {
            errorMessage = "Die im Konto hinterlegte Playlist konnte nicht geladen werden: \(error.localizedDescription)"
        }
    }

    func activate(with newToken: String) async {
        KeychainToken.save(newToken)
        token = newToken
        isPaired = true
        showingPairing = false
        notice = "Gerät gekoppelt."
        await refreshAccount()
    }

    func unpair(silently: Bool = false) async {
        KeychainToken.clear()
        token = nil
        account = nil
        isPaired = false
        if !silently {
            notice = "Kopplung aufgehoben. Die Playlist bleibt auf dem Gerät."
        }
    }

    /// Kauf abschließen: StoreKit liefert die Transaktion, der Server bestätigt
    /// sie. Danach wird der Kontostatus nachgezogen, damit die Anzeige stimmt.
    func purchasePremium() async {
        await premium.purchase()
        if case .active = premium.state {
            await refreshAccount()
        }
    }

    enum PurchaseError: LocalizedError {
        case notPaired

        var errorDescription: String? {
            "Bitte koppele das Gerät zuerst, damit der Kauf einem Konto zugeordnet werden kann."
        }
    }

    // MARK: - Einstellungen

    func toggleLowSpec() {
        settings.lowSpec.toggle()
        store.saveSettings(settings)
    }

    func clearProgress() {
        positions = [:]
        store.savePositions([:])
        notice = "Wiedergabestand gelöscht."
    }

    var deviceName: String {
        #if os(macOS)
        return Host.current().localizedName ?? "Mac"
        #else
        return "iPhone oder iPad"
        #endif
    }

    /// `docs/API.md` kennt die Plattformwerte `firetv`, `androidtv`, `android`,
    /// `ios` und `web`. Einen macOS-Wert gibt es noch nicht, deshalb meldet sich
    /// der Mac als `ios` – eine Erweiterung der API wäre der saubere Weg.
    var platform: String { "ios" }

    // MARK: - Hilfen

    private func download(_ url: URL) async throws -> String {
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.setValue("StreamingHub/1.0 (Apple)", forHTTPHeaderField: "User-Agent")
        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
            throw URLError(.badServerResponse)
        }
        guard let text = String(data: data, encoding: .utf8) ?? String(data: data, encoding: .isoLatin1) else {
            throw URLError(.cannotDecodeContentData)
        }
        return text
    }

    private static func normalizedURL(_ address: String) -> URL? {
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() else { return nil }
        return ["http", "https"].contains(scheme) ? url : nil
    }
}
