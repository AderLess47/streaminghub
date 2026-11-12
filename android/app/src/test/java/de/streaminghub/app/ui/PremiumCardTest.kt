package de.streaminghub.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import de.streaminghub.app.billing.PremiumBillingState
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PremiumCardTest {

    @get:Rule
    val compose = createComposeRule()

    private fun render(
        state: PremiumBillingState,
        buys: IntArray = intArrayOf(0),
        restores: IntArray = intArrayOf(0),
    ) {
        compose.setContent {
            PremiumCard(
                state = state,
                onBuy = { buys[0] += 1 },
                onRestore = { restores[0] += 1 },
            )
        }
    }

    @Test
    fun `a ready offer shows the store price and starts the purchase`() {
        val buys = intArrayOf(0)
        render(PremiumBillingState.Ready("2,49 €"), buys = buys)

        compose.onNodeWithText("2,49 € pro Monat").assertIsDisplayed()
        compose.onNodeWithText("Premium über Amazon abschließen").performClick()
        compose.waitForIdle()

        assertEquals(1, buys[0])
    }

    @Test
    fun `an active subscription shows the renewal date without a purchase button`() {
        render(PremiumBillingState.Active("2026-12-12T00:00:00.000Z"))

        compose.onNodeWithText("Premium aktiv").assertIsDisplayed()
        compose.onNodeWithText("Nächste Verlängerung: 2026-12-12").assertIsDisplayed()
        compose.onNodeWithText("Premium über Amazon abschließen").assertDoesNotExist()
        compose.onNodeWithText("Status aktualisieren").assertIsDisplayed()
    }

    @Test
    fun `a pending payment explains the wait`() {
        render(PremiumBillingState.Pending)

        compose.onNodeWithText(
            "Die Zahlung wird geprüft. Premium wird freigeschaltet, sobald Amazon den Kauf bestätigt.",
        ).assertIsDisplayed()
    }

    @Test
    fun `an error keeps the message and offers a retry`() {
        val buys = intArrayOf(0)
        render(PremiumBillingState.Error("Der Kaufbeleg konnte nicht geprüft werden."), buys = buys)

        compose.onNodeWithText("Der Kaufbeleg konnte nicht geprüft werden.").assertIsDisplayed()
        compose.onNodeWithText("Erneut versuchen").performClick()
        compose.waitForIdle()

        assertEquals(1, buys[0])
    }

    @Test
    fun `restore is reachable in every purchasable state`() {
        val restores = intArrayOf(0)
        render(PremiumBillingState.Ready(null), restores = restores)

        compose.onNodeWithText("Kauf wiederherstellen").performClick()
        compose.waitForIdle()

        assertEquals(1, restores[0])
    }

    @Test
    fun `an unavailable store explains itself instead of showing a price`() {
        render(PremiumBillingState.Unavailable)

        compose.onNodeWithText(
            "In-App-Käufe sind auf diesem Gerät gerade nicht verfügbar. Bitte versuche es später erneut.",
        ).assertIsDisplayed()
        compose.onNodeWithText("Premium über Amazon abschließen").assertDoesNotExist()
    }
}
