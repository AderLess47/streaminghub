package de.streaminghub.app.data

import android.content.Context
import androidx.room.Room
import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.ChannelDrm
import de.streaminghub.app.model.DrmScheme
import de.streaminghub.app.model.MediaKind
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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
    private lateinit var database: PlaylistDatabase
    private lateinit var repository: PlaylistRepository

    @Before
    fun setUp() {
        context = RuntimeEnvironment.getApplication()
        context.getSharedPreferences("streaminghub", Context.MODE_PRIVATE)
            .edit().clear().commit()
        database = Room.inMemoryDatabaseBuilder(context, PlaylistDatabase::class.java).build()
        repository = PlaylistRepository(context, database)
        runBlocking { repository.clearPlaylist() }
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun writesChannelsToRoom() = runBlocking {
        repository.savePlaylist(
            listOf(channel(url = "https://example.com/live/news.m3u8")),
            "https://example.com/list.m3u",
            "Test",
        )

        val rows = database.channelDao().loadAll()
        assertEquals(1, rows.size)
        assertEquals("https://example.com/live/news.m3u8", rows.single().url)
    }

    @Test
    fun drmSurvivesSaveAndLoad() = runBlocking {
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
    fun channelWithoutDrmStaysWithoutDrm() = runBlocking {
        repository.savePlaylist(
            listOf(channel(url = "https://example.com/live/free.m3u8")),
            "https://example.com/list.m3u",
            "Test",
        )

        assertNull(repository.loadPlaylist().channels.single().drm)
    }

    @Test
    fun migratesLegacySharedPreferencesChannelsIntoRoom() = runBlocking {
        val legacy = JSONArray().put(
            JSONObject().apply {
                put("name", "Alt")
                put("url", "https://example.com/legacy.m3u8")
                put("group", "Live")
                put("kind", "LIVE")
            },
        )
        context.getSharedPreferences("streaminghub", Context.MODE_PRIVATE)
            .edit().putString("channels_json", legacy.toString()).commit()

        val loaded = repository.loadPlaylist()

        assertEquals("Alt", loaded.channels.single().name)
        assertEquals(1, database.channelDao().loadAll().size)
        assertFalse(
            context.getSharedPreferences("streaminghub", Context.MODE_PRIVATE)
                .contains("channels_json"),
        )
    }

    @Test
    fun savingANewPlaylistReplacesOldChannels() = runBlocking {
        repository.savePlaylist(
            listOf(channel(url = "https://example.com/old.m3u8")),
            "https://example.com/list.m3u",
            "Alt",
        )
        repository.savePlaylist(
            listOf(channel(url = "https://example.com/new.m3u8")),
            "https://example.com/list.m3u",
            "Neu",
        )

        val loaded = repository.loadPlaylist()
        assertEquals(listOf("https://example.com/new.m3u8"), loaded.channels.map { it.url })
        assertEquals("Neu", loaded.sourceLabel)
    }

    private fun channel(url: String) = Channel(
        name = "Sender",
        url = url,
        logo = null,
        group = "Live",
        tvgId = null,
        kind = MediaKind.LIVE,
    )
}
