import SwiftUI
import StreamingHubCore

/// Programmführer: was jetzt läuft, was danach kommt, und Erinnerungen.
struct GuideView: View {
    @Environment(AppModel.self) private var model
    @State private var now = Date()

    private var rows: [(channel: Channel, running: Programme?, next: Programme?)] {
        model.channels.compactMap { channel in
            guard let id = EPG.channelID(for: channel) else { return nil }
            let running = EPG.running(model.programmes, channelID: id, at: now)
            let next = EPG.next(model.programmes, channelID: id, after: now)
            guard running != nil || next != nil else { return nil }
            return (channel, running, next)
        }
    }

    var body: some View {
        Group {
            if model.programmes.isEmpty {
                EmptyHint(
                    title: "Keine Programmdaten",
                    message: "Lade in den Einstellungen eine XMLTV-Datei. Ohne sie gibt es nichts anzuzeigen und nichts zu erinnern."
                )
                .padding(20)
            } else {
                List {
                    Section {
                        ForEach(rows, id: \.channel.id) { row in
                            programmeRow(row)
                        }
                    } header: {
                        Text("Sender")
                    } footer: {
                        #if os(tvOS)
                        Text("Apple TV zeigt Erinnerungen nur als Hinweis am App-Symbol; die Sendung selbst steht jederzeit hier unter „Vorgemerkt“.")
                        #else
                        Text("Erinnerungen erscheinen als Benachrichtigung, auch wenn die App geschlossen ist.")
                        #endif
                    }

                    if !model.reminders.isEmpty {
                        Section("Vorgemerkt") {
                            ForEach(model.reminders) { reminder in
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(reminder.title).font(.body)
                                        Text("\(reminder.channelName) · \(timeText(reminder.start))")
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Button("Entfernen", role: .destructive) {
                                        model.removeReminder(reminder)
                                    }
                                    .buttonStyle(.borderless)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Programm")
        .task {
            // Der Führer läuft mit, ohne die Wiedergabe zu stören.
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                now = Date()
            }
        }
    }

    private func programmeRow(_ row: (channel: Channel, running: Programme?, next: Programme?)) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(row.channel.name)
                .font(.headline)
            if let running = row.running {
                Text("Jetzt: \(running.title)")
                    .font(.subheadline)
                Text("\(timeText(running.start))–\(timeText(running.stop))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("Jetzt: keine Angabe")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let next = row.next {
                Text("Danach: \(next.title) ab \(timeText(next.start))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 12) {
                Button("Ansehen") { model.player = row.channel }
                    .buttonStyle(.bordered)
                    .frame(minHeight: Theme.minimumTarget)

                if let target = row.running ?? row.next {
                    let scheduled = model.isReminderSet(target)
                    Button(scheduled ? "Erinnerung löschen" : "Erinnern") {
                        Task { await model.toggleReminder(target) }
                    }
                    .buttonStyle(scheduled ? BorderedButtonStyle() : BorderedProminentButtonStyle())
                    .frame(minHeight: Theme.minimumTarget)
                    .disabled(target.start < now)
                    .accessibilityHint(scheduled
                        ? "Entfernt die Benachrichtigung für diese Sendung"
                        : "Plant eine Benachrichtigung zum Sendungsbeginn")
                }
                Spacer()
            }
            .padding(.top, 2)
        }
        .padding(.vertical, 4)
    }

    private func timeText(_ date: Date) -> String {
        date.formatted(date: .omitted, time: .shortened)
    }
}
