package de.streaminghub.app.billing

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

const val DEFAULT_PREMIUM_SKU = "premium_monthly"

sealed interface PremiumBillingState {
    data object Loading : PremiumBillingState
    data object Unavailable : PremiumBillingState
    data class Ready(val displayPrice: String?) : PremiumBillingState
    data object Purchasing : PremiumBillingState
    data object Pending : PremiumBillingState
    data class Active(val currentPeriodEnd: String?) : PremiumBillingState
    data class Error(val message: String) : PremiumBillingState
}

/** What the server answered after a receipt was submitted. */
data class SubmissionResult(
    val premiumActive: Boolean,
    val currentPeriodEnd: String? = null,
    val message: String? = null,
)

/**
 * Purchase state machine. It never grants premium on its own: the store receipt
 * goes to the server, and only `premiumActive` from the server response counts.
 */
class PremiumPurchaseController(
    private val billing: PremiumBilling,
    private val submitReceipt: suspend (BillingReceipt) -> SubmissionResult,
    private val refreshSubscription: suspend () -> SubmissionResult,
    private val sku: String = DEFAULT_PREMIUM_SKU,
) {
    private val _state = MutableStateFlow<PremiumBillingState>(PremiumBillingState.Loading)
    val state: StateFlow<PremiumBillingState> = _state

    suspend fun load() {
        _state.value = PremiumBillingState.Loading
        val offer = runCatching { billing.offer(sku) }.getOrNull()
        _state.value = if (offer != null && offer.available) {
            PremiumBillingState.Ready(offer.displayPrice)
        } else {
            PremiumBillingState.Unavailable
        }
    }

    suspend fun purchase() {
        _state.value = PremiumBillingState.Purchasing
        val outcome = runCatching { billing.purchase(sku) }.getOrElse { throwable ->
            BillingOutcome.Failed(throwable.message ?: "Der Amazon-Kauf konnte nicht gestartet werden.")
        }
        handle(outcome, restoring = false)
    }

    suspend fun restore() {
        _state.value = PremiumBillingState.Purchasing
        val outcome = runCatching { billing.restore(sku) }.getOrElse { throwable ->
            BillingOutcome.Failed(throwable.message ?: "Der Kauf konnte nicht wiederhergestellt werden.")
        }
        when (outcome) {
            // Nothing to restore: the server may still know an active subscription.
            BillingOutcome.Unavailable -> refresh()
            else -> handle(outcome, restoring = true)
        }
    }

    /** Re-checks the subscription with the server (renewal, cancellation). */
    suspend fun refresh() {
        _state.value = PremiumBillingState.Loading
        val result = runCatching { refreshSubscription() }.getOrElse { throwable ->
            _state.value = PremiumBillingState.Error(
                throwable.message ?: "Der Abo-Status konnte nicht geladen werden.",
            )
            return
        }
        _state.value = if (result.premiumActive) {
            PremiumBillingState.Active(result.currentPeriodEnd)
        } else {
            PremiumBillingState.Error(result.message ?: "Kein aktives Premium-Abo gefunden.")
        }
    }

    private suspend fun handle(outcome: BillingOutcome, restoring: Boolean) {
        when (outcome) {
            is BillingOutcome.Purchased -> submit(outcome.receipt)
            BillingOutcome.AlreadyOwned -> if (restoring) {
                _state.value = PremiumBillingState.Error("Kein Kauf auf diesem Gerät gefunden.")
            } else {
                restore()
            }
            BillingOutcome.Pending -> _state.value = PremiumBillingState.Pending
            is BillingOutcome.Failed -> _state.value = PremiumBillingState.Error(outcome.message)
            BillingOutcome.Unavailable -> _state.value = PremiumBillingState.Unavailable
        }
    }

    private suspend fun submit(receipt: BillingReceipt) {
        val result = runCatching { submitReceipt(receipt) }.getOrElse { throwable ->
            _state.value = PremiumBillingState.Error(
                throwable.message ?: "Der Kaufbeleg konnte nicht geprüft werden.",
            )
            return
        }
        if (!result.premiumActive) {
            _state.value = PremiumBillingState.Error(
                result.message ?: "Der Kaufbeleg wurde vom Server nicht bestätigt.",
            )
            return
        }
        // The store marks the item fulfilled only after the server agreed.
        runCatching { billing.acknowledge(receipt.receiptId) }
        _state.value = PremiumBillingState.Active(result.currentPeriodEnd)
    }
}
