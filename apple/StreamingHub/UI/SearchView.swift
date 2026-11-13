import SwiftUI
import StreamingHubCore

/// Suche über Name und Kategorie der eigenen Playlist.
struct SearchView: View {
    @Environment(AppModel.self) private var model
    @State private var query = ""

    private let columns = [GridItem(.adaptive(minimum: Theme.tileWidth), spacing: Theme.gridSpacing)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Sucht in deinen eigenen Einträgen. Es wird nichts an StreamingHub gesendet.")
                    .font(.callout)
                    .foregroundStyle(.secondary)

                if query.trimmingCharacters(in: .whitespaces).count < 2 {
                    EmptyHint(title: "Begriff eingeben", message: "Zwei Zeichen genügen, um die Liste zu filtern.")
                } else if results.isEmpty {
                    EmptyHint(title: "Kein Treffer", message: "Andere Schreibweise versuchen oder eine Kategorie durchsuchen.")
                } else {
                    Text("\(results.count) Treffer")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    LazyVGrid(columns: columns, spacing: Theme.gridSpacing) {
                        ForEach(results) { channel in
                            ChannelTile(
                                channel: channel,
                                isFavorite: model.favorites.contains(channel.url),
                                resumeText: nil,
                                action: { model.player = channel },
                                toggleFavorite: { model.toggleFavorite(channel) }
                            )
                        }
                    }
                }
            }
            .padding(20)
        }
        .background(Theme.page)
        .navigationTitle("Suche")
        .searchable(text: $query, prompt: "Name oder Kategorie")
    }

    private var results: [Channel] {
        let needle = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard needle.count >= 2 else { return [] }
        return model.channels
            .filter { $0.name.lowercased().contains(needle) || $0.group.lowercased().contains(needle) }
            .prefix(80)
            .map { $0 }
    }
}
