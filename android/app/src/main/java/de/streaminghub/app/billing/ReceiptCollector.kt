package de.streaminghub.app.billing

/**
 * Sammelt Belege aus den paginierten `getPurchaseUpdates`-Antworten.
 *
 * Amazon liefert die Kaufhistorie seitenweise und meldet über `hasMore()`, ob
 * weitere Seiten folgen. Nach [MAX_PAGES] Seiten bricht die Schleife ab: ein
 * Restore soll nicht unbegrenzt Store-Anfragen absetzen, nur weil eine Seite
 * das gesuchte Produkt nicht enthält.
 */
internal data class StoreReceipt(
    val receiptId: String,
    val productId: String,
)

internal class ReceiptCollector(
    private val sku: String,
    private val maxPages: Int = MAX_PAGES,
) {
    var pages: Int = 0
        private set

    var receipt: StoreReceipt? = null
        private set

    /** Nimmt eine Seite auf und sagt, ob noch eine weitere angefordert werden soll. */
    fun accept(page: List<StoreReceipt>): Boolean {
        pages += 1
        if (receipt == null && page.isNotEmpty()) {
            receipt = page.firstOrNull { it.productId == sku }
        }
        return receipt == null && pages < maxPages
    }

    /** Wie [accept], aber zusätzlich an `hasMore()` der Store-Antwort gebunden. */
    fun acceptMore(hasMore: Boolean, page: List<StoreReceipt>): Boolean =
        accept(page) && hasMore

    companion object {
        const val MAX_PAGES = 10
    }
}
