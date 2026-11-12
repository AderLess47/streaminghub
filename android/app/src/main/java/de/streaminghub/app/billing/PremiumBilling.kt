package de.streaminghub.app.billing

/** Channel marker for the Fire TV build: premium is sold through Amazon IAP. */
const val PREMIUM_CHANNEL_AMAZON = "amazon"

/** Offer shown before a purchase. The price comes from the store, never from code. */
data class PremiumOffer(
    val sku: String,
    val displayPrice: String?,
    val available: Boolean,
)

/** Everything the server needs to verify a purchase. */
data class BillingReceipt(
    val receiptId: String,
    val appUserId: String,
    val productId: String,
)

sealed interface BillingOutcome {
    data class Purchased(val receipt: BillingReceipt) : BillingOutcome
    data object AlreadyOwned : BillingOutcome
    data object Pending : BillingOutcome
    data class Failed(val message: String) : BillingOutcome
    data object Unavailable : BillingOutcome
}

/**
 * Store abstraction. The Amazon flavour implements it with the Appstore SDK;
 * the direct build uses [UnavailablePremiumBilling] because it sells on the web.
 */
interface PremiumBilling {
    suspend fun offer(sku: String): PremiumOffer
    suspend fun purchase(sku: String): BillingOutcome
    suspend fun restore(sku: String): BillingOutcome

    /** Confirms fulfilment to the store once the server accepted the receipt. */
    suspend fun acknowledge(receiptId: String)
}

object UnavailablePremiumBilling : PremiumBilling {
    override suspend fun offer(sku: String) = PremiumOffer(sku, null, available = false)
    override suspend fun purchase(sku: String) = BillingOutcome.Unavailable
    override suspend fun restore(sku: String) = BillingOutcome.Unavailable
    override suspend fun acknowledge(receiptId: String) = Unit
}
