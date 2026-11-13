package de.streaminghub.app.data

import android.content.Context
import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.ChannelDrm
import de.streaminghub.app.model.DrmScheme
import de.streaminghub.app.model.MediaKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlaylistRepositoryDrmTest {

    private lateinit var context: Context

    @Before
    fun setUp() {
        context = RuntimeEnvironment.getApplication()
        context.getSharedPreferences("streaminghub", Context.MODE_PRIVATE)
            .edit().clear().commit()
    }

    @Test
    fun drmSurvivesSaveAndLoad() {
        val repository = PlaylistRepository(context)
        val channel = Channel(
            name = "Verschlüsselt",
            url = "https://example.com/live/drm.m3u8",
            logo = null,
            group = "Live",
            tvgId = null,
            kind = MediaKind.LIVE,
            drm = ChannelDrm(
                scheme = DrmScheme.WIDEVINE,
                licenseUrl = "https://lizenz.example/wv",
                headers = mapOf("Authorization" to "Bearer abc"),
            ),
        )

        repository.savePlaylist(listOf(channel), "https://example.com/list.m3u", "Test")
        val loaded = repository.loadPlaylist().channels.single()

        assertEquals(DrmScheme.WIDEVINE, loaded.drm?.scheme)
        assertEquals("https://lizenz.example/wv", loaded.drm?.licenseUrl)
        assertEquals("Bearer abc", loaded.drm?.headers?.get("Authorization"))
    }

    @Test
    fun channelWithoutDrmStaysWithoutDrm() {
        val repository = PlaylistRepository(context)
        repository.savePlaylist(
            listOf(
                Channel(
                    name = "Offen",
                    url = "https://example.com/live/free.m3u8",
                    logo = null,
                    group = "Live",
                    tvgId = null,
                    kind = MediaKind.LIVE,
                ),
            ),
            "https://example.com/list.m3u",
            "Test",
        )

        assertNull(repository.loadPlaylist().channels.single().drm)
    }
}
