package de.streaminghub.app.billing

import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The controller must never unlock premium from the store alone: only the server
 * response decides, and a rejected receipt stays rejected.
 */
class PremiumPurchaseControllerTest {

    private val receipt = BillingReceipt(
        receiptId = "receipt-1",
        appUserId = "amazon-user-1",
        productId = DEFAULT_PREMIUM_SKU,
    )

    private class FakeBilling(
        private val offer: PremiumOffer = PremiumOffer(DEFAULT_PREMIUM_SKU, "2,49 €", true),
        private val purchaseOutcome: BillingOutcome = BillingOutcome.Purchased(
            BillingReceipt("receipt-1", "amazon-user-1", DEFAULT_PREMIUM_SKU),
        ),
        private val restoreOutcome: BillingOutcome = BillingOutcome.Unavailable,
    ) : PremiumBilling {
        var acknowledgedReceipt: String? = null
        var restoreCalls = 0

        override suspend fun offer(sku: String) = offer
        override suspend fun purchase(sku: String) = purchaseOutcome
        override suspend fun restore(sku: String): BillingOutcome {
            restoreCalls += 1
            return restoreOutcome
        }

        override suspend fun acknowledge(receiptId: String) {
            acknowledgedReceipt = receiptId
        }
    }

    private fun controller(
        billing: PremiumBilling,
        submit: suspend (BillingReceipt) -> SubmissionResult = {
            SubmissionResult(premiumActive = true, currentPeriodEnd = "2026-12-12T00:00:00.000Z")
        },
        refresh: suspend () -> SubmissionResult = { SubmissionResult(premiumActive = false) },
    ) = PremiumPurchaseController(billing, submit, refresh)

    @Test
    fun `loading a purchasable offer shows the store price`() = runBlocking {
        val subject = controller(FakeBilling())

        subject.load()

        assertEquals(PremiumBillingState.Ready("2,49 €"), subject.state.value)
    }

    @Test
    fun `without a store offer the card stays unavailable`() = runBlocking {
        val subject = controller(FakeBilling(offer = PremiumOffer(DEFAULT_PREMIUM_SKU, null, false)))

        subject.load()

        assertEquals(PremiumBillingState.Unavailable, subject.state.value)
    }

    @Test
    fun `a confirmed receipt activates premium and is acknowledged`() = runBlocking {
        val billing = FakeBilling()
        var submitted: BillingReceipt? = null
        val subject = controller(
            billing = billing,
            submit = { submitted = it; SubmissionResult(true, "2026-12-12T00:00:00.000Z") },
        )

        subject.purchase()

        assertEquals(receipt.receiptId, submitted?.receiptId)
        assertEquals("amazon-user-1", submitted?.appUserId)
        assertEquals(PremiumBillingState.Active("2026-12-12T00:00:00.000Z"), subject.state.value)
        assertEquals("receipt-1", billing.acknowledgedReceipt)
    }

    @Test
    fun `a receipt the server rejects grants nothing and is not acknowledged`() = runBlocking {
        val billing = FakeBilling()
        val subject = controller(
            billing = billing,
            submit = { SubmissionResult(false, message = "Für dieses Konto ist bereits ein Web-Abo aktiv.") },
        )

        subject.purchase()

        assertTrue(subject.state.value is PremiumBillingState.Error)
        assertEquals(
            "Für dieses Konto ist bereits ein Web-Abo aktiv.",
            (subject.state.value as PremiumBillingState.Error).message,
        )
        assertNull(billing.acknowledgedReceipt)
    }

    @Test
    fun `a failing submission keeps the error message`() = runBlocking {
        val subject = controller(
            billing = FakeBilling(),
            submit = { throw IllegalStateException("Dieses Gerät ist nicht mit einem Konto verbunden.") },
        )

        subject.purchase()

        val state = subject.state.value as PremiumBillingState.Error
        assertEquals("Dieses Gerät ist nicht mit einem Konto verbunden.", state.message)
    }

    @Test
    fun `a pending payment is shown as pending`() = runBlocking {
        val subject = controller(FakeBilling(purchaseOutcome = BillingOutcome.Pending))

        subject.purchase()

        assertEquals(PremiumBillingState.Pending, subject.state.value)
    }

    @Test
    fun `a failed purchase shows the store message`() = runBlocking {
        val subject = controller(
            FakeBilling(purchaseOutcome = BillingOutcome.Failed("Der Kauf wurde nicht abgeschlossen.")),
        )

        subject.purchase()

        assertEquals(
            PremiumBillingState.Error("Der Kauf wurde nicht abgeschlossen."),
            subject.state.value,
        )
    }

    @Test
    fun `an already owned purchase runs the restore path`() = runBlocking {
        val billing = FakeBilling(
            purchaseOutcome = BillingOutcome.AlreadyOwned,
            restoreOutcome = BillingOutcome.Purchased(receipt),
        )

        controller(billing).purchase()

        assertEquals(1, billing.restoreCalls)
    }

    @Test
    fun `restore without a local purchase falls back to the server state`() = runBlocking {
        val subject = controller(
            billing = FakeBilling(restoreOutcome = BillingOutcome.Unavailable),
            refresh = { SubmissionResult(true, "2027-01-01T00:00:00.000Z") },
        )

        subject.restore()

        assertEquals(PremiumBillingState.Active("2027-01-01T00:00:00.000Z"), subject.state.value)
    }

    @Test
    fun `restore without purchase or subscription reports that nothing was found`() = runBlocking {
        val subject = controller(
            billing = FakeBilling(restoreOutcome = BillingOutcome.Unavailable),
            refresh = { SubmissionResult(false) },
        )

        subject.restore()

        assertTrue(subject.state.value is PremiumBillingState.Error)
    }
}
