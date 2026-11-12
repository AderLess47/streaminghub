package de.streaminghub.app.ui

import android.content.res.Configuration
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * The same APK runs on Fire TV, Android TV, phones, tablets and ChromeOS/
 * laptop-sized windows. Instead of guessing from the device name, the layout
 * derives its metrics from the window the app was given: a Fire TV reports the
 * television UI mode, everything else is classified by width.
 */
enum class DeviceClass { TV, PHONE, TABLET, DESKTOP }

data class LayoutProfile(
    val deviceClass: DeviceClass,
    val widthDp: Int,
    val cardMinSize: Dp,
    val horizontalPadding: Dp,
    val contentMaxWidth: Dp,
) {
    /** Two-column width; used where a second column actually helps. */
    val isWide: Boolean get() = widthDp >= 840

    val isTelevision: Boolean get() = deviceClass == DeviceClass.TV
}

/**
 * Pure classification so the thresholds are testable without a device:
 * television wins over width, then phone (< 600 dp), tablet (< 1000 dp) and
 * desktop for everything wider (ChromeOS, laptop-sized freeform windows).
 */
fun layoutFor(uiModeType: Int, widthDp: Int): LayoutProfile {
    val width = widthDp.coerceAtLeast(0)
    val deviceClass = when {
        uiModeType == Configuration.UI_MODE_TYPE_TELEVISION -> DeviceClass.TV
        width < 600 -> DeviceClass.PHONE
        width < 1000 -> DeviceClass.TABLET
        else -> DeviceClass.DESKTOP
    }

    return when (deviceClass) {
        // A TV is watched from the sofa: bigger cards, more air, wide grid.
        DeviceClass.TV -> LayoutProfile(
            deviceClass = deviceClass,
            widthDp = width,
            cardMinSize = 224.dp,
            horizontalPadding = 40.dp,
            contentMaxWidth = 1600.dp,
        )

        // A phone is held: compact cards and a narrow margin.
        DeviceClass.PHONE -> LayoutProfile(
            deviceClass = deviceClass,
            widthDp = width,
            cardMinSize = 152.dp,
            horizontalPadding = 16.dp,
            contentMaxWidth = Dp.Infinity,
        )

        DeviceClass.TABLET -> LayoutProfile(
            deviceClass = deviceClass,
            widthDp = width,
            cardMinSize = 190.dp,
            horizontalPadding = 24.dp,
            contentMaxWidth = 1000.dp,
        )

        DeviceClass.DESKTOP -> LayoutProfile(
            deviceClass = deviceClass,
            widthDp = width,
            cardMinSize = 212.dp,
            horizontalPadding = 32.dp,
            contentMaxWidth = 1280.dp,
        )
    }
}

/**
 * Recomputes on configuration changes: rotation, resizing a freeform window, or
 * launching on a different device class all produce a new profile.
 */
@Composable
@ReadOnlyComposable
fun rememberLayoutProfile(): LayoutProfile {
    val configuration = LocalConfiguration.current
    return layoutFor(configuration.uiMode and Configuration.UI_MODE_TYPE_MASK, configuration.screenWidthDp)
}
