package de.streaminghub.app.ui

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import de.streaminghub.app.AccountUiState
import de.streaminghub.app.AppUiState
import de.streaminghub.app.EpgUiState
import de.streaminghub.app.data.AccountDeletion
import de.streaminghub.app.billing.PREMIUM_CHANNEL_AMAZON
import de.streaminghub.app.billing.PremiumBillingState
import de.streaminghub.app.data.AccountInfo
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Renders the real settings screen and checks the Amazon build's promise: no
 * premium status and no dashboard checkout link, while pairing and account
 * deletion keep working.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class SettingsScreenPremiumTest {

    @get:Rule
    val compose = createComposeRule()

    private val account = AccountInfo(
        email = "reviewer@example.com",
        displayName = "Reviewer",
        deviceName = "Fire TV Stick",
        platform = "firetv",
        deviceActivatedAt = null,
        plan = "premium",
        subscriptionStatus = "active",
        channel = "web",
        currentPeriodEnd = null,
        premiumActive = true,
    )

    private fun render(
        premiumSales: Boolean,
        accountInfo: AccountInfo?,
        openedPath: MutableList<String> = mutableListOf(),
        pairClicks: IntArray = intArrayOf(0),
        premiumChannel: String = PREMIUM_CHANNEL_AMAZON,
        premiumState: PremiumBillingState = PremiumBillingState.Ready("2,49 €"),
        buyClicks: IntArray = intArrayOf(0),
    ) {
        compose.setContent {
            SettingsScreen(
                state = AppUiState(),
                accountState = AccountUiState(account = accountInfo),
                epgState = EpgUiState(),
                lowSpecMode = false,
                onLowSpecModeChange = {},
                onBack = {},
                onPairDevice = { pairClicks[0] += 1 },
                onRefreshAccount = {},
                onForgetDevice = {},
                onAddEpg = {},
                onRefreshEpg = {},
                onRemoveEpg = {},
                onOpenGuide = {},
                onRefreshPlaylist = {},
                onRemovePlaylist = {},
                onClearProgress = {},
                onAddPlaylist = {},
                onOpenWebsite = { path -> openedPath += path },
                onDismissError = {},
                demoMode = false,
                onLoadDemo = {},
                onRemoveDemo = {},
                premiumSales = premiumSales,
                premiumChannel = premiumChannel,
                premiumState = premiumState,
                onBuyPremium = { buyClicks[0] += 1 },
                onRestorePremium = {},
            )
        }
    }

    @Test
    fun `amazon build hides the premium status of a linked account`() {
        render(premiumSales = false, accountInfo = account)

        compose.onNodeWithText("Premium aktiv").assertDoesNotExist()
        compose.onNodeWithText("Kein aktives Premium").assertDoesNotExist()
    }

    @Test
    fun `amazon build hides the dashboard checkout link and premium wording`() {
        render(premiumSales = false, accountInfo = null)

        compose.onNodeWithText("Optional – für Geräteverwaltung").assertExists()
        compose.onNodeWithText("Konto im Web verwalten").assertDoesNotExist()
        compose.onNodeWithText("Gerät koppeln").assertIsDisplayed()
    }

    @Test
    fun `the Amazon purchase card starts a purchase`() {
        val buys = intArrayOf(0)
        render(premiumSales = true, accountInfo = null, buyClicks = buys)

        compose.onNodeWithTag("settings-list")
            .performScrollToNode(hasText("Premium über Amazon abschließen"))
        compose.waitForIdle()
        compose.onNodeWithText("Premium über Amazon abschließen").performClick()
        compose.waitForIdle()

        assertEquals(1, buys[0])
    }

    @Test
    fun `the Amazon build hides the purchase card as long as sales are off`() {
        render(premiumSales = false, accountInfo = null)

        compose.onNodeWithText("Premium über Amazon abschließen").assertDoesNotExist()
    }

    @Test
    fun `the direct build has no Amazon purchase card`() {
        render(premiumSales = true, accountInfo = null, premiumChannel = "web")

        compose.onNodeWithText("Premium über Amazon abschließen").assertDoesNotExist()
    }

    @Test
    fun `direct build keeps premium wording and the dashboard link`() {
        render(premiumSales = true, accountInfo = null)

        compose.onNodeWithText("Optional – für Geräteverwaltung und Premium-Status").assertExists()
        compose.onNodeWithText("Konto im Web verwalten").assertExists()
    }

    @Test
    fun `direct build keeps the premium status of a linked account`() {
        render(premiumSales = true, accountInfo = account)

        compose.onNodeWithText("Premium aktiv").assertExists()
    }

    @Test
    fun `account deletion entry opens the public deletion page`() {
        val opened = mutableListOf<String>()
        render(premiumSales = false, accountInfo = account, openedPath = opened)

        compose.onNodeWithTag("settings-list").performScrollToNode(hasText("Konto löschen"))
        compose.waitForIdle()
        compose.onNodeWithText("Konto löschen").performClick()
        compose.waitForIdle()

        assertEquals(listOf(AccountDeletion.PATH), opened)
        assertEquals("/account-deletion", opened.single())
    }

    @Test
    fun `pairing stays available without premium`() {
        val pairs = intArrayOf(0)
        render(premiumSales = false, accountInfo = null, pairClicks = pairs)

        compose.onNodeWithText("Gerät koppeln").performClick()
        compose.waitForIdle()

        assertEquals(1, pairs[0])
    }
}
