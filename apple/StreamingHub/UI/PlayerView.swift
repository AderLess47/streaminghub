import AVKit
import Combine
import Network
import SwiftUI
import StreamingHubCore

/// Wiedergabe über AVPlayer.
///
/// HLS und progressive Dateien laufen hier ohne Zusatzpaket – das ist der
/// Unterschied zu Vega OS, wo HLS einen MSE-Player aus Amazons Shard-Paket
/// braucht. Der Fortschritt wird alle zehn Sekunden und beim Verlassen gespeichert.
struct PlayerView: View {
    @Environment(AppModel.self) private var model

    let channel: Channel

    @State private var player = AVPlayer()
    @State private var failure: String?
    @State private var timeObserver: Any?
    @State private var observations: Set<AnyCancellable> = []
    @State private var sourceURL: URL?
    @State private var retryAttempts = 0
    @State private var retryTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 0) {
            if let failure {
                VStack(spacing: 12) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                    Text("Wiedergabe nicht möglich")
                        .font(.headline)
                    Text(failure)
                        .font(.callout)
                        .multilineTextAlignment(.center)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 12) {
                        Button("Erneut versuchen") { retryNow() }
                            .buttonStyle(.borderedProminent)
                        Button("Zurück zur Senderliste") { close() }
                            .buttonStyle(.bordered)
                    }
                    .frame(minHeight: Theme.minimumTarget)
                }
                .padding(32)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                VideoPlayer(player: player)
                    .ignoresSafeArea(edges: .bottom)
            }

            HStack(spacing: 12) {
                Text(channel.name)
                    .font(.headline)
                    .lineLimit(1)
                Text(channel.group)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Schließen") { close() }
                    .buttonStyle(.bordered)
                    .frame(minHeight: Theme.minimumTarget)
            }
            .padding(16)
            .background(Theme.card)
        }
        .background(Color.black)
        .task { await prepare() }
        .onDisappear { teardown() }
    }

    private func prepare() async {
        guard let url = channel.playbackURL else {
            failure = "Die Adresse dieses Eintrags ist keine abspielbare URL. \(PlaybackFailureText.backHint)"
            DiagnosticsLog.shared.record("Eintrag ohne abspielbare URL.", level: .warn, area: "player")
            return
        }

        sourceURL = url
        await start(url: url)
    }

    /// Baut das Item neu auf. Wird auch benutzt, wenn nach einem Netzfehler
    /// automatisch oder per Knopf erneut gestartet wird.
    private func start(url: URL) async {
        observations.removeAll()
        if let timeObserver {
            player.removeTimeObserver(timeObserver)
            self.timeObserver = nil
        }

        let item = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: item)
        watch(item, url: url)
        #if !os(macOS)
        player.allowsExternalPlayback = true
        #endif

        let resume = model.resumePosition(for: channel)
        if resume > Double(ProgressRules.minimumPositionMs) / 1000 {
            await player.seek(to: CMTime(seconds: resume, preferredTimescale: 600))
        }
        player.play()

        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 10, preferredTimescale: 600),
            queue: .main
        ) { time in
            Task { @MainActor in
                let duration = player.currentItem?.duration.seconds ?? 0
                guard duration.isFinite, duration > 0 else { return }
                model.handleProgress(channel: channel, positionSeconds: time.seconds, durationSeconds: duration)
            }
        }
    }

    /// Beobachtet den Item-Status und das Ende-ohne-Wiedergabe-Ereignis. Ohne
    /// das bleibt ein Lizenz-, Netz- oder Codecfehler als schwarzes Bild stehen.
    private func watch(_ item: AVPlayerItem, url: URL) {
        item.publisher(for: \.status)
            .receive(on: DispatchQueue.main)
            .sink { status in
                switch status {
                case .readyToPlay:
                    // Läuft wieder: Der nächste Fehler darf erneut automatisch starten.
                    retryAttempts = 0
                case .failed:
                    presentFailure(item.error as NSError?, url: url, context: "status")
                default:
                    break
                }
            }
            .store(in: &observations)

        NotificationCenter.default
            .publisher(for: .AVPlayerItemFailedToPlayToEndTime, object: item)
            .receive(on: DispatchQueue.main)
            .sink { note in
                let error = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? NSError
                presentFailure(error, url: url, context: "failedToPlayToEndTime")
            }
            .store(in: &observations)
    }

    private func presentFailure(_ error: NSError?, url: URL, context: String) {
        DiagnosticsLog.shared.record(
            "Wiedergabe fehlgeschlagen (\(context)): \(error?.domain ?? "-") \(error?.code ?? 0)",
            level: .warn,
            area: "player"
        )

        let message = PlaybackFailureText.message(
            for: error,
            insecure: PlaybackFailureText.isInsecure(url)
        )
        let retryable = PlaybackRetry.isNetworkError(error) &&
            PlaybackRetry.canRetryAutomatically(attempts: retryAttempts)
        failure = retryable ? "\(message)\n\(PlaybackRetry.hint)" : message
        if retryable {
            scheduleAutoRetry(for: url)
        }
    }

    /// Wartet, bis ein Netz gemeldet wird, und startet die Wiedergabe dann ohne
    /// Zutun des Nutzers neu. Die Abfrage ist billig und endet mit der Ansicht.
    private func scheduleAutoRetry(for url: URL) {
        retryTask?.cancel()
        retryTask = Task { @MainActor in
            let monitor = NWPathMonitor()
            monitor.start(queue: DispatchQueue(label: "de.streaminghub.player.network"))
            defer { monitor.cancel() }

            while !Task.isCancelled, monitor.currentPath.status != .satisfied {
                try? await Task.sleep(nanoseconds: UInt64(PlaybackRetry.pollSeconds * 1_000_000_000))
            }

            guard !Task.isCancelled, failure != nil else { return }
            guard PlaybackRetry.canRetryAutomatically(attempts: retryAttempts) else { return }

            retryAttempts += 1
            failure = nil
            await start(url: url)
        }
    }

    private func retryNow() {
        guard let url = sourceURL else { return }
        retryTask?.cancel()
        retryAttempts = 0
        failure = nil
        Task { await start(url: url) }
    }

    private func close() {
        teardown()
        model.player = nil
    }

    private func teardown() {
        retryTask?.cancel()
        retryTask = nil
        observations.removeAll()
        if let timeObserver {
            player.removeTimeObserver(timeObserver)
            self.timeObserver = nil
        }
        let position = player.currentTime().seconds
        let duration = player.currentItem?.duration.seconds ?? 0
        if position.isFinite, duration.isFinite, duration > 0 {
            model.handleProgress(channel: channel, positionSeconds: position, durationSeconds: duration)
        }
        player.pause()
    }
}
