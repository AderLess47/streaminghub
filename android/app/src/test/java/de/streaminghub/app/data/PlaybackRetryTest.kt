package de.streaminghub.app.data

import androidx.media3.common.PlaybackException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackRetryTest {

    @Test
    fun treatsOnlyConnectionProblemsAsRetryable() {
        assertTrue(PlaybackRetry.isNetworkError(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED))
        assertTrue(PlaybackRetry.isNetworkError(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT))
        assertFalse(PlaybackRetry.isNetworkError(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS))
        assertFalse(PlaybackRetry.isNetworkError(PlaybackException.ERROR_CODE_DRM_LICENSE_ACQUISITION_FAILED))
        assertFalse(PlaybackRetry.isNetworkError(PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED))
    }

    @Test
    fun stopsAfterFourAttempts() {
        assertTrue(PlaybackRetry.canRetryAutomatically(0))
        assertTrue(PlaybackRetry.canRetryAutomatically(3))
        assertFalse(PlaybackRetry.canRetryAutomatically(PlaybackRetry.MAX_AUTO_RETRIES))
    }

    @Test
    fun hintNamesTheAutomaticRestart() {
        assertTrue(PlaybackRetry.HINT.contains("automatisch"))
        assertEquals(5_000L, PlaybackRetry.POLL_MS)
    }
}
