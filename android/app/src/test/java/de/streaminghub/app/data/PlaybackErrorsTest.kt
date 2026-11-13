package de.streaminghub.app.data

import androidx.media3.common.PlaybackException
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackErrorsTest {

    private fun describe(
        code: Int,
        detail: String? = null,
        hasDrm: Boolean = false,
        insecure: Boolean = false,
    ) = PlaybackErrors.describe(code, detail, hasDrm, insecure)

    @Test
    fun namesTheLicenseServerWhenTheLicenseFails() {
        val text = describe(PlaybackException.ERROR_CODE_DRM_LICENSE_ACQUISITION_FAILED, hasDrm = true)

        assertTrue(text.contains("Lizenzserver"))
        assertTrue(text.contains(PlaybackErrors.BACK_HINT))
    }

    @Test
    fun explainsUnsupportedDrmScheme() {
        val text = describe(PlaybackException.ERROR_CODE_DRM_SCHEME_UNSUPPORTED, hasDrm = true)

        assertTrue(text.contains("DRM-Verfahren"))
    }

    @Test
    fun distinguishesNetworkAndFormatFailures() {
        val network = describe(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED)
        val format = describe(PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED)

        assertTrue(network.contains("nicht erreichbar"))
        assertTrue(format.contains("Format"))
        assertFalse(network == format)
    }

    @Test
    fun unknownFailureKeepsTrimmedTechnicalDetail() {
        val short = describe(PlaybackException.ERROR_CODE_UNSPECIFIED, detail = "Source error")
        val long = describe(PlaybackException.ERROR_CODE_UNSPECIFIED, detail = "x".repeat(400))

        assertTrue(short.contains("Source error"))
        assertTrue(long.length < 400)
        assertTrue(long.contains("…"))
    }

    @Test
    fun genericFailureWithoutDetailStaysPlain() {
        val text = describe(PlaybackException.ERROR_CODE_UNSPECIFIED)

        assertFalse(text.contains("("))
        assertTrue(text.startsWith("Die Quelle konnte nicht abgespielt werden."))
    }

    @Test
    fun insecureAddressIsCalledOut() {
        val text = describe(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS, insecure = true)

        assertTrue(text.contains("unverschlüsselt"))
    }

    @Test
    fun unknownDrmFailureMentionsPlaylistWhenDrmIsConfigured() {
        val withDrm = describe(PlaybackException.ERROR_CODE_DRM_UNSPECIFIED, hasDrm = true)
        val withoutDrm = describe(PlaybackException.ERROR_CODE_DRM_UNSPECIFIED, hasDrm = false)

        assertTrue(withDrm.contains("DRM"))
        assertFalse(withoutDrm.contains("DRM"))
    }
}
