import Foundation

/// Übersetzt Wiedergabefehler von AVPlayer und URLSession in Sätze, die ohne
/// Konsole verständlich sind.
///
/// AVPlayer meldet Fehler als `NSError` mit `NSURLErrorDomain`,
/// `AVFoundationErrorDomain` oder `CoreMediaErrorDomain`. Ein rohes
/// `-11800` hilft auf dem Fernseher niemandem, deshalb nennt die Meldung die
/// wahrscheinliche Ursache und immer den Weg zurück. Die vollständige
/// Fehlermeldung bleibt im Diagnose-Log.
public enum PlaybackFailureText {

    /// Steht am Ende jeder Meldung; der Fehlerbildschirm bietet genau diesen Knopf.
    public static let backHint = "Mit „Zurück zur Senderliste“ geht es zurück."

    /// Erkennt Adressen, die unverschlüsselt übertragen werden. Auf Apple-
    /// Plattformen blockiert App Transport Security sie standardmäßig.
    public static func isInsecure(_ url: URL?) -> Bool {
        url?.scheme?.lowercased() == "http"
    }

    public static func message(for error: NSError?, insecure: Bool = false) -> String {
        let base = baseMessage(for: error)
        guard insecure else { return "\(base) \(backHint)" }
        return "\(base) Die Quelle läuft über HTTP; Apple blockiert unverschlüsselte Verbindungen standardmäßig (App Transport Security). \(backHint)"
    }

    private static func baseMessage(for error: NSError?) -> String {
        guard let error else {
            return "Die Quelle konnte nicht wiedergegeben werden."
        }

        if error.domain == NSURLErrorDomain {
            // Rohe Codes statt URLError.Code: Die Core-Tests laufen in der CI auf
            // einer Linux-Toolchain, dort fehlen einzelne Apple-spezifische Fälle
            // (etwa App Transport Security). Die Zahlen sind seit Jahren stabil.
            switch error.code {
            case -1022: // NSURLErrorAppTransportSecurityRequiresSecureConnection
                return "Apple blockiert die unverschlüsselte Verbindung (App Transport Security). Nutze eine HTTPS-Adresse."
            case -1009: // NSURLErrorNotConnectedToInternet
                return "Es besteht keine Internetverbindung."
            case -1001: // NSURLErrorTimedOut
                return "Der Sender hat nicht rechtzeitig geantwortet."
            case -1003, -1004, -1006: // Host nicht gefunden, keine Verbindung, DNS
                return "Der Server des Senders war nicht erreichbar."
            case -1200, -1201, -1202, -1203, -1204, -1205, -1206:
                // TLS- und Zertifikatsfehler (NSURLErrorSecureConnectionFailed …)
                return "Die sichere Verbindung zum Sender ist gescheitert (Zertifikat oder TLS)."
            default:
                return "Beim Laden des Senders ist ein Netzwerkfehler aufgetreten."
            }
        }

        if error.domain == "AVFoundationErrorDomain" {
            // -11828 = AVError.fileFormatNotSupported; die Zahl ist stabil, die
            // Swift-Konstante hängt aber von der SDK-Version ab.
            if error.code == -11828 {
                return "Das Format des Senders kann dieses Gerät nicht abspielen."
            }
            return "Der Player konnte den Sender nicht öffnen."
        }

        if error.domain == "CoreMediaErrorDomain" {
            return "Der Player konnte den Datenstrom des Senders nicht verarbeiten."
        }

        let detail = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !detail.isEmpty else {
            return "Die Quelle konnte nicht wiedergegeben werden."
        }
        let limited = detail.count > 140 ? String(detail.prefix(140)) + "…" : detail
        return "Die Quelle konnte nicht wiedergegeben werden (\(limited))."
    }
}
