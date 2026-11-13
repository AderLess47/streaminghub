import XCTest
@testable import StreamingHubCore

/// Prüft die Fehlertexte, die der Player bei gescheiterter Wiedergabe zeigt.
/// Alles hier ist ohne Gerät entscheidbar; das tatsächliche AVPlayer-Verhalten
/// kann nur ein Lauf auf Apple-Hardware zeigen.
final class PlaybackFailureTests: XCTestCase {

    // Rohe URLError-Codes: auf der Linux-CI nicht alle als Konstante vorhanden.
    private enum UrlError {
        static let notConnected = -1009
        static let timedOut = -1001
        static let cannotFindHost = -1003
        static let secureConnectionFailed = -1200
        static let appTransportSecurity = -1022
    }

    private func urlError(_ code: Int) -> NSError {
        NSError(domain: NSURLErrorDomain, code: code)
    }

    func testNetworkFailuresGetPlainGermanMessages() {
        XCTAssertTrue(
            PlaybackFailureText.message(for: urlError(UrlError.notConnected))
                .contains("keine Internetverbindung")
        )
        XCTAssertTrue(
            PlaybackFailureText.message(for: urlError(UrlError.timedOut))
                .contains("nicht rechtzeitig geantwortet")
        )
        XCTAssertTrue(
            PlaybackFailureText.message(for: urlError(UrlError.cannotFindHost))
                .contains("nicht erreichbar")
        )
        XCTAssertTrue(
            PlaybackFailureText.message(for: urlError(UrlError.secureConnectionFailed))
                .contains("Zertifikat oder TLS")
        )
    }

    func testAppTransportSecurityIsNamed() {
        let message = PlaybackFailureText.message(
            for: urlError(UrlError.appTransportSecurity)
        )
        XCTAssertTrue(message.contains("App Transport Security"))
        XCTAssertTrue(message.contains("HTTPS"))
    }

    func testUnsupportedFormatIsExplained() {
        let error = NSError(domain: "AVFoundationErrorDomain", code: -11828)
        XCTAssertTrue(
            PlaybackFailureText.message(for: error).contains("Format des Senders")
        )
    }

    func testUnknownErrorKeepsDetailButIsLimited() {
        let error = NSError(
            domain: "AVFoundationErrorDomain",
            code: -11800,
            userInfo: [NSLocalizedDescriptionKey: String(repeating: "x", count: 400)]
        )
        let message = PlaybackFailureText.message(for: error)
        XCTAssertTrue(message.contains("konnte den Sender nicht öffnen"))
        XCTAssertLessThan(message.count, 400, "technische Details müssen gekürzt werden")
    }

    func testMissingErrorStillProducesText() {
        let message = PlaybackFailureText.message(for: nil)
        XCTAssertTrue(message.contains("konnte nicht wiedergegeben werden"))
        XCTAssertTrue(message.contains(PlaybackFailureText.backHint))
    }

    func testEveryMessageOffersTheWayBack() {
        let errors: [NSError?] = [
            nil,
            urlError(UrlError.notConnected),
            urlError(UrlError.appTransportSecurity),
            NSError(domain: "AVFoundationErrorDomain", code: -11828),
            NSError(domain: "CoreMediaErrorDomain", code: -12880),
            NSError(domain: "AndereDomain", code: 1),
        ]
        for error in errors {
            XCTAssertTrue(
                PlaybackFailureText.message(for: error).hasSuffix(PlaybackFailureText.backHint),
                "Rückweg fehlt bei \(String(describing: error))"
            )
        }
    }

    func testInsecureSourcesAreCalledOut() {
        let message = PlaybackFailureText.message(for: urlError(UrlError.timedOut), insecure: true)
        XCTAssertTrue(message.contains("HTTP"))
        XCTAssertTrue(message.contains("App Transport Security"))
        XCTAssertTrue(message.hasSuffix(PlaybackFailureText.backHint))

        XCTAssertTrue(PlaybackFailureText.isInsecure(URL(string: "http://example.test/a.m3u8")))
        XCTAssertFalse(PlaybackFailureText.isInsecure(URL(string: "https://example.test/a.m3u8")))
        XCTAssertFalse(PlaybackFailureText.isInsecure(nil))
    }
}
