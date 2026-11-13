import Foundation

/// Prüft Quelladressen (M3U-Playlist, XMLTV) für die Apple-App.
///
/// App Transport Security (ATS) blockiert unverschlüsselte Verbindungen; die
/// App setzt bewusst keine pauschale Ausnahme (siehe `README.md`). Statt den
/// Nutzer mit einem generischen Netzwerkfehler allein zu lassen, nennt die App
/// vor dem Download den Grund und den Ausweg.
public enum SourceAddressRules {

    /// Nur HTTPS ist auf Apple-Plattformen zulässig.
    public static func problem(for rawAddress: String) -> String? {
        let trimmed = rawAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return "Bitte gib eine vollständige Adresse an, zum Beispiel https://anbieter.example/playlist.m3u"
        }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() else {
            return "Bitte gib eine vollständige Adresse an, zum Beispiel https://anbieter.example/playlist.m3u"
        }

        switch scheme {
        case "https":
            return nil
        case "http":
            return "Auf Apple-Geräten sind nur HTTPS-Adressen möglich: App Transport Security blockiert unverschlüsselte Downloads. Frage deinen Anbieter nach einer HTTPS-Adresse oder importiere die Datei lokal."
        default:
            return "Nur HTTP(S)-Adressen werden unterstützt."
        }
    }

    /// Kurzform für die Anzeige: Die Adresse wird unverschlüsselt übertragen.
    public static func isInsecure(_ rawAddress: String) -> Bool {
        URL(string: rawAddress.trimmingCharacters(in: .whitespacesAndNewlines))?
            .scheme?.lowercased() == "http"
    }
}
