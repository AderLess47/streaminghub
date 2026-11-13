import XCTest
@testable import StreamingHubCore

/// Prüfungen für die Teile, die ohne Gerät und ohne Oberfläche entscheidbar sind.
/// Sie spiegeln die Fälle, die auch im Vega-Client geprüft wurden, damit beide
/// Apps dieselbe Datei gleich lesen.
final class ParserTests: XCTestCase {

    // MARK: - M3U

    private let m3u = """
    \u{FEFF}#EXTM3U
    #EXTINF:-1 tvg-id="ard.de" tvg-logo="https://x/logo.png" group-title="Nachrichten",Tagesschau
    http://example.test/live/ard.m3u8
    #EXTGRP:Sport
    #EXTINF:-1,Sport Eins
    http://example.test/live/sport.m3u8
    #EXTINF:-1 group-title="Filme",Ein Film (2024)
    http://example.test/movie/film.mp4
    #EXTINF:-1 group-title="Serien",Staffel 1 Folge 2
    http://example.test/series/s1e2.mkv
    #EXTINF:-1,Doppelt
    http://example.test/live/ard.m3u8
    """

    func testParsesUniqueChannelsWithAttributes() {
        let channels = M3UParser.parse(m3u)
        XCTAssertEqual(channels.count, 4, "doppelte URL muss entfernt werden")
        XCTAssertEqual(channels[0].name, "Tagesschau")
        XCTAssertEqual(channels[0].group, "Nachrichten")
        XCTAssertEqual(channels[0].tvgID, "ard.de")
        XCTAssertEqual(channels[0].logo, "https://x/logo.png")
        XCTAssertEqual(channels[0].kind, .live)
    }

    func testUsesExtendedGroupAsFallback() {
        let channels = M3UParser.parse(m3u)
        XCTAssertEqual(channels[1].group, "Sport")
    }

    func testInfersKind() {
        let channels = M3UParser.parse(m3u)
        XCTAssertEqual(channels[2].kind, .movie)
        XCTAssertEqual(channels[3].kind, .series)
        XCTAssertEqual(M3UParser.inferKind(name: "Kanal", group: "TV", url: "http://x/live/a.m3u8"), .live)
    }

    func testGroupsKeepOrder() {
        let channels = M3UParser.parse(m3u)
        XCTAssertEqual(M3UParser.groups(in: channels), ["Nachrichten", "Sport", "Filme", "Serien"])
    }

    func testSkipsLinesWithoutName() {
        let channels = M3UParser.parse("#EXTM3U\nhttp://example.test/a.m3u8")
        XCTAssertEqual(channels.count, 1)
        XCTAssertEqual(channels[0].name, "a.m3u8")
        XCTAssertEqual(channels[0].group, "Ohne Kategorie")
    }

    func testPlaybackURLRejectsUnknownSchemes() {
        XCTAssertNil(Channel(name: "x", url: "javascript:alert(1)").playbackURL)
        XCTAssertNotNil(Channel(name: "x", url: "https://example.test/a.m3u8").playbackURL)
        XCTAssertTrue(Channel(name: "x", url: "https://example.test/a.m3u8?token=1").isAdaptive)
    }

    // MARK: - XMLTV

    private let xml = """
    <?xml version="1.0" encoding="UTF-8"?>
    <tv>
      <channel id="ard.de"><display-name>Das Erste &amp; Co</display-name></channel>
      <programme start="20261112200000 +0100" stop="20261112203000 +0100" channel="ard.de">
        <title>Tagesschau &amp; Wetter</title><desc>Nachrichten</desc>
      </programme>
      <programme start="20261112203000 +0100" stop="20261112201500 +0100" channel="ard.de">
        <title>Ungültig, Ende vor Start</title>
      </programme>
      <programme start="20261112210000 +0100" stop="20261112220000 +0100" channel="unbekannt">
        <title>Ohne Kanalnamen</title>
      </programme>
    </tv>
    """

