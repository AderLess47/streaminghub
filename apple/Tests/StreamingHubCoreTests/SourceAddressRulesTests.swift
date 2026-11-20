import XCTest
@testable import StreamingHubCore

/// Prüft die Adressregel, die vor dem Download greift. Ohne sie sähe der Nutzer
/// bei HTTP nur einen generischen ATS-Netzwerkfehler.
final class SourceAddressRulesTests: XCTestCase {

    func testHttpsIsAccepted() {
        XCTAssertNil(SourceAddressRules.problem(for: "https://anbieter.example/liste.m3u"))
        XCTAssertNil(SourceAddressRules.problem(for: "  https://anbieter.example/guide.xml  "))
    }

    func testHttpIsAcceptedForUserSources() {
        XCTAssertNil(SourceAddressRules.problem(for: "http://anbieter.example/liste.m3u"))
        XCTAssertNil(SourceAddressRules.problem(for: "  http://anbieter.example/guide.xml  "))
    }

    func testMissingOrUnsupportedSchemesAreNamed() {
        XCTAssertNotNil(SourceAddressRules.problem(for: ""))
        XCTAssertNotNil(SourceAddressRules.problem(for: "anbieter.example/liste.m3u"))
        XCTAssertTrue(SourceAddressRules.problem(for: "ftp://anbieter.example/liste.m3u")?.contains("HTTP(S)") == true)
    }

    func testInsecureDetection() {
        XCTAssertTrue(SourceAddressRules.isInsecure("http://anbieter.example/a.m3u"))
        XCTAssertFalse(SourceAddressRules.isInsecure("https://anbieter.example/a.m3u"))
        XCTAssertFalse(SourceAddressRules.isInsecure(""))
    }
}
