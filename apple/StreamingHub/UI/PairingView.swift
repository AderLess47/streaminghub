import SwiftUI
import StreamingHubCore

/// Kopplung nach `docs/API.md`: Code anfordern, höchstens alle drei Sekunden
/// abfragen, bei Ablauf aufhören und einen neuen Code anbieten.
struct PairingView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss

    private let api = StreamingHubAPI()

    @State private var pairing: StreamingHubAPI.PairingCode?
    @State private var status = "Code wird angefordert …"
    @State private var errorMessage: String?
    @State private var attempt = 0
    @State private var pollTask: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            VStack(spacing: 20) {
                Text("Gerät koppeln")
                    .font(.title2.bold())
                    .accessibilityAddTraits(.isHeader)

                Text("Gib den Code auf streaminghub.org/activate ein, während du dort angemeldet bist.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                VStack(spacing: 8) {
                    Text("Dein Code")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)
                    Text(pairing?.code ?? "— — — —")
                        .font(.system(size: 44, weight: .heavy, design: .monospaced))
                        .tracking(6)
                        .accessibilityLabel(pairing.map { "Code \($0.code)" } ?? "Noch kein Code")
                    Text(status)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity)
                .padding(24)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 16))

                if let errorMessage {
                    Notice(text: errorMessage, tone: .error)
                }

                Button("Neuen Code anfordern") { attempt += 1 }
                    .buttonStyle(.borderedProminent)

                #if os(tvOS)
                // Auf dem Fernseher gibt es keine Navigationsleiste mit
                // „Schließen“; der Knopf gehört in die Liste der fokussierbaren Ziele.
                Button("Schließen") { dismiss() }
                #endif

                Spacer()
            }
            .padding(20)
            .background(Theme.page)
            #if !os(tvOS)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Schließen") { dismiss() }
                }
            }
            #endif
            .task(id: attempt) {
                await requestCode()
            }
            .onDisappear { pollTask?.cancel() }
        }
    }

    private func requestCode() async {
        pollTask?.cancel()
        pairing = nil
        errorMessage = nil
        status = "Code wird angefordert …"

        do {
            let code = try await api.requestPairing(
                deviceName: model.deviceName,
                platform: model.platform,
                appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
            )
            pairing = code
            status = "Warte auf Bestätigung im Konto"
            pollTask = Task { await poll(code) }
        } catch {
            errorMessage = error.localizedDescription
            status = "Kein Code"
        }
    }

    private func poll(_ code: StreamingHubAPI.PairingCode) async {
        while !Task.isCancelled {
            do {
                try await Task.sleep(nanoseconds: UInt64(code.pollIntervalSeconds) * 1_000_000_000)
            } catch {
                return
            }

            do {
                let result = try await api.pollPairing(requestId: code.requestId, pollToken: code.pollToken)
                switch result.state {
                case .claimed:
                    guard let token = result.activationToken else {
                        errorMessage = "Die Kopplung wurde bestätigt, aber das Token fehlte."
                        status = "Abgebrochen"
                        return
                    }
                    status = "Gerät gekoppelt"
                    await model.activate(with: token)
                    dismiss()
                    return
                case .expired:
                    status = "Der Code ist abgelaufen"
                    errorMessage = "Der Code gilt zehn Minuten. Fordere einen neuen an."
                    return
                case .pending:
                    status = "Warte auf Bestätigung im Konto"
                }
            } catch {
                status = "Abfrage angehalten"
                errorMessage = error.localizedDescription
                return
            }
        }
    }
}
