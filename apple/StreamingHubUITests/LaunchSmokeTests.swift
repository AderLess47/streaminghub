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

        let channel = app.staticTexts["Demo Live Eins"]
        XCTAssertTrue(channel.waitForExistence(timeout: 15), "Die Senderliste zeigt keine Einträge.")

        if !channel.isHittable {
            app.swipeUp()
        }
        channel.tap()

        // Der Player ist geöffnet, sobald seine untere Leiste da ist.
        let close = app.buttons["Schließen"]
        XCTAssertTrue(close.waitForExistence(timeout: 20), "Der Player wurde nicht geöffnet.")

        // Bei einem Wiedergabefehler führt der Knopf im Fehlerbild zurück,
        // sonst die untere Leiste. Beide Wege müssen funktionieren.
        let backFromError = app.buttons["Zurück zur Senderliste"]
        if backFromError.waitForExistence(timeout: 3) {
            backFromError.tap()
        } else {
            close.tap()
        }

        XCTAssertTrue(
            app.staticTexts["Demo Live Eins"].waitForExistence(timeout: 10),
            "Der Rückweg zur Senderliste hat nicht funktioniert."
        )
        XCTAssertFalse(close.exists, "Der Player ist nach dem Zurück noch offen.")
    }
}
