package de.streaminghub.app.ui

import android.content.res.Configuration
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

private const val NORMAL = Configuration.UI_MODE_TYPE_NORMAL
private const val TELEVISION = Configuration.UI_MODE_TYPE_TELEVISION

class LayoutProfileTest {

    @Test
    fun `television wins over the window width`() {
        assertEquals(DeviceClass.TV, layoutFor(TELEVISION, 960).deviceClass)
        assertEquals(DeviceClass.TV, layoutFor(TELEVISION, 1920).deviceClass)
        assertTrue(layoutFor(TELEVISION, 960).isTelevision)
    }

    @Test
    fun `phones stop below six hundred dp`() {
        assertEquals(DeviceClass.PHONE, layoutFor(NORMAL, 359).deviceClass)
        assertEquals(DeviceClass.PHONE, layoutFor(NORMAL, 599).deviceClass)
        assertEquals(DeviceClass.TABLET, layoutFor(NORMAL, 600).deviceClass)
    }

    @Test
    fun `tablets stop below one thousand dp`() {
        assertEquals(DeviceClass.TABLET, layoutFor(NORMAL, 999).deviceClass)
        assertEquals(DeviceClass.DESKTOP, layoutFor(NORMAL, 1000).deviceClass)
    }

    @Test
    fun `wide windows are two column candidates`() {
        assertTrue(!layoutFor(NORMAL, 700).isWide)
        assertTrue(layoutFor(NORMAL, 840).isWide)
        assertTrue(layoutFor(NORMAL, 1400).isWide)
    }

    @Test
    fun `margins grow with the screen and a television gets the most air`() {
        val phone = layoutFor(NORMAL, 360)
        val tablet = layoutFor(NORMAL, 800)
        val desktop = layoutFor(NORMAL, 1400)
        val tv = layoutFor(TELEVISION, 960)
        assertTrue(phone.horizontalPadding < tablet.horizontalPadding)
        assertTrue(tablet.horizontalPadding < desktop.horizontalPadding)
        assertTrue(desktop.horizontalPadding < tv.horizontalPadding)
    }

    @Test
    fun `cards grow from phone to television`() {
        assertTrue(layoutFor(NORMAL, 360).cardMinSize < layoutFor(NORMAL, 800).cardMinSize)
        assertTrue(layoutFor(TELEVISION, 960).cardMinSize > layoutFor(NORMAL, 1400).cardMinSize)
    }

    @Test
    fun `only the phone uses the full window width`() {
        assertEquals(androidx.compose.ui.unit.Dp.Infinity, layoutFor(NORMAL, 360).contentMaxWidth)
        assertEquals(1000.dp, layoutFor(NORMAL, 800).contentMaxWidth)
        assertEquals(1280.dp, layoutFor(NORMAL, 1400).contentMaxWidth)
        assertEquals(1600.dp, layoutFor(TELEVISION, 960).contentMaxWidth)
    }

    @Test
    fun `negative widths are clamped instead of crashing`() {
        assertEquals(DeviceClass.PHONE, layoutFor(NORMAL, -100).deviceClass)
    }
}
