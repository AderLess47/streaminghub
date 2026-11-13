import SwiftUI

/// Farben und Maße. Die Werte folgen der Website, nutzen aber die semantischen
/// Systemfarben der jeweiligen Plattform – sonst kippt der Dunkelmodus, und auf
/// dem Mac gibt es die iOS-Farbklassen gar nicht.
enum Theme {
    static let accent = Color(red: 0.145, green: 0.388, blue: 0.922)

    #if os(macOS)
    static let card = Color(nsColor: .controlBackgroundColor)
    static let page = Color(nsColor: .windowBackgroundColor)
    static let border = Color(nsColor: .separatorColor)
    #elseif os(tvOS)
    // Die gruppierten Hintergrundfarben sind auf dem Fernseher nicht definiert,
    // und die Oberfläche ist dort ohnehin dunkel.
    static let card = Color(white: 0.14)
    static let page = Color(white: 0.06)
    static let border = Color(white: 0.3)
    #else
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
    static let page = Color(uiColor: .systemGroupedBackground)
    static let border = Color(uiColor: .separator)
    #endif

    static let cornerRadius: CGFloat = 16
    static let tileWidth: CGFloat = 168
    static let gridSpacing: CGFloat = 12

    /// Mindestgröße für Tippziele (WCAG 2.5.8 verlangt 24 pt, Apple empfiehlt 44).
    static let minimumTarget: CGFloat = 44
}

extension View {
    func cardSurface() -> some View {
        self
            .padding(16)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: Theme.cornerRadius))
    }
}
