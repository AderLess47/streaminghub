package de.streaminghub.app.billing

import android.content.Context

/**
 * The direct (sideload) build sells premium on the website, so there is no
 * in-app purchase path and the settings screen keeps the dashboard link.
 */
object PremiumBillingProvider {
    fun create(context: Context): PremiumBilling = UnavailablePremiumBilling
}
