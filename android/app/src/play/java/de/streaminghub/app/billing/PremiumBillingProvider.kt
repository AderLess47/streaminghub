package de.streaminghub.app.billing

import android.content.Context

/**
 * Google-Play-Build: In-App-Käufe sind noch nicht angebunden. Android darf
 * keinen Web-Checkout verlinken, deshalb bleibt der Kaufweg hier aus und die
 * App zeigt nur den vom Server bestätigten Premium-Status, wenn ein Konto
 * bereits über einen anderen Kanal bezahlt hat.
 */
object PremiumBillingProvider {
    fun create(context: Context): PremiumBilling = UnavailablePremiumBilling
}
