package de.streaminghub.app.screenshots

import android.graphics.Bitmap
import android.graphics.Canvas
import androidx.activity.ComponentActivity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.paging.PagingData
import de.streaminghub.app.AccountUiState
import de.streaminghub.app.AppUiState
import de.streaminghub.app.EpgUiState
import de.streaminghub.app.billing.PREMIUM_CHANNEL_AMAZON
import de.streaminghub.app.billing.PremiumBillingState
import de.streaminghub.app.data.DemoLibrary
import de.streaminghub.app.data.M3uParser
import de.streaminghub.app.data.PairingCodeData
import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.MediaKind
import de.streaminghub.app.ui.GuideScreen
import de.streaminghub.app.ui.HomeScreen
import de.streaminghub.app.ui.PairingScreen
import de.streaminghub.app.ui.PlayerTopBar
import de.streaminghub.app.ui.SettingsScreen
import de.streaminghub.app.ui.theme.Ink
import de.streaminghub.app.ui.theme.StreamingHubTheme
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.flow.flowOf
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Erzeugt die Store-Screenshots für Fire TV aus der echten Compose-Oberfläche.
 *
 * Der Test rendert die produktiven Screens mit den Demo-Inhalten der App – keine
 * gezeichneten Mockups, keine eigene Schrift, keine erfundenen Versionszeilen.
 * Das Fenster ist mit `w960dp-h540dp-television-xhdpi` exakt 1920×1080 Pixel
 * groß und meldet den TV-UI-Modus, also dieselben 224-dp-Karten und Ränder wie
 * auf einem Fire TV.
 *
 * Ohne `AMAZON_SCREENSHOT_DIR` wird der Test übersprungen, damit die normalen
 * Unit-Test-Läufe keine Bilder schreiben. Aufruf über
 * `scripts/capture-amazon-screens.sh`.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w960dp-h540dp-television-xhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class AmazonScreenshotsTest {

    @get:Rule
    val compose = createAndroidComposeRule<ComponentActivity>()

    private val outputDir: String? = System.getenv("AMAZON_SCREENSHOT_DIR")

    private val channels: List<Channel> = M3uParser.parse(DemoLibrary.playlist)
    private val categories: List<String> = channels.map { it.group }.distinct()

    @Before
    fun requireCaptureDirectory() {
        assumeTrue("AMAZON_SCREENSHOT_DIR nicht gesetzt – Screenshot-Lauf übersprungen", outputDir != null)
        applyFireTvDeviceName()
    }

    /**
     * Ohne diese Werte steht in der Kopplungsansicht „Gerät: robolectric
     * robolectric“, weil Robolectric keinen Gerätenamen mitbringt. Die
     * Screenshots zeigen deshalb dieselbe Gerätebezeichnung, die ein Fire TV
     * an dieser Stelle anzeigt.
     */
    private fun applyFireTvDeviceName() {
        for ((field, value) in listOf("MANUFACTURER" to "Amazon", "MODEL" to "Fire TV Stick")) {
            val target = android.os.Build::class.java.getDeclaredField(field)
            target.isAccessible = true
            target.set(null, value)
        }
    }

    @Test
    fun `01 live tv overview`() {
        render {
            HomeScreen(
                state = AppUiState(
                    channels = channels,
                    sourceLabel = DemoLibrary.SOURCE_LABEL,
                    demoMode = true,
                    updatedAt = System.currentTimeMillis(),
                ),
                categories = categories,
                channelPages = { _, _, _ -> flowOf(PagingData.from(channels)) },
                onPlay = {},
                onToggleFavorite = {},
                onAddPlaylist = {},
                onOpenSettings = {},
                onDismissError = {},
                onOpenWebsite = {},
                hasEpg = true,
                onOpenGuide = {},
                lowSpecMode = false,
                demoMode = true,
                onLoadDemo = {},
                onExitDemo = {},
            )
        }
        capture("01-live-tv.png")
    }

    @Test
    fun `02 programme guide`() {
        val now = System.currentTimeMillis()
        render {
            GuideScreen(
                channels = channels,
                epgState = EpgUiState(
                    programmes = DemoLibrary.programmes(now),
                    sourceUrl = "Demo-Programmdaten",
                    updatedAt = now,
                ),
                onPlay = {},
                onDismissError = {},
                onBack = {},
            )
        }
        capture("02-programmfuehrer.png")
    }

    @Test
    fun `03 player overlay`() {
        val channel = channels.first { it.kind == MediaKind.LIVE }
        render {
            Box(modifier = Modifier.fillMaxSize().background(Color.Black)) {
                PlayerTopBar(channel = channel, onBack = {})
            }
        }
        capture("03-player.png")
    }

    @Test
    fun `04 premium`() {
        render {
            SettingsScreen(
                state = AppUiState(
                    channels = channels,
                    sourceLabel = DemoLibrary.SOURCE_LABEL,
                    demoMode = true,
                ),
                accountState = AccountUiState(),
                epgState = EpgUiState(),
                lowSpecMode = false,
                onLowSpecModeChange = {},
                onBack = {},
                onPairDevice = {},
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
                onOpenWebsite = {},
                onDismissError = {},
                demoMode = true,
                onLoadDemo = {},
                onRemoveDemo = {},
                premiumSales = true,
                premiumChannel = PREMIUM_CHANNEL_AMAZON,
                premiumState = PremiumBillingState.Ready("3,49 €"),
            )
        }
        // Die Premium-Karte ist der dritte Eintrag der Einstellungsliste. Nach
        // dem Scrollen wird sie etwas nach unten gezogen, damit die Karte über
        // ihrer Oberkante Luft bekommt und nicht am Fensterrand klebt.
        compose.onNodeWithTag("settings-list").performScrollToIndex(2)
        compose.waitForIdle()
        compose.onNodeWithTag("settings-list").performTouchInput {
            swipeDown(startY = height * 0.3f, endY = height * 0.3f + 200f, durationMillis = 200)
        }
        compose.waitForIdle()
        capture("04-premium.png")
    }

    @Test
    fun `05 device pairing`() {
        render {
            PairingScreen(
                state = AccountUiState(
                    pairing = PairingCodeData(
                        requestId = "demo-request",
                        code = "482 913",
                        pollToken = "demo-token",
                        pollIntervalSeconds = 5,
                    ),
                ),
                onStartPairing = {},
                onDismissPairingError = {},
                onBack = {},
                onPaired = {},
                premiumSales = true,
            )
        }
        capture("05-kopplung.png")
    }

    private fun render(content: @Composable () -> Unit) {
        compose.setContent { StreamingHubTheme { content() } }
        compose.waitForIdle()
    }

    /**
     * Zeichnet das echte Fenster der Test-Activity in eine Bitmap. Robolectrics
     * `captureToImage()` scheitert an `PixelCopy`; das direkte `View.draw` nutzt
     * denselben Compose-Renderer und liefert dieselben Pixel.
     */
    private fun capture(fileName: String) {
        val directory = File(requireNotNull(outputDir))
        assertTrue("Screenshot-Verzeichnis fehlt: $directory", directory.isDirectory || directory.mkdirs())

        compose.waitForIdle()
        val view = compose.activity.window.decorView
        assertTrue("Fenster hat keine Größe: ${view.width}×${view.height}", view.width > 0 && view.height > 0)

        val bitmap = Bitmap.createBitmap(view.width, view.height, Bitmap.Config.ARGB_8888)
        view.draw(Canvas(bitmap))
        val file = File(directory, fileName)
        FileOutputStream(file).use { out ->
            check(bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) { "PNG konnte nicht geschrieben werden" }
        }
        println("Screenshot: ${file.absolutePath} (${bitmap.width}×${bitmap.height})")
    }
}
