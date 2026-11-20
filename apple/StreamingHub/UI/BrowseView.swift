import SwiftUI
import StreamingHubCore

/// Katalog: Kategorie-Filter, Fortsetzen, Favoriten und ein Raster aller Einträge.
struct BrowseView: View {
    @Environment(AppModel.self) private var model
    @State private var selectedGroup: String?

    private let columns = [GridItem(.adaptive(minimum: Theme.tileWidth), spacing: Theme.gridSpacing)]

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 20) {
                header
                if !model.continueWatching.isEmpty {
                    continueSection
                }
                if !model.favoriteChannels.isEmpty {
                    favoriteSection
                }
                if !model.channels.isEmpty {
                    filterSection
                }
                catalogSection
            }
            .padding(20)
        }
        .background(Theme.page)
        .navigationTitle("Start")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    Task { await model.refreshAccount() }
                } label: {
                    Label("Status aktualisieren", systemImage: "arrow.clockwise")
                }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("StreamingHub")
                .font(.largeTitle.bold())
            Text(model.sourceLabel.isEmpty ? "Keine Quelle geladen" : model.sourceLabel)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            HStack(spacing: 8) {
                StatusBadge(text: model.isPaired ? "Gekoppelt" : "Nicht gekoppelt",
                            tone: model.isPaired ? .positive : .neutral)
                StatusBadge(text: model.account?.premiumActive == true ? "Premium" : "Basis",
                            tone: model.account?.premiumActive == true ? .positive : .neutral)
                StatusBadge(text: "\(model.channels.count) Einträge")
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var continueSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(title: "Weiter schauen", subtitle: "Setzt an der letzten Position fort")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.gridSpacing) {
                    ForEach(model.continueWatching) { channel in
                        Button {
                            model.player = channel
                        } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(channel.name).font(.headline).lineLimit(2)
                                Text("ab \(resumeMinutes(channel)) Min.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            .frame(width: 180, alignment: .leading)
                            .padding(12)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 14))
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("Setzt die Wiedergabe fort")
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var favoriteSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            SectionHeader(title: "Favoriten", subtitle: "Über das Kontextmenü einer Kachel gepflegt")
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Theme.gridSpacing) {
                    ForEach(model.favoriteChannels) { channel in
                        ChannelTile(
                            channel: channel,
                            isFavorite: true,
                            resumeText: nil,
                            action: { model.player = channel },
                            toggleFavorite: { model.toggleFavorite(channel) }
                        )
                        .frame(width: 180)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var filterSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Picker("Art", selection: Binding(
                get: { model.kindFilter },
                set: { model.kindFilter = $0 }
            )) {
                Text("Alle").tag(MediaKind?.none)
                Text("Live").tag(MediaKind?.some(.live))
                Text("Filme").tag(MediaKind?.some(.movie))
                Text("Serien").tag(MediaKind?.some(.series))
            }
            .pickerStyle(.segmented)
            .accessibilityLabel("Einträge filtern")

            if model.categories.count > 1 {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        groupChip(nil, label: "Alle Kategorien")
                        ForEach(model.categories, id: \.self) { group in
                            groupChip(group, label: group)
                        }
                    }
                    .padding(.vertical, 2)
                }
            }
        }
    }

    private func groupChip(_ group: String?, label: String) -> some View {
        let selected = selectedGroup == group
        return Button {
            selectedGroup = group
        } label: {
            Text(label)
                .font(.subheadline.weight(selected ? .semibold : .regular))
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .frame(minHeight: Theme.minimumTarget)
                .background(selected ? Theme.accent.opacity(0.15) : Theme.card, in: Capsule())
                .overlay(Capsule().stroke(selected ? Theme.accent : Theme.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var catalogSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(
                title: selectedGroup ?? titleForFilter,
                subtitle: "\(visibleChannels.count) Einträge"
            )
            if visibleChannels.isEmpty {
                EmptyHint(
                    title: "Nichts vorhanden",
                    message: "Importiere in den Einstellungen eine M3U-Playlist oder starte den Demo-Modus."
                )
            } else {
                LazyVGrid(columns: columns, spacing: Theme.gridSpacing) {
                    ForEach(visibleChannels) { channel in
                        ChannelTile(
                            channel: channel,
                            isFavorite: model.favorites.contains(channel.url),
                            resumeText: resumeText(for: channel),
                            action: { model.player = channel },
                            toggleFavorite: { model.toggleFavorite(channel) }
                        )
                    }
                }
            }
        }
    }

    private var titleForFilter: String {
        switch model.kindFilter {
        case .some(.live): return "Live-TV"
        case .some(.movie): return "Filme"
        case .some(.series): return "Serien"
        case .none: return "Alle Einträge"
        }
    }

    private var visibleChannels: [Channel] {
        guard let selectedGroup else { return model.filteredByKind }
        return model.filteredByKind.filter { $0.group == selectedGroup }
    }

    private func resumeText(for channel: Channel) -> String? {
        guard let stored = model.positions[channel.url], stored.positionMs > ProgressRules.minimumPositionMs else {
            return nil
        }
        return "Fortsetzen ab \(Int(stored.positionMs / 60_000)) Min."
    }

    private func resumeMinutes(_ channel: Channel) -> Int {
        Int((model.positions[channel.url]?.positionMs ?? 0) / 60_000)
    }
}
