import Foundation

/// Beispielbibliothek für Store-Tests und zum Ausprobieren ohne eigene Playlist.
///
/// Öffentliche Testassets: HLS-Teststreams von Mux und Apple sowie offene Filme
/// der Blender Foundation (CC BY). Kein Sender, kein Filmstudio, keine dritte
/// Marke, keine personenbezogenen Daten.
public enum DemoLibrary {

    public static let sourceLabel = "Demo-Inhalte"

    public struct DemoChannel: Sendable {
        public let id: String
        public let name: String
        public let url: String
    }

    public static let live: [DemoChannel] = [
        DemoChannel(id: "demo.live.one", name: "Demo Live Eins",
                    url: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"),
        DemoChannel(id: "demo.live.two", name: "Demo Live Zwei",
                    url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8"),
        DemoChannel(id: "demo.live.three", name: "Demo Live Drei",
                    url: "https://test-streams.mux.dev/pts_shift/master.m3u8")
    ]

    private static let movies: [DemoChannel] = [
        DemoChannel(id: "demo.movie.one", name: "Demo Film: Tears of Steel",
                    url: "https://test-streams.mux.dev/tos_ismc/main.m3u8"),
        DemoChannel(id: "demo.movie.two", name: "Demo Film: Big Buck Bunny",
                    url: "https://media.w3.org/2010/05/bunny/trailer.mp4")
    ]

    private static let series = DemoChannel(
        id: "demo.series.one",
        name: "Demo Serie: Sintel Trailer",
        url: "https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4"
    )

    /// Erweiterte M3U-Quelle, die der normale Parser liest.
    public static var playlist: String {
        var lines = ["#EXTM3U"]
        for channel in live {
            lines.append("#EXTINF:-1 tvg-id=\"\(channel.id)\" group-title=\"Demo Live\",\(channel.name)")
            lines.append(channel.url)
        }
        for channel in movies {
            lines.append("#EXTINF:-1 tvg-id=\"\(channel.id)\" group-title=\"Demo Filme\",\(channel.name)")
            lines.append(channel.url)
        }
        lines.append("#EXTINF:-1 tvg-id=\"\(series.id)\" group-title=\"Demo Serien\",\(series.name)")
        lines.append(series.url)
        return lines.joined(separator: "\n")
    }

    public static var channels: [Channel] { M3UParser.parse(playlist) }

    /// Programmdaten relativ zur aktuellen Zeit, damit der Führer immer eine
    /// laufende und eine folgende Sendung zeigt.
    public static func programmes(now: Date = Date()) -> [Programme] {
        let slots: [(Int64, Int64, String)] = [
            (-75, -15, "Demo: Rückblick"),
            (-15, 25, "Demo: Jetzt"),
            (25, 65, "Demo: Danach")
        ]
        let base = Int64(now.timeIntervalSince1970 * 1000)
        let minute: Int64 = 60_000

        return live.enumerated().flatMap { channelIndex, channel in
            slots.enumerated().map { slotIndex, slot in
                let (from, to, prefix) = slot
                return Programme(
                    channelID: channel.id,
                    channelName: channel.name,
                    startMs: base + from * minute,
                    stopMs: base + to * minute,
                    title: "\(prefix) \(channelIndex + 1).\(slotIndex + 1)",
                    detail: "Beispielsendung für Store-Tests. Kein echter Sender, keine echten Programmdaten."
                )
            }
        }
        .sorted { $0.startMs < $1.startMs }
    }
}
