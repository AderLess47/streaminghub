import XCTest
@testable import StreamingHubCore

final class PlaybackRetryTests: XCTestCase {

    private func urlError(_ code: Int) -> NSError {
        NSError(domain: NSURLErrorDomain, code: code)
    }

    func testConnectionProblemsAreRetryable() {
        XCTAssertTrue(PlaybackRetry.isNetworkError(urlError(-1009)))
        XCTAssertTrue(PlaybackRetry.isNetworkError(urlError(-1001)))
        XCTAssertTrue(PlaybackRetry.isNetworkError(urlError(-1004)))
        XCTAssertTrue(PlaybackRetry.isNetworkError(urlError(-1005)))
    }

    func testOtherFailuresAreNotRetried() {
        XCTAssertFalse(PlaybackRetry.isNetworkError(urlError(-1022))) // ATS
        XCTAssertFalse(PlaybackRetry.isNetworkError(urlError(-11828)))
        XCTAssertFalse(PlaybackRetry.isNetworkError(NSError(domain: "AVFoundationErrorDomain", code: -11828)))
        XCTAssertFalse(PlaybackRetry.isNetworkError(nil))
    }

    func testStopsAfterFourAttempts() {
        XCTAssertTrue(PlaybackRetry.canRetryAutomatically(attempts: 0))
        XCTAssertTrue(PlaybackRetry.canRetryAutomatically(attempts: 3))
        XCTAssertFalse(PlaybackRetry.canRetryAutomatically(attempts: PlaybackRetry.maxAutoRetries))
    }

    func testHintAndInterval() {
        XCTAssertTrue(PlaybackRetry.hint.contains("automatisch"))
        XCTAssertEqual(5, PlaybackRetry.pollSeconds)
    }
}
