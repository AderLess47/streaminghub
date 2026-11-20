package de.streaminghub.app.data

import de.streaminghub.app.model.DrmScheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DrmPropertiesTest {

    private fun props(vararg entries: Pair<String, String>) = mapOf(*entries)

    @Test
    fun readsWidevineWithUrlEncodedHeaders() {
        val drm = DrmProperties.drmFrom(
            props(
                DrmProperties.LICENSE_TYPE to "com.widevine.alpha",
                DrmProperties.LICENSE_KEY to
                    "https://lizenz.example/wv|Authorization=Bearer%20abc&X-Test=1",
            ),
        )

        assertEquals(DrmScheme.WIDEVINE, drm?.scheme)
        assertEquals("https://lizenz.example/wv", drm?.licenseUrl)
        assertEquals("Bearer abc", drm?.headers?.get("Authorization"))
        assertEquals("1", drm?.headers?.get("X-Test"))
    }

    @Test
    fun readsPlayReadyAndAcceptsUppercaseType() {
        val drm = DrmProperties.drmFrom(
            props(
                DrmProperties.LICENSE_TYPE to " COM.MICROSOFT.PLAYREADY ",
                DrmProperties.LICENSE_KEY to "https://lizenz.example/pr",
            ),
        )

        assertEquals(DrmScheme.PLAYREADY, drm?.scheme)
        assertTrue(drm?.headers?.isEmpty() == true)
    }

    @Test
    fun keepsPlusSignsInHeaderValues() {
        val drm = DrmProperties.drmFrom(
            props(
                DrmProperties.LICENSE_TYPE to "com.widevine.alpha",
                DrmProperties.LICENSE_KEY to "https://lizenz.example/wv|Authorization=Basic+abc",
            ),
        )

        assertEquals("Basic+abc", drm?.headers?.get("Authorization"))
    }

    @Test
    fun withoutTypeKeyOrUrlThereIsNoDrm() {
        assertNull(DrmProperties.drmFrom(emptyMap()))
        assertNull(
            DrmProperties.drmFrom(
                props(DrmProperties.LICENSE_KEY to "https://lizenz.example/wv"),
            ),
        )
        assertNull(
            DrmProperties.drmFrom(
                props(DrmProperties.LICENSE_TYPE to "com.widevine.alpha"),
            ),
        )
        assertNull(
            DrmProperties.drmFrom(
                props(
                    DrmProperties.LICENSE_TYPE to "com.widevine.alpha",
                    DrmProperties.LICENSE_KEY to "|Authorization=abc",
                ),
            ),
        )
    }

    @Test
    fun ignoresUnknownScheme() {
        assertNull(
            DrmProperties.drmFrom(
                props(
                    DrmProperties.LICENSE_TYPE to "org.example.customdrm",
                    DrmProperties.LICENSE_KEY to "https://lizenz.example/custom",
                ),
            ),
        )
    }

    @Test
    fun skipsMalformedHeaderPairs() {
        val drm = DrmProperties.drmFrom(
            props(
                DrmProperties.LICENSE_TYPE to "com.widevine.alpha",
                DrmProperties.LICENSE_KEY to "https://lizenz.example/wv|kaputt&A=1&=2",
            ),
        )

        assertEquals(mapOf("A" to "1"), drm?.headers)
    }
}
