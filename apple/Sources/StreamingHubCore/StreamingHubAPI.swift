import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// Client für die StreamingHub-Geräte-API (`docs/API.md`).
///
/// Übertragen werden nur Konto-, Geräte- und Abo-Metadaten sowie optional die vom
/// Admin hinterlegte M3U-Quell-URL. Playlist-Inhalte, EPG-Daten und Stream-URLs
/// bleiben auf dem Gerät.
public struct StreamingHubAPI {

    public static let defaultBaseURL = URL(string: "https://streaminghub.org")!

    public struct APIError: Error, LocalizedError, Sendable {
        public let status: Int
        public let code: String?
        public let message: String

        public var errorDescription: String? { message }
    }

    public struct PairingCode: Codable, Sendable {
        public let requestId: String
        public let code: String
        public let pollToken: String
        public let pollIntervalSeconds: Int
    }

    public struct PairingStatus: Sendable {
        public enum State: String, Sendable {
            case pending
            case claimed
            case expired
        }

        public let state: State
        public let activationToken: String?
    }

    private let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL = StreamingHubAPI.defaultBaseURL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    // MARK: - Kopplung

    public func requestPairing(deviceName: String, platform: String, appVersion: String) async throws -> PairingCode {
        let body: [String: String] = [
            "deviceName": deviceName,
            "platform": platform,
            "appVersion": appVersion
        ]
        let json = try await call(path: "/api/v1/pairing/request", method: "POST", body: body)
        let code = PairingCode(
            requestId: json["requestId"] as? String ?? "",
            code: json["code"] as? String ?? "",
            pollToken: json["pollToken"] as? String ?? "",
            // Die API verlangt mindestens drei Sekunden Abstand.
            pollIntervalSeconds: max(3, json["pollIntervalSeconds"] as? Int ?? 3)
        )
        guard !code.requestId.isEmpty, !code.code.isEmpty, !code.pollToken.isEmpty else {
            throw APIError(status: 200, code: "invalid_response", message: "Die Kopplungsantwort war unvollständig.")
        }
        return code
    }

    public func pollPairing(requestId: String, pollToken: String) async throws -> PairingStatus {
        var components = URLComponents()
        components.path = "/api/v1/pairing/status"
        components.queryItems = [URLQueryItem(name: "requestId", value: requestId)]
        let json = try await call(path: components.string ?? "/api/v1/pairing/status",
                                 method: "GET", token: pollToken)
        let raw = json["status"] as? String ?? "pending"
        let token = json["activationToken"] as? String
        return PairingStatus(
            state: PairingStatus.State(rawValue: raw) ?? .pending,
            activationToken: (token?.isEmpty == false) ? token : nil
        )
    }

    // MARK: - Konto

    public func me(token: String) async throws -> Account {
        let json = try await call(path: "/api/v1/me", method: "GET", token: token)
        let account = json["account"] as? [String: Any]
        let device = json["device"] as? [String: Any]
        let subscription = json["subscription"] as? [String: Any]
        let playlist = json["playlist"] as? [String: Any]

        let email = account?["email"] as? String ?? ""
        let playlistURL = (playlist?["url"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)

        return Account(
            email: email,
            displayName: nonEmpty(account?["displayName"] as? String) ?? email,
            deviceName: nonEmpty(device?["name"] as? String) ?? "StreamingHub Gerät",
            platform: device?["platform"] as? String ?? "",
            plan: nonEmpty(subscription?["plan"] as? String) ?? "premium",
            subscriptionStatus: nonEmpty(subscription?["status"] as? String) ?? "none",
            channel: nonEmpty(subscription?["channel"] as? String) ?? "web",
            currentPeriodEnd: nonEmpty(subscription?["currentPeriodEnd"] as? String),
            premiumActive: subscription?["premiumActive"] as? Bool ?? false,
            playlist: playlistURL.isEmpty
                ? nil
                : ManagedPlaylist(url: playlistURL, updatedAt: nonEmpty(playlist?["updatedAt"] as? String))
        )
    }

    // MARK: - Fortschritt

    public struct ProgressItem: Codable, Sendable {
        public let url: String
        public let positionMs: Int64
        public let durationMs: Int64
        public let updatedAt: String?
    }

    /// Fortsetzen auf anderen Geräten ist Premium; ohne Abo antwortet die API
    /// mit 402 und das Gerät behält seine Positionen lokal.
    public func fetchWatchProgress(token: String) async throws -> [ProgressItem] {
        let json = try await call(path: "/api/v1/progress", method: "GET", token: token)
        guard let items = json["items"] as? [[String: Any]] else { return [] }
        return items.compactMap { item in
            guard let url = nonEmpty(item["url"] as? String) else { return nil }
            return ProgressItem(
                url: url,
                positionMs: max(0, int64(item["positionMs"])),
                durationMs: max(0, int64(item["durationMs"])),
                updatedAt: nonEmpty(item["updatedAt"] as? String)
            )
        }
    }

    public func saveWatchProgress(token: String, url: String, positionMs: Int64, durationMs: Int64) async throws {
        _ = try await call(
            path: "/api/v1/progress",
            method: "PUT",
            token: token,
            body: ["url": url, "positionMs": positionMs, "durationMs": durationMs] as [String: Any]
        )
    }

    // MARK: - Transport

    private func call(
        path: String,
        method: String,
        token: String? = nil,
        body: Any? = nil
    ) async throws -> [String: Any] {
        guard let url = URL(string: path, relativeTo: baseURL) else {
            throw APIError(status: 0, code: "invalid_path", message: "Der API-Pfad ist ungültig.")
        }
        var request = URLRequest(url: url, timeoutInterval: 25)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("StreamingHub/1.0 (Apple)", forHTTPHeaderField: "User-Agent")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            request.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        }

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]

        guard (200..<300).contains(status) else {
            let error = json["error"] as? [String: Any]
            let message = nonEmpty(error?["message"] as? String) ?? fallbackMessage(for: status)
            throw APIError(status: status, code: nonEmpty(error?["code"] as? String), message: message)
        }
        return json
    }

    private func fallbackMessage(for status: Int) -> String {
        switch status {
        case 401: return "Die Gerätekopplung ist abgelaufen."
        case 402: return "Diese Funktion gehört zu Premium."
        case 403: return "Dieses Gerät wurde im Konto getrennt."
        case 429: return "Zu viele Versuche. Bitte warte einen Moment."
        default: return "StreamingHub antwortet mit HTTP \(status)."
        }
    }

    private func nonEmpty(_ value: String?) -> String? {
        guard let value else { return nil }
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func int64(_ value: Any?) -> Int64 {
        switch value {
        case let value as Int64: return value
        case let value as Int: return Int64(value)
        case let value as Double: return Int64(value)
        case let value as String: return Int64(value) ?? 0
        default: return 0
        }
    }
}
