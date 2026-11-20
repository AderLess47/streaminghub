package de.streaminghub.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Der direkte Build verkauft auf der Website, Amazon über IAP. Der Play-Build
 * darf keinen Web-Checkout verlinken und zeigt deshalb keinen Kaufweg.
 */
class PremiumSurfaceTest {

    @Test
    fun `premium surface matches the distribution flavor`() {
        when (BuildConfig.FLAVOR) {
            "amazon" -> {
                assertTrue("Amazon build sells via IAP", BuildConfig.PREMIUM_SALES)
                assertEquals("amazon", BuildConfig.PREMIUM_CHANNEL)
            }
            "direct" -> {
                assertTrue("Direct build keeps premium sales", BuildConfig.PREMIUM_SALES)
                assertEquals("web", BuildConfig.PREMIUM_CHANNEL)
            }
            "play" -> {
                assertFalse("Play build must not link the web checkout", BuildConfig.PREMIUM_SALES)
                assertEquals("play", BuildConfig.PREMIUM_CHANNEL)
            }
            else -> fail("Unexpected distribution flavor: ${BuildConfig.FLAVOR}")
        }
    }
}
