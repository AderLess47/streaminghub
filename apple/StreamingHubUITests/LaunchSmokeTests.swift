import XCTest

/// Smoke-Test: Die App startet im Simulator, stürzt nicht ab und zeigt die
/// Senderliste. Ersetzt keinen Gerätetest, fängt aber Startabstürze und leere
/// Oberflächen ab, die ein reiner Build nicht sieht.
final class LaunchSmokeTests: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    func testStartsAndShowsChannels() throws {
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(
            app.staticTexts["StreamingHub"].waitForExistence(timeout: 20),
            "Der Startbildschirm wurde nicht gezeichnet."
        )

        // Frischer Simulator hat keine Quelle; dann die Demo-Inhalte laden.
        if !app.staticTexts["Demo Live Eins"].exists {
            app.tabBars.buttons["Einstellungen"].tap()

            let demoButton = app.buttons["Demo-Inhalte laden"]
            for _ in 0..<4 where !demoButton.exists {
                app.swipeUp()
            }
            XCTAssertTrue(demoButton.waitForExistence(timeout: 5), "Demo-Knopf nicht gefunden.")
            demoButton.tap()

            app.tabBars.buttons["Start"].tap()
        }

        XCTAssertTrue(
            app.staticTexts["Demo Live Eins"].waitForExistence(timeout: 15),
            "Die Senderliste zeigt keine Einträge."
        )
    }
}
