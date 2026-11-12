package de.streaminghub.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * The Amazon Appstore build must not surface the web subscription, because
 * Amazon requires digital content used in the app to be sold via Amazon IAP.
 */
class PremiumSurfaceTest {

    @Test
    fun `premium sales follow the distribution flavor`() {
        when (BuildConfig.FLAVOR) {
            "amazon" -> assertFalse("Amazon build must hide premium sales", BuildConfig.PREMIUM_SALES)
            "direct" -> assertTrue("Direct build keeps premium sales", BuildConfig.PREMIUM_SALES)
            else -> fail("Unexpected distribution flavor: ${BuildConfig.FLAVOR}")
        }
    }
}
