import Foundation

/// Regeln für den Wiedergabestand.
///
/// Ein Live-Stream hat keine sinnvolle Fortsetzung, und ein fast fertiger Film
/// soll beim nächsten Start von vorne beginnen statt in den Abspann zu springen.
public enum ProgressRules {
    public static let minimumPositionMs: Int64 = 5_000
    public static let finishedWindowMs: Int64 = 10_000

    /// Speichern oder entfernen – dieselbe Entscheidung wie in den anderen
    /// Clients, damit die Fortsetzungspunkte überall gleich aussehen.
    public static func shouldStore(positionMs: Int64, durationMs: Int64) -> Bool {
        durationMs > 0
            && positionMs >= minimumPositionMs
            && positionMs < durationMs - finishedWindowMs
    }

    /// Beim Fortsetzen gilt der spätere der beiden Stände: lokal entstandener
    /// Fortschritt darf durch einen älteren Serverstand nicht verloren gehen.
    public static func resumePosition(local: Int64?, remote: Int64?) -> Int64 {
        max(local ?? 0, remote ?? 0)
    }
}

/// Regeln für Erinnerungen: nur zukünftige Sendungen, keine Doppelten.
public enum ReminderRules {
    public static func canSchedule(_ programme: Programme, at date: Date = Date()) -> Bool {
        programme.startMs > Int64(date.timeIntervalSince1970 * 1000)
    }

    public static func contains(_ reminders: [Reminder], programme: Programme) -> Bool {
        reminders.contains { $0.id == programme.id }
    }

    /// Auf Apple-Plattformen plant die App echte lokale Benachrichtigungen –
    /// anders als auf Vega OS, wo Apps keine Zukunftstermine anlegen können.
    public static func nextFireDate(for reminder: Reminder, now: Date = Date()) -> Date? {
        let start = reminder.start
        return start > now ? start : nil
    }
}