    func testParsesValidProgrammesOnly() {
        let programmes = XMLTVParser.parse(xml)
        XCTAssertEqual(programmes.count, 2)
        XCTAssertEqual(programmes[0].title, "Tagesschau & Wetter")
        XCTAssertEqual(programmes[0].channelName, "Das Erste & Co")
        XCTAssertEqual(programmes[0].detail, "Nachrichten")
        XCTAssertEqual(programmes[1].channelName, "unbekannt")
    }

    func testSortsByStart() {
        let programmes = XMLTVParser.parse(xml)
        XCTAssertLessThan(programmes[0].startMs, programmes[1].startMs)
    }

    func testTimeWithAndWithoutZone() {
        // 2026-11-12 20:30:00 +0100 ist 19:30 UTC.
        XCTAssertEqual(XMLTVParser.time(from: "20261112203000 +0100"), 1_794_511_800_000)
        // Ohne Zone gilt die Zeit als UTC.
        XCTAssertEqual(XMLTVParser.time(from: "20261112203000"), 1_794_515_400_000)
        XCTAssertNil(XMLTVParser.time(from: "kaputt"))
    }

    func testRunningAndNext() {
        let programmes = XMLTVParser.parse(xml)
        // 19:33 UTC liegt in der Sendung von 19:30 bis 20:00 UTC.
        let during = Date(timeIntervalSince1970: 1_794_512_000)
        XCTAssertEqual(EPG.running(programmes, channelID: "ard.de", at: during)?.title, "Tagesschau & Wetter")
        XCTAssertEqual(EPG.next(programmes, channelID: "unbekannt", after: during)?.title, "Ohne Kanalnamen")
    }

    // MARK: - Regeln

    func testProgressRules() {
        XCTAssertFalse(ProgressRules.shouldStore(positionMs: 1_000, durationMs: 600_000))
        XCTAssertFalse(ProgressRules.shouldStore(positionMs: 100_000, durationMs: 0))
        XCTAssertFalse(ProgressRules.shouldStore(positionMs: 595_000, durationMs: 600_000))
        XCTAssertTrue(ProgressRules.shouldStore(positionMs: 100_000, durationMs: 600_000))
    }

    func testResumeTakesLaterPosition() {
        XCTAssertEqual(ProgressRules.resumePosition(local: 120_000, remote: 300_000), 300_000)
        XCTAssertEqual(ProgressRules.resumePosition(local: 400_000, remote: 300_000), 400_000)
        XCTAssertEqual(ProgressRules.resumePosition(local: nil, remote: nil), 0)
    }

    func testReminderOnlyForFutureProgrammes() {
        let now = Date()
        let future = Programme(channelID: "a", channelName: "A", startMs: Int64(now.timeIntervalSince1970 * 1000) + 60_000, stopMs: Int64(now.timeIntervalSince1970 * 1000) + 120_000, title: "Später")
        let past = Programme(channelID: "a", channelName: "A", startMs: Int64(now.timeIntervalSince1970 * 1000) - 60_000, stopMs: Int64(now.timeIntervalSince1970 * 1000) + 60_000, title: "Läuft")

        XCTAssertTrue(ReminderRules.canSchedule(future, at: now))
        XCTAssertFalse(ReminderRules.canSchedule(past, at: now))
        XCTAssertNotNil(ReminderRules.nextFireDate(for: Reminder(programme: future), now: now))
        XCTAssertNil(ReminderRules.nextFireDate(for: Reminder(programme: past), now: now))
    }

    // MARK: - Demo

    func testDemoLibraryIsParseableAndRelative() {
        let channels = M3UParser.parse(DemoLibrary.playlist)
        XCTAssertEqual(channels.count, 6)
        XCTAssertEqual(Set(channels.map(\.kind)), [.live, .movie, .series])

        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let programmes = DemoLibrary.programmes(now: now)
        XCTAssertEqual(programmes.count, 9)
        XCTAssertTrue(programmes.contains { $0.isRunning(at: now) }, "Demo muss eine laufende Sendung enthalten")
        XCTAssertTrue(programmes.contains { $0.startMs > Int64(now.timeIntervalSince1970 * 1000) })
    }
}
