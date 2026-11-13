package de.streaminghub.app.data

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.ParserException
import androidx.media3.datasource.DataSpec
import androidx.media3.exoplayer.source.LoadEventInfo
import androidx.media3.exoplayer.source.MediaLoadData
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlaybackRecoveryTest {

    private val policy = ResilientLoadErrorPolicy()
    private val standard = DefaultLoadErrorHandlingPolicy()

    private fun info(error: IOException, errorCount: Int): LoadErrorHandlingPolicy.LoadErrorInfo =
        LoadErrorHandlingPolicy.LoadErrorInfo(
            LoadEventInfo(0L, DataSpec(Uri.parse("https://example.com/live.m3u8")), 0L),
            MediaLoadData(C.DATA_TYPE_MEDIA),
            error,
            errorCount,
        )

    @Test
    fun retriesMoreOftenThanMedia3Default() {
        assertEquals(8, policy.getMinimumLoadableRetryCount(C.DATA_TYPE_MEDIA))
        assert(policy.getMinimumLoadableRetryCount(C.DATA_TYPE_MEDIA) >
            standard.getMinimumLoadableRetryCount(C.DATA_TYPE_MEDIA))
    }

    @Test
    fun neverRetriesLessThanTheDelegate() {
        val conservative = ResilientLoadErrorPolicy(retries = 1)

        assertEquals(
            standard.getMinimumLoadableRetryCount(C.DATA_TYPE_MEDIA),
            conservative.getMinimumLoadableRetryCount(C.DATA_TYPE_MEDIA),
        )
    }

    @Test
    fun keepsTheStandardDelayForNetworkErrors() {
        val error = info(IOException("Verbindung weg"), errorCount = 3)

        assertEquals(standard.getRetryDelayMsFor(error), policy.getRetryDelayMsFor(error))
        assertEquals(2_000L, policy.getRetryDelayMsFor(error))
    }

    @Test
    fun givesUpOnBrokenManifests() {
        val manifest = ParserException.createForMalformedContainer("kaputt", null)

        assertEquals(C.TIME_UNSET, policy.getRetryDelayMsFor(info(manifest, errorCount = 1)))
    }
}
