import SwiftUI

/// Navigation: auf iPhone und iPad eine Tableiste, auf dem Mac eine Seitenleiste.
/// Beide zeigen dieselben Ziele, damit die App überall gleich bedient wird.
struct RootView: View {
    @Environment(AppModel.self) private var model
    @State private var destination: Destination = .start

    enum Destination: String, CaseIterable, Identifiable {
        case start = "Start"
        case guide = "Programm"
        case search = "Suche"
        case settings = "Einstellungen"

        var id: String { rawValue }

        var systemImage: String {
            switch self {
            case .start: return "play.rectangle.on.rectangle"
            case .guide: return "calendar"
            case .search: return "magnifyingglass"
            case .settings: return "gearshape"
            }
        }
    }

    var body: some View {
        @Bindable var model = model

        Group {
            #if os(macOS)
            NavigationSplitView {
                List(Destination.allCases, selection: Binding<Destination?>(
                    get: { destination },
                    set: { destination = $0 ?? .start }
                )) { item in
                    Label(item.rawValue, systemImage: item.systemImage).tag(item)
                }
                .navigationSplitViewColumnWidth(min: 180, ideal: 210)
            } detail: {
                content(for: destination)
            }
            #else
            TabView(selection: $destination) {
                ForEach(Destination.allCases) { item in
                    content(for: item)
                        .tabItem { Label(item.rawValue, systemImage: item.systemImage) }
                        .tag(item)
                }
            }
            #endif
        }
        .overlay(alignment: .top) {
            if let notice = model.notice {
                Notice(text: notice, tone: .success)
                    .padding()
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .task {
                        try? await Task.sleep(nanoseconds: 6_000_000_000)
                        withAnimation { model.notice = nil }
                    }
            } else if let error = model.errorMessage {
                Notice(text: error, tone: .error)
                    .padding()
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .onTapGesture { model.errorMessage = nil }
                    .task {
                        try? await Task.sleep(nanoseconds: 10_000_000_000)
                        withAnimation { model.errorMessage = nil }
                    }
            }
        }
        #if os(macOS)
        // macOS kennt `fullScreenCover` nicht; ein eigenes Fenster ist dort
        // ohnehin die passende Darstellung.
        .sheet(item: $model.player) { channel in
            PlayerView(channel: channel)
                .frame(minWidth: 720, minHeight: 480)
        }
        #else
        .fullScreenCover(item: $model.player) { channel in
            PlayerView(channel: channel)
        }
        #endif
        .sheet(isPresented: $model.showingPairing) {
            PairingView()
        }
    }

    @ViewBuilder
    private func content(for destination: Destination) -> some View {
        switch destination {
        case .start:
            NavigationStack { BrowseView() }
        case .guide:
            NavigationStack { GuideView() }
        case .search:
            NavigationStack { SearchView() }
        case .settings:
            NavigationStack { SettingsView() }
        }
    }
}
