package de.streaminghub.app.data

import android.content.Context
import androidx.paging.PagingSource
import androidx.room.Room
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChannelDaoPagingTest {

    private lateinit var database: PlaylistDatabase
    private lateinit var dao: ChannelDao

    @Before
    fun setUp() {
        val context = RuntimeEnvironment.getApplication() as Context
        database = Room.inMemoryDatabaseBuilder(context, PlaylistDatabase::class.java).build()
        dao = database.channelDao()
        runBlocking {
            dao.insertAll(
                listOf(
                    entity("News", "https://example.com/news.m3u8", "Live", "LIVE", 0),
                    entity("Krimi", "https://example.com/krimi.m3u8", "Filme", "MOVIE", 1),
                    entity("Serie", "https://example.com/serie.m3u8", "Serien", "SERIES", 2),
                ),
            )
        }
    }

    @After
    fun tearDown() {
        database.close()
    }

    @Test
    fun categoryFilterReturnsOnlyMatchingChannels() = runBlocking {
        val page = load(dao.pagingSource("Filme", null, ""))

        assertEquals(listOf("Krimi"), page.map { it.name })
    }

    @Test
    fun kindFilterAndSearchAreCombined() = runBlocking {
        val page = load(dao.pagingSource(null, "LIVE", "news"))

        assertEquals(listOf("News"), page.map { it.name })
    }

    @Test
    fun allChannelsStayInPlaylistOrder() = runBlocking {
        val page = load(dao.pagingSource(null, null, ""))

        assertEquals(listOf("News", "Krimi", "Serie"), page.map { it.name })
    }

    private suspend fun load(source: PagingSource<Int, ChannelEntity>): List<ChannelEntity> {
        val result = source.load(
            PagingSource.LoadParams.Refresh(
                key = null,
                loadSize = 10,
                placeholdersEnabled = false,
            ),
        )
        return (result as PagingSource.LoadResult.Page).data
    }

    private fun entity(
        name: String,
        url: String,
        group: String,
        kind: String,
        position: Int,
    ) = ChannelEntity(
        url = url,
        name = name,
        logo = null,
        group = group,
        tvgId = null,
        kind = kind,
        position = position,
        drmScheme = null,
        drmLicenseUrl = null,
        drmHeaders = null,
    )
}
