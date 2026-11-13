import SwiftUI
import StreamingHubCore

/// Einstellungen: Konto, Premium, Playlist, Programmdaten, Darstellung, Daten.
struct SettingsView: View {
    @Environment(AppModel.self) private var model

    @State private var playlistAddress = ""
    @State private var epgAddress = ""
    @State private var localError: String?

    var body: some View {
        Form {
            accountSection
            premiumSection
            playlistSection
            programmeSection
            presentationSection
            dataSection
            aboutSection
        }
        #if !os(tvOS)
        .formStyle(.grouped)
        #endif
        .navigationTitle("Einstellungen")
        .alert("Nicht ausgeführt", isPresented: Binding(
            get: { localError != nil },
            set: { if !$0 { localError = nil } }
        )) {
            Button("OK", role: .cancel) { localError = nil }
        } message: {
            Text(localError ?? "")
        }
    }

    // MARK: - Konto

    private var accountSection: some View {
        Section {
            HStack(spacing: 8) {
                StatusBadge(text: model.isPaired ? "Gekoppelt" : "Nicht gekoppelt",
                            tone: model.isPaired ? .positive : .neutral)
                StatusBadge(text: model.account?.premiumActive == true ? "Premium aktiv" : "Kein Premium",
                            tone: model.account?.premiumActive == true ? .positive : .neutral)
            }
            .padding(.vertical, 2)

            LabeledContent("Gerät", value: model.account?.deviceName ?? model.deviceName)
            if let account = model.account {
                LabeledContent("Konto", value: account.email)
                LabeledContent("Abo", value: "\(account.subscriptionStatus) · Kanal \(account.channel)")
                LabeledContent("Verlängert bis", value: account.currentPeriodEnd ?? "—")
            } else {
                Text("Ohne Kopplung bleiben Playlist, Programmdaten und Fortschritt ausschließlich auf diesem Gerät.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            if model.isPaired {
                Button("Status aktualisieren") {
                    Task { await model.refreshAccount() }
                }
                Button("Kopplung aufheben", role: .destructive) {
                    Task { await model.unpair() }
                }
            } else {
                Button("Gerät koppeln") { model.showingPairing = true }
                    .buttonStyle(.borderedProminent)
            }
        } header: {
            Text("Konto")
        } footer: {
            Text("Die Kopplung ordnet dieses Gerät deinem Konto zu. Playlist-Inhalte werden dabei nicht übertragen.")
        }
    }

    // MARK: - Premium

    private var premiumSection: some View {
        Section {
            Text(premiumText)
                .font(.callout)

            switch model.premium.state {
            case .ready:
                Button("Kauf starten") {
                    Task { await model.purchasePremium() }
                }
                .buttonStyle(.borderedProminent)
            case .pending:
                Text("Der Kauf wartet auf die Bestätigung. Die Freischaltung erfolgt erst nach der Serverprüfung.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            default:
                EmptyView()
            }

            Button("Abo-Status prüfen") {
                Task { await model.refreshAccount() }
            }
        } header: {
            Text("Premium")
        } footer: {
            Text("Premium wird über den App Store abgerechnet. In einem App-Store-Build ist kein Verweis auf einen externen Checkout zulässig.")
        }
    }

    private var premiumText: String {
        switch model.premium.state {
        case .loading:
            return "Abo-Status wird geladen …"
        case .unavailable(let reason):
            return "Kauf derzeit nicht möglich: \(reason)"
        case .ready(let price):
            return "Kauf möglich für \(price)."
        case .purchasing:
            return "Kauf läuft …"
        case .pending:
            return "Der Kauf wartet auf die Bestätigung."
        case .active(let until):
            return "Premium aktiv\(until.map { " bis \($0)" } ?? "")."
        case .error(let message):
            return message
        }
    }

    // MARK: - Playlist

    private var playlistSection: some View {
        Section {
            LabeledContent("Quelle", value: model.sourceLabel.isEmpty ? "Keine" : model.sourceLabel)
            LabeledContent("Einträge", value: "\(model.channels.count)")
            if let updated = model.playlistUpdatedAt {
                LabeledContent("Geladen", value: updated.formatted(date: .abbreviated, time: .shortened))
            }

            TextField("https://anbieter.example/playlist.m3u", text: $playlistAddress)
                .textContentType(.URL)
                #if os(iOS)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                #endif
                .autocorrectionDisabled()
                .accessibilityLabel("Adresse der M3U-Playlist")

            Button(model.busy == "playlist" ? "Lädt …" : "Playlist laden") {
                Task {
                    if playlistAddress.isPlausibleURL {
                        await model.importPlaylist(from: playlistAddress)
                    } else {
                        localError = "Bitte eine vollständige Adresse angeben, zum Beispiel https://anbieter.example/playlist.m3u"
                    }
                }
            }
            .disabled(model.busy != nil || !playlistAddress.isPlausibleURL)

            Button("Demo-Inhalte laden") { model.loadDemo() }
            Button("Playlist entfernen", role: .destructive) { model.removePlaylist() }
                .disabled(model.channels.isEmpty)
        } header: {
            Text("Playlist")
        } footer: {
            Text("StreamingHub stellt keine Sender, Filme oder Playlists bereit. Du importierst ausschließlich deine eigenen, rechtmäßig zugänglichen Quellen.")
        }
    }

    // MARK: - Programmdaten

    private var programmeSection: some View {
        Section {
            LabeledContent("Sendungen", value: "\(model.programmes.count)")
            if let updated = model.epgUpdatedAt {
                LabeledContent("Geladen", value: updated.formatted(date: .abbreviated, time: .shortened))
            }

            TextField("https://anbieter.example/epg.xml", text: $epgAddress)
                .textContentType(.URL)
                #if os(iOS)
                .keyboardType(.URL)
                .textInputAutocapitalization(.never)
                #endif
                .autocorrectionDisabled()
                .accessibilityLabel("Adresse der XMLTV-Datei")

            Button(model.busy == "epg" ? "Lädt …" : "Programmdaten laden") {
                Task {
                    if epgAddress.isPlausibleURL {
                        await model.importProgrammes(from: epgAddress)
                    } else {
                        localError = "Bitte eine vollständige Adresse der XMLTV-Datei angeben."
                    }
                }
            }
            .disabled(model.busy != nil || !epgAddress.isPlausibleURL)

            Button("Programmdaten entfernen", role: .destructive) { model.removeProgrammes() }
                .disabled(model.programmes.isEmpty)
        } header: {
            Text("Programmdaten")
        } footer: {
            Text("XMLTV wird nur auf diesem Gerät gelesen. Der Senderbezug läuft über die tvg-id der Playlist.")
        }
    }

    // MARK: - Darstellung

    private var presentationSection: some View {
        Section {
            Toggle("Low-Spec-Modus", isOn: Binding(
                get: { model.settings.lowSpec },
                set: { _ in model.toggleLowSpec() }
            ))
            Text("Kürzt lange Listen und lädt keine Logos – für ältere Geräte und wenig Speicher.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } header: {
            Text("Darstellung")
        }
    }

    // MARK: - Daten

    private var dataSection: some View {
        Section {
            Button("Wiedergabestand löschen", role: .destructive) { model.clearProgress() }
                .disabled(model.positions.isEmpty)
        } header: {
            Text("Daten auf diesem Gerät")
        } footer: {
            Text("Playlist, Programmdaten, Favoriten und Wiedergabestände liegen lokal. Das Löschen des Fortschritts entfernt keine Playlist.")
        }
    }

    private var aboutSection: some View {
        Section {
            LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
            LabeledContent("Plattform", value: model.platform)
        } header: {
            Text("Über")
        } footer: {
            Text("StreamingHub ist eine App zur Wiedergabe eigener Quellen, kein Inhaltsangebot.")
        }
    }
}
