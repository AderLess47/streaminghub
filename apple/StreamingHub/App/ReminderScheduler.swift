import Foundation
import UserNotifications
import StreamingHubCore

/// Sendungserinnerungen als echte lokale Benachrichtigungen.
///
/// Das ist der Unterschied zum Vega-Client: Apple-Plattformen erlauben Apps,
/// Benachrichtigungen für einen Zukunftstermin zu planen. Der Android-Client
/// nutzt dafür `AlarmManager`, hier ist es `UNUserNotificationCenter`.
struct ReminderScheduler {

    enum SchedulingError: LocalizedError {
        case denied
        case failed(String)

        var errorDescription: String? {
            switch self {
            case .denied:
                return "Benachrichtigungen sind für StreamingHub nicht erlaubt. Erlaube sie in den Systemeinstellungen, um erinnert zu werden."
            case .failed(let message):
                return message
            }
        }
    }

    private var center: UNUserNotificationCenter { .current() }

    /// Fragt die Erlaubnis nur, wenn tatsächlich eine Erinnerung gewünscht ist –
    /// nicht beim App-Start.
    func requestAuthorization() async -> Bool {
        let settings = await center.notificationSettings()
        let status = settings.authorizationStatus
        if status == .authorized || status == .provisional {
            return true
        }
        #if os(iOS)
        // `ephemeral` gibt es nur auf iOS und visionOS (App Clips); auf tvOS
        // und macOS existiert der Fall nicht und würde den Build brechen.
        if status == .ephemeral {
            return true
        }
        #endif
        if status == .denied {
            return false
        }
        return (try? await center.requestAuthorization(options: [.alert, .sound])) ?? false
    }

    func schedule(_ reminder: Reminder) async throws {
        #if os(tvOS)
        // tvOS hat keine Inhaltsfelder für lokale Benachrichtigungen (`title`,
        // `body` fehlen im SDK) und zeigt sie auch nicht an.
        throw SchedulingError.failed("Erinnerungen sind auf Apple TV nicht verfügbar.")
        #else
        guard ReminderRules.nextFireDate(for: reminder) != nil else { return }
        guard await requestAuthorization() else { throw SchedulingError.denied }

        let content = UNMutableNotificationContent()
        content.title = reminder.channelName
        content.body = "Jetzt: \(reminder.title)"
        content.sound = .default
        content.userInfo = ["channelID": reminder.channelID, "startMs": reminder.startMs]

        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: reminder.start
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(identifier: reminder.id, content: content, trigger: trigger)

        do {
            try await center.add(request)
        } catch {
            throw SchedulingError.failed("Die Erinnerung konnte nicht geplant werden: \(error.localizedDescription)")
        }
        #endif
    }

    func cancel(_ reminder: Reminder) {
        center.removePendingNotificationRequests(withIdentifiers: [reminder.id])
    }

    /// Beim Start aufräumen: Erinnerungen, deren Sendung vorbei ist, haben keinen
    /// Zweck mehr, und gelöschte Sender hinterlassen sonst Karteileichen.
    func cancelOutdated(_ reminders: [Reminder], now: Date = Date()) {
        let outdated = reminders.filter { $0.start < now.addingTimeInterval(-5 * 60) }
        guard !outdated.isEmpty else { return }
        center.removePendingNotificationRequests(withIdentifiers: outdated.map(\.id))
    }
}
