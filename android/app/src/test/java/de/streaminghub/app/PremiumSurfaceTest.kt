package de.streaminghub.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Both builds sell premium: the direct build on the website, the Amazon build
 * through Amazon In-App Purchasing. The channel decides which UI is shown.
 */
class PremiumSurfaceTest {

    @Test
    fun `premium sales are enabled in both flavors`() {
        when (BuildConfig.FLAVOR) {
            "amazon" -> {
                assertTrue("Amazon build sells via IAP", BuildConfig.PREMIUM_SALES)
                assertEquals("amazon", BuildConfig.PREMIUM_CHANNEL)
            }
            "direct" -> {
                assertTrue("Direct build keeps premium sales", BuildConfig.PREMIUM_SALES)
                assertEquals("web", BuildConfig.PREMIUM_CHANNEL)
            }
            else -> fail("Unexpected distribution flavor: ${BuildConfig.FLAVOR}")
        }
    }
}
