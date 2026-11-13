import Foundation

#if os(iOS) || os(tvOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Diagnose-Protokoll für Fehler und Hardware.
///
/// Die Datei liegt unter `Application Support/StreamingHub/diagnostics.log`,
/// wird nie automatisch übertragen und lässt sich in den Einstellungen ansehen
/// und löschen. Aufgezeichnet werden nur technische Angaben: Zeitpunkt, Stufe,
/// Bereich, Meldung und – einmal je Start – Modell, Systemstand, Bildschirm und
/// Sprache. Keine Tokens, keine E-Mail-Adressen, keine Gerätenamen; URLs werden
/// vor dem Schreiben von Zugangsdaten, Query und Fragment befreit.
///
/// Das Format ist bewusst dasselbe wie in der Android- und der Vega-App, damit
/// sich Protokolle vergleichen lassen.
final class DiagnosticsLog: @unchecked Sendable {

    enum Level: String {
        case info
        case warn
        case error
    }

    static let shared = DiagnosticsLog()

    private static let maxCharacters = 64_000
    private static let maxFieldCharacters = 500

    private let fileURL: URL
    private let lock = NSLock()
    private var deviceRecorded = false

    init(directory: URL? = nil) {
        let base = directory
            ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        let folder = base.appendingPathComponent("StreamingHub", isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        fileURL = folder.appendingPathComponent("diagnostics.log")
    }

    /// Schreibt einmal je App-Start einen Kopf mit Hardware und Systemstand.
    func recordDeviceInfo() {
        lock.lock()
        let alreadyRecorded = deviceRecorded
        deviceRecorded = true
        lock.unlock()
        guard !alreadyRecorded else { return }
        record(deviceSummary(), area: "device")
    }

    func record(_ message: String, level: Level = .info, area: String, meta: String? = nil) {
        let stamp = Self.stamp()
        var line = "\(stamp) \(level.rawValue.uppercased().padding(toLength: 5, withPad: " ", startingAt: 0)) "
        line += "\(Self.trim(area, limit: 40)): \(Self.trim(message))"
        if let meta, !meta.isEmpty {
            line += " | \(Self.trim(meta))"
        }
        append(line)
    }

    func record(error: Error, area: String, meta: String? = nil) {
        record(error.localizedDescription, level: .error, area: area, meta: meta)
    }

    func text(limit: Int = 12_000) -> String {
        lock.lock()
        defer { lock.unlock() }
        let content = (try? String(contentsOf: fileURL, encoding: .utf8)) ?? ""
        guard content.count > limit else { return content }
        return "… (gekürzt)\n" + String(content.suffix(limit))
    }

    var sizeBytes: Int {
        lock.lock()
        defer { lock.unlock() }
        let attributes = try? FileManager.default.attributesOfItem(atPath: fileURL.path)
        return (attributes?[.size] as? NSNumber)?.intValue ?? 0
    }

    var entryCount: Int {
        lock.lock()
        defer { lock.unlock() }
        let content = (try? String(contentsOf: fileURL, encoding: .utf8)) ?? ""
        return content.split(separator: "\n").count
    }

    var path: String { fileURL.path }

    func clear() {
        lock.lock()
        defer { lock.unlock() }
        try? FileManager.default.removeItem(at: fileURL)
    }

    /// Entfernt Zugangsdaten und Query aus einer URL. Playlist-Adressen enthalten
    /// häufig Tokens; die gehören nicht in ein Protokoll, das jemand weitergibt.
    static func redact(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        let withoutCredentials = trimmed.replacingOccurrences(
            of: "//[^/@\\s]*@",
            with: "//",
            options: .regularExpression
        )
        return withoutCredentials.replacingOccurrences(
            of: "[?#].*$",
            with: "",
            options: .regularExpression
        )
    }

    // MARK: - Intern

    private func append(_ line: String) {
        lock.lock()
        defer { lock.unlock() }
        let existing = (try? String(contentsOf: fileURL, encoding: .utf8)) ?? ""
        var combined = existing + line + "\n"
        if combined.count > Self.maxCharacters {
            // Älteste Einträge zuerst, aber sauber an einer Zeilengrenze schneiden.
            let overflow = combined.count - Self.maxCharacters
            let start = combined.index(combined.startIndex, offsetBy: overflow)
            if let newline = combined[start...].firstIndex(of: "\n") {
                combined = String(combined[combined.index(after: newline)...])
            } else {
                combined = String(combined.suffix(Self.maxCharacters))
            }
        }
        try? combined.write(to: fileURL, atomically: true, encoding: .utf8)
    }

    private func deviceSummary() -> String {
        let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "0"
        var parts = [
            "os=\(Self.platformName)",
            "app=\(version) (\(build))",
            "locale=\(Locale.current.identifier)",
        ]
        #if os(iOS) || os(tvOS)
        let device = UIDevice.current
        let screen = UIScreen.main.bounds.size
        parts.append("release=\(device.systemVersion)")
        parts.append("model=\(device.model)")
        parts.append("screen=\(Int(screen.width))x\(Int(screen.height))@\(UIScreen.main.scale)")
        #elseif os(macOS)
        let screen = NSScreen.main?.frame.size ?? .zero
        parts.append("release=\(ProcessInfo.processInfo.operatingSystemVersionString)")
        parts.append("model=mac")
        parts.append("screen=\(Int(screen.width))x\(Int(screen.height))")
        #endif
        return parts.joined(separator: " ")
    }

    private static var platformName: String {
        #if os(tvOS)
        return "tvos"
        #elseif os(iOS)
        return "ios"
        #elseif os(macOS)
        return "macos"
        #else
        return "unbekannt"
        #endif
    }

    private static func stamp() -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        return formatter.string(from: Date())
    }

    private static func trim(_ value: String, limit: Int = maxFieldCharacters) -> String {
        let singleLine = value.replacingOccurrences(of: "\n", with: " ")
        guard singleLine.count > limit else { return singleLine }
        return String(singleLine.prefix(limit)) + "…"
    }
}
