package de.streaminghub.app.billing

import android.content.Context

/** Fire TV build: premium is sold through Amazon In-App Purchasing. */
object PremiumBillingProvider {
    fun create(context: Context): PremiumBilling = AmazonPremiumBilling(context)
}
