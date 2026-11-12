package de.streaminghub.app.billing

import android.content.Context
import com.amazon.device.iap.PurchasingListener
import com.amazon.device.iap.PurchasingService
import com.amazon.device.iap.model.FulfillmentResult
import com.amazon.device.iap.model.ProductDataResponse
import com.amazon.device.iap.model.PurchaseResponse
import com.amazon.device.iap.model.PurchaseUpdatesResponse
import com.amazon.device.iap.model.UserDataResponse
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Amazon Appstore SDK bridge. The SDK is callback based, so every call parks a
 * [CompletableDeferred] that the listener completes. The purchase is reported to
 * the store as fulfilled only after the server accepted the receipt
 * (see [PremiumPurchaseController]).
 */
class AmazonPremiumBilling(context: Context) : PremiumBilling {

    private val appContext = context.applicationContext

    private var productDataRequest: CompletableDeferred<ProductDataResponse>? = null
    private var purchaseRequest: CompletableDeferred<PurchaseResponse>? = null
    private var updatesRequest: CompletableDeferred<PurchaseUpdatesResponse>? = null

    private val listener = object : PurchasingListener {
        override fun onUserDataResponse(response: UserDataResponse) = Unit

        override fun onProductDataResponse(response: ProductDataResponse) {
            productDataRequest?.complete(response)
        }

        override fun onPurchaseResponse(response: PurchaseResponse) {
            purchaseRequest?.complete(response)
        }

        override fun onPurchaseUpdatesResponse(response: PurchaseUpdatesResponse) {
            updatesRequest?.complete(response)
        }
    }

    init {
        PurchasingService.registerListener(appContext, listener)
    }

    override suspend fun offer(sku: String): PremiumOffer {
        val response = requestProductData(setOf(sku))
            ?: return PremiumOffer(sku, displayPrice = null, available = false)
        if (response.requestStatus?.name != STATUS_SUCCESSFUL) {
            return PremiumOffer(sku, displayPrice = null, available = false)
        }
        val product = response.productData?.get(sku)
            ?: return PremiumOffer(sku, displayPrice = null, available = false)
        return PremiumOffer(sku, displayPrice = product.price, available = true)
    }

    override suspend fun purchase(sku: String): BillingOutcome {
        val deferred = CompletableDeferred<PurchaseResponse>()
        purchaseRequest = deferred
        return try {
            PurchasingService.purchase(sku)
            val response = withTimeoutOrNull(TIMEOUT_MS) { deferred.await() }
                ?: return BillingOutcome.Failed("Amazon hat nicht geantwortet. Bitte versuche es erneut.")
            outcomeOf(response)
        } finally {
            purchaseRequest = null
        }
    }

    override suspend fun restore(sku: String): BillingOutcome {
        val deferred = CompletableDeferred<PurchaseUpdatesResponse>()
        updatesRequest = deferred
        return try {
            PurchasingService.getPurchaseUpdates(false)
            val response = withTimeoutOrNull(TIMEOUT_MS) { deferred.await() }
                ?: return BillingOutcome.Failed("Amazon hat nicht geantwortet. Bitte versuche es erneut.")
            if (response.requestStatus?.name != STATUS_SUCCESSFUL) return BillingOutcome.Unavailable

            val receipt = response.receipts.orEmpty().firstOrNull { it.sku == sku }
                ?: return BillingOutcome.Unavailable
            val appUserId = response.userData?.userId.orEmpty()
            if (appUserId.isBlank()) return BillingOutcome.Failed("Amazon hat keine Kundennummer geliefert.")

            BillingOutcome.Purchased(
                BillingReceipt(
                    receiptId = receipt.receiptId,
                    appUserId = appUserId,
                    productId = receipt.sku,
                ),
            )
        } finally {
            updatesRequest = null
        }
    }

    override suspend fun acknowledge(receiptId: String) {
        runCatching {
            PurchasingService.notifyFulfillment(receiptId, FulfillmentResult.FULFILLED)
        }
    }

    private suspend fun requestProductData(skus: Set<String>): ProductDataResponse? {
        val deferred = CompletableDeferred<ProductDataResponse>()
        productDataRequest = deferred
        return try {
            PurchasingService.getProductData(skus)
            withTimeoutOrNull(TIMEOUT_MS) { deferred.await() }
        } finally {
            productDataRequest = null
        }
    }

    private fun outcomeOf(response: PurchaseResponse): BillingOutcome {
        return when (response.requestStatus?.name) {
            STATUS_SUCCESSFUL -> {
                val receipt = response.receipt
                    ?: return BillingOutcome.Failed("Amazon hat keinen Kaufbeleg geliefert.")
                val appUserId = response.userData?.userId.orEmpty()
                if (appUserId.isBlank()) {
                    return BillingOutcome.Failed("Amazon hat keine Kundennummer geliefert.")
                }
                BillingOutcome.Purchased(
                    BillingReceipt(
                        receiptId = receipt.receiptId,
                        appUserId = appUserId,
                        productId = receipt.sku,
                    ),
                )
            }
            "ALREADY_PURCHASED" -> BillingOutcome.AlreadyOwned
            "PENDING" -> BillingOutcome.Pending
            "INVALID_SKU" -> BillingOutcome.Failed("Dieses Abo ist im Amazon Appstore nicht verfügbar.")
            "NOT_SUPPORTED" -> BillingOutcome.Unavailable
            else -> BillingOutcome.Failed("Der Kauf wurde nicht abgeschlossen.")
        }
    }

    private companion object {
        const val TIMEOUT_MS = 60_000L
        const val STATUS_SUCCESSFUL = "SUCCESSFUL"
    }
}
