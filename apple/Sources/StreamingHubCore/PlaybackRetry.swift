import Foundation

/// Entscheidet, ob ein Wiedergabefehler automatisch erneut versucht wird.
///
/// Gegenstück zu `PlaybackRetry` in der Android-App: Nur Verbindungsprobleme
/// werden wiederholt, eine abgelehnte Lizenz oder ein nicht unterstütztes Format
/// nicht. Die Netzabfrage selbst bleibt in der App, damit dieser Teil ohne
/// Apple-Frameworks testbar ist.
public enum PlaybackRetry {

    /// So oft startet die App nach einem Netzfehler von selbst neu.
    public static let maxAutoRetries = 4

    /// Abstand zwischen zwei Versuchen, solange kein Netz da ist.
    public static let pollSeconds: TimeInterval = 5

    /// Zusatz zur Fehlermeldung, solange automatisch weiterversucht wird.
    public static let hint = "Sobald die Verbindung wieder da ist, startet die Wiedergabe automatisch neu."

    public static func isNetworkError(_ error: NSError?) -> Bool {
        guard let error, error.domain == NSURLErrorDomain else { return false }
        // Rohe Codes wie in `PlaybackFailureText`: Die Core-Tests laufen auf
        // Linux, dort fehlen einzelne URLError-Fälle.
        switch error.code {
        case -1009: // NSURLErrorNotConnectedToInternet
            return true
        case -1001: // NSURLErrorTimedOut
            return true
        case -1004: // NSURLErrorCannotConnectToHost
            return true
        case -1005: // NSURLErrorNetworkConnectionLost
            return true
        default:
            return false
        }
    }

    public static func canRetryAutomatically(attempts: Int) -> Bool {
        attempts < maxAutoRetries
    }
}
