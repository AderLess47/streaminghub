import Foundation
import Observation
import StoreKit

/// Premium-Kauf über StoreKit 2.
///
/// Grundregel wie in den anderen Clients: Premium entsteht nie im Client. StoreKit
/// liefert eine signierte Transaktion (JWS); erst wenn der Server sie geprüft und
/// `premiumActive` bestätigt hat, gilt das Abo in der App. Fehlt die
/// Serverprüfung, bleibt der Kauf gesperrt statt scheinbar zu funktionieren.
@MainActor
@Observable
final class PremiumStore {

    enum State: Equatable {
        case loading
        case unavailable(String)
        case ready(displayPrice: String)
        case purchasing
        case pending
        case active(until: String?)
        case error(String)
    }

    /// Wird von der App gesetzt, sobald der Server eine Prüfung anbietet. Solange
    /// sie fehlt, ist der Kauf bewusst nicht möglich (siehe README).
    typealias Verifier = (_ jws: String, _ productID: String) async throws -> Bool

    static let productID = "premium_monthly"

    private(set) var state: State = .loading
    private var verifier: Verifier?

    func configure(verifier: Verifier?) {
        self.verifier = verifier
    }

    func load() async {
        guard verifier != nil else {
            state = .unavailable("Die serverseitige Prüfung von App-Store-Käufen ist noch nicht eingerichtet.")
            return
        }
        do {
            let products = try await Product.products(for: [Self.productID])
            guard let product = products.first else {
                state = .unavailable("Das Abo ist im App Store noch nicht angelegt.")
                return
            }
            state = .ready(displayPrice: product.displayPrice)
        } catch {
            state = .error("Der App Store ist nicht erreichbar: \(error.localizedDescription)")
        }
    }

    func purchase() async {
        guard let verifier else {
            state = .unavailable("Die serverseitige Prüfung von App-Store-Käufen ist noch nicht eingerichtet.")
            return
        }
        state = .purchasing
        do {
            guard let product = try await Product.products(for: [Self.productID]).first else {
                state = .unavailable("Das Abo ist im App Store noch nicht angelegt.")
                return
            }
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                let transaction = try checkVerified(verification)
                state = .pending
                guard try await verifier(verification.jwsRepresentation, product.id) else {
                    state = .error("Der Server hat den Kauf nicht bestätigt.")
                    return
                }
                await transaction.finish()
                state = .active(until: nil)
            case .pending:
                state = .pending
            case .userCancelled:
                state = .ready(displayPrice: product.displayPrice)
            @unknown default:
                state = .error("Unbekanntes Ergebnis des Kaufs.")
            }
        } catch {
            state = .error("Der Kauf ist fehlgeschlagen: \(error.localizedDescription)")
        }
    }

    /// Prüft die Signatur lokal; die inhaltliche Prüfung bleibt beim Server.
    private func checkVerified<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value):
            return value
        case .unverified:
            throw StoreError.failedVerification
        }
    }

    enum StoreError: LocalizedError {
        case failedVerification

        var errorDescription: String? {
            "Die Transaktion konnte nicht verifiziert werden."
        }
    }
}
