package de.streaminghub.app.data

import android.content.Context
import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlaylistCacheTest {

    private lateinit var context: Context
    private lateinit var cache: PlaylistCache

    @Before
    fun setUp() {
        context = RuntimeEnvironment.getApplication()
        cache = PlaylistCache(context)
        cache.clear()
    }

    @Test
    fun storesPlaylistInPrivateCacheDirectory() {
        val content = "#EXTM3U\n#EXTINF:-1,News\nhttps://example.com/news.m3u8\n"

        val file = cache.store(ByteArrayInputStream(content.toByteArray(Charsets.UTF_8)))

        assertEquals(File(context.cacheDir, "playlists"), file.parentFile)
        assertEquals("current.m3u", file.name)
        assertEquals(content, file.readText(Charsets.UTF_8))
    }

    @Test
    fun oversizedDownloadKeepsPreviousPlaylist() {
        cache.store(ByteArrayInputStream("old".toByteArray(Charsets.UTF_8)))

        val failure = runCatching {
            cache.store(ByteArrayInputStream("new playlist".toByteArray(Charsets.UTF_8)), maxBytes = 4)
        }.exceptionOrNull()

        assertTrue(failure is IOException)
        assertEquals("Die Playlist ist zu groß (maximal 100 MB).", failure?.message)
        assertEquals("old", cache.file.readText(Charsets.UTF_8))
    }

    @Test
    fun clearRemovesCachedPlaylist() {
        cache.store(ByteArrayInputStream("#EXTM3U".toByteArray(Charsets.UTF_8)))

        cache.clear()

        assertTrue(!cache.file.exists())
    }
}
