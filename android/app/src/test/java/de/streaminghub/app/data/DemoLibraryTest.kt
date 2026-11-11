package de.streaminghub.app.data

import de.streaminghub.app.model.MediaKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class DemoLibraryTest {

    private val channels = M3uParser.parse(DemoLibrary.playlist)
    private val now = 1_780_000_000_000L

    @Test
    fun playlistParsesIntoBrowsableEntries() {
        assertEquals(6, channels.size)
        assertEquals(3, channels.count { it.kind == MediaKind.LIVE })
        assertEquals(2, channels.count { it.kind == MediaKind.MOVIE })
        assertEquals(1, channels.count { it.kind == MediaKind.SERIES })
    }

    @Test
    fun demoEntriesUseOnlyPublicHttpsSources() {
        assertTrue(channels.all { it.url.startsWith("https://") })
        assertTrue(channels.all { it.logo == null })
        assertEquals(channels.size, channels.map { it.url }.toSet().size)
    }

    @Test
    fun everyChannelHasAProgrammeGuideId() {
        assertTrue(channels.all { !it.tvgId.isNullOrBlank() })
        assertEquals(channels.size, channels.mapNotNull { it.tvgId }.toSet().size)
    }

    @Test
    fun guideShowsARunningAndAnUpcomingShow() {
        val programmes = DemoLibrary.programmes(now)

        assertEquals(DemoLibrary.liveChannels.size * 3, programmes.size)
        assertEquals(programmes.sortedBy { it.startMs }, programmes)

        DemoLibrary.liveChannels.forEach { channel ->
            val channelProgrammes = programmes.filter { it.channelId == channel.id }
            val running = channelProgrammes.firstOrNull { now >= it.startMs && now < it.stopMs }
            val upcoming = channelProgrammes.firstOrNull { it.startMs > now }

            assertTrue("keine laufende Sendung für ${channel.name}", running != null)
            assertTrue("keine folgende Sendung für ${channel.name}", upcoming != null)
        }
    }

    @Test
    fun guideIdsMatchThePlaylistSoTheGuideCanJoinThem() {
        val playlistIds = channels.mapNotNull { it.tvgId }.toSet()
        val guideIds = DemoLibrary.programmes(now).map { it.channelId }.toSet()

        // Films and series carry no guide data; every guide id must still be a
        // real playlist id so the guide can join the two data sets.
        assertTrue(playlistIds.containsAll(guideIds))
        assertEquals(DemoLibrary.liveChannels.map { it.id }.toSet(), guideIds)
    }
}
