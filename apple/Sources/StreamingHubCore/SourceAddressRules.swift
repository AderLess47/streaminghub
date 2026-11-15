import Foundation

/// Prüft Quelladressen (M3U-Playlist, XMLTV) für die Apple-App.
///
/// Nutzer-Playlists liegen häufig nur als `http://`-Adresse vor. Die App erlaubt
/// deshalb HTTP-Quellen wie Android und Vega auch; App Transport Security ist
/// dafür in `project.yml` für diese App geöffnet. Der Player kennzeichnet
/// unverschlüsselte Wiedergabe weiterhin sichtbar (`isInsecure`).
public enum SourceAddressRules {

    /// Erlaubt HTTP und HTTPS; lehnt alles andere ab.
    public static func problem(for rawAddress: String) -> String? {
        let trimmed = rawAddress.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return "Bitte gib eine vollständige Adresse an, zum Beispiel https://anbieter.example/playlist.m3u"
        }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() else {
            return "Bitte gib eine vollständige Adresse an, zum Beispiel https://anbieter.example/playlist.m3u"
        }

        switch scheme {
        case "https", "http":
            return nil
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
