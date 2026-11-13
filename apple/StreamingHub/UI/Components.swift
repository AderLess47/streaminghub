import SwiftUI
import StreamingHubCore

/// Bausteine der Oberfläche.
///
/// Barrierefreiheit ist hier keine Zugabe: Jede Kachel ist ein Knopf mit
/// sprechendem Label und Hinweis, Zustände stehen als Text und nicht nur als
/// Farbe, und alle Ziele sind mindestens 44 pt groß.

struct SectionHeader: View {
    let title: String
    var subtitle: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.title3.weight(.semibold))
                .accessibilityAddTraits(.isHeader)
            if let subtitle {
                Text(subtitle)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct StatusBadge: View {
    let text: String
    var tone: Tone = .neutral

    enum Tone { case neutral, positive, warning }

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .background(background, in: Capsule())
            .overlay(Capsule().stroke(borderColor, lineWidth: 1))
            .foregroundStyle(foreground)
    }

    private var background: Color {
        switch tone {
        case .positive: return .green.opacity(0.12)
        case .warning: return .orange.opacity(0.12)
        case .neutral: return .clear
        }
    }

    private var borderColor: Color {
        switch tone {
        case .positive: return .green.opacity(0.6)
        case .warning: return .orange.opacity(0.6)
        case .neutral: return Theme.border
        }
    }

    private var foreground: Color {
        switch tone {
        case .positive: return .green
        case .warning: return .orange
        case .neutral: return .secondary
        }
    }
}

struct Notice: View {
    let text: String
    var tone: Tone = .info

    enum Tone { case info, success, warning, error }

    var body: some View {
        Text(text)
            .font(.callout)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(background, in: RoundedRectangle(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(borderColor, lineWidth: 1)
            )
            .accessibilityElement(children: .combine)
    }

    private var background: Color { Theme.card }

    private var borderColor: Color {
        switch tone {
        case .success: return .green
        case .warning: return .orange
        case .error: return .red
        case .info: return Theme.border
        }
    }
}

struct ChannelTile: View {
    let channel: Channel
    let isFavorite: Bool
    let resumeText: String?
    let action: () -> Void
    let toggleFavorite: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 6) {
                Text(channel.name)
                    .font(.headline)
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Text(channel.group)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if let resumeText {
                    Text(resumeText)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            .padding(12)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(isFavorite ? Theme.accent : Theme.border, lineWidth: isFavorite ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
        .accessibilityHint("Öffnet die Wiedergabe")
        .contextMenu {
            Button(isFavorite ? "Favorit entfernen" : "Zu Favoriten") { toggleFavorite() }
        }
    }

    private var accessibilityLabel: String {
        var parts = [channel.name, channel.group]
        if isFavorite { parts.append("Favorit") }
        if let resumeText { parts.append(resumeText) }
        return parts.joined(separator: ", ")
    }
}

struct EmptyHint: View {
    let title: String
    let message: String

    var body: some View {
        VStack(spacing: 8) {
            Text(title).font(.headline)
            Text(message)
                .font(.callout)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(24)
        .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
    }
}

/// Länge eines Formularfelds: verhindert, dass leere Eingaben abgeschickt werden.
extension String {
    var isPlausibleURL: Bool {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() else { return false }
        return ["http", "https"].contains(scheme) && (url.host?.isEmpty == false)
    }
}
