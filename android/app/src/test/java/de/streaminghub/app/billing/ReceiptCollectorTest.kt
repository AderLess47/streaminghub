package de.streaminghub.app.billing

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Der Restore läuft über paginierte Store-Antworten. Diese Grenzen sind ohne
 * Fire TV prüfbar: wann weitergeblättert wird, wann Schluss ist und welcher
 * Beleg gewinnt.
 */
class ReceiptCollectorTest {

    private fun receipt(id: String, sku: String = DEFAULT_PREMIUM_SKU) = StoreReceipt(id, sku)

    @Test
    fun `a matching receipt on the first page ends the walk`() {
        val collector = ReceiptCollector(DEFAULT_PREMIUM_SKU)

        val more = collector.acceptMore(hasMore = true, page = listOf(receipt("r-1")))

        assertFalse(more)
        assertEquals("r-1", collector.receipt?.receiptId)
        assertEquals(1, collector.pages)
    }

    @Test
    fun `a page without the sku continues while the store reports more`() {
        val collector = ReceiptCollector(DEFAULT_PREMIUM_SKU)

        val more = collector.acceptMore(
            hasMore = true,
            page = listOf(receipt("other", sku = "premium_other")),
        )

        assertTrue(more)
        assertNull(collector.receipt)
    }

    @Test
    fun `the receipt is found on a later page`() {
        val collector = ReceiptCollector(DEFAULT_PREMIUM_SKU)

        collector.accept(listOf(receipt("other", sku = "premium_other")))
        val more = collector.acceptMore(hasMore = true, page = listOf(receipt("r-3")))

        assertFalse(more)
        assertEquals("r-3", collector.receipt?.receiptId)
        assertEquals(2, collector.pages)
    }

    @Test
    fun `without more pages the walk stops even without a match`() {
        val collector = ReceiptCollector(DEFAULT_PREMIUM_SKU)

        val more = collector.acceptMore(hasMore = false, page = listOf(receipt("other", "premium_other")))

        assertFalse(more)
        assertNull(collector.receipt)
    }

    @Test
    fun `an empty page counts as a page and keeps the walk inside the budget`() {
        val collector = ReceiptCollector(DEFAULT_PREMIUM_SKU, maxPages = 2)

        assertTrue(collector.acceptMore(hasMore = true, page = emptyList()))
        assertFalse(collector.acceptMore(hasMore = true, page = emptyList()))

        assertEquals(2, collector.pages)
        assertNull(collector.receipt)
    }
}
