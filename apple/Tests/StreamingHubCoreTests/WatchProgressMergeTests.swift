import XCTest
@testable import StreamingHubCore

final class WatchProgressMergeTests: XCTestCase {

    private func local(_ url: String, _ positionMs: Int64, durationMs: Int64 = 600_000) -> [String: WatchPosition] {
        [url: WatchPosition(url: url, positionMs: positionMs, durationMs: durationMs)]
    }

    func testRemoteFurtherAheadWins() {
        let merged = WatchProgressMerge.merge(
            local("a", 10_000),
            remote: [.init(url: "a", positionMs: 90_000, durationMs: 600_000)]
        )
        XCTAssertEqual(merged["a"]?.positionMs, 90_000)
    }

    func testLocalFurtherAheadIsKept() {
        let merged = WatchProgressMerge.merge(
            local("a", 120_000),
            remote: [.init(url: "a", positionMs: 90_000, durationMs: 600_000)]
        )
        XCTAssertEqual(merged["a"]?.positionMs, 120_000)
    }

    func testUnknownTitleIsAdded() {
        let merged = WatchProgressMerge.merge(
            [:],
            remote: [.init(url: "b", positionMs: 30_000, durationMs: 600_000)]
        )
        XCTAssertEqual(merged["b"]?.positionMs, 30_000)
        XCTAssertEqual(merged["b"]?.durationMs, 600_000)
    }

    func testEntriesWithoutDurationAreIgnored() {
        let merged = WatchProgressMerge.merge(
            [:],
            remote: [
                .init(url: "live", positionMs: 30_000, durationMs: 0),
                .init(url: "start", positionMs: 0, durationMs: 600_000),
            ]
        )
        XCTAssertTrue(merged.isEmpty)
    }

    func testLocalEntriesWithoutRemoteStay() {
        let merged = WatchProgressMerge.merge(
            local("a", 10_000),
            remote: []
        )
        XCTAssertEqual(merged["a"]?.positionMs, 10_000)
    }

    func testRemoteTimestampIsCarriedOver() {
        let stamp = Date(timeIntervalSince1970: 1_760_000_000)
        let merged = WatchProgressMerge.merge(
            [:],
            remote: [.init(url: "a", positionMs: 50_000, durationMs: 600_000, updatedAt: stamp)]
        )
        XCTAssertEqual(merged["a"]?.updatedAt, stamp)
    }
}
