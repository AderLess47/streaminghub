import AVKit
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
                    Button("Schließen") { model.player = nil }
                        .buttonStyle(.borderedProminent)
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
            failure = "Die Adresse dieses Eintrags ist keine abspielbare URL."
            return
        }

        let item = AVPlayerItem(url: url)
        player.replaceCurrentItem(with: item)
        #if !os(macOS)
        player.allowsExternalPlayback = true
        #endif

        let resume = model.resumePosition(for: channel)
        if resume > ProgressRules.minimumPositionMs / 1000 {
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

    private func close() {
        teardown()
        model.player = nil
    }

    private func teardown() {
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
