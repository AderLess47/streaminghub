package de.streaminghub.app.data

import de.streaminghub.app.model.MediaKind
import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class M3uParserTest {

    @Test
    fun parsesLargePlaylistFromFile() {
        val file = File.createTempFile("streaminghub-large", ".m3u")
        try {
            file.bufferedWriter(Charsets.UTF_8).use { writer ->
                writer.appendLine("#EXTM3U")
                repeat(20_000) { index ->
                    writer.appendLine("#EXTINF:-1 group-title=\"Kategorie ${index % 20}\",Sender $index")
                    writer.appendLine("https://example.com/live/$index.m3u8")
                }
            }

            val channels = M3uParser.parse(file)

            assertEquals(20_000, channels.size)
            assertEquals("Sender 0", channels.first().name)
            assertEquals("Sender 19999", channels.last().name)
            assertEquals("Kategorie 19", channels.last().group)
        } finally {
            file.delete()
        }
    }

    @Test
    fun stopsAtFiftyThousandChannels() {
        val playlist = StringBuilder("#EXTM3U\n")
        repeat(50_001) { index ->
            playlist.append("#EXTINF:-1,Sender $index\nhttps://example.com/live/$index.m3u8\n")
        }

        val channels = M3uParser.parse(playlist.toString())

        assertEquals(50_000, channels.size)
        assertEquals("Sender 0", channels.first().name)
        assertEquals("Sender 49999", channels.last().name)
    }

    @Test
    fun parsesMetadataAndInfersCategories() {
        val playlist = """
            #EXTM3U
            #EXTINF:-1 tvg-id="news.de" tvg-logo="https://cdn.example/news.png" group-title="Nachrichten",Tagesschau
            https://example.com/live/news.m3u8
            #EXTINF:-1 tvg-id="film.1" group-title="Filme",Beispielfilm
            https://example.com/movie/beispielfilm.mp4
            #EXTINF:-1 group-title="Serien",Pilotfolge
            https://example.com/series/pilot.mkv
        """.trimIndent()

        val channels = M3uParser.parse(playlist)

        assertEquals(3, channels.size)
        assertEquals("Tagesschau", channels[0].name)
        assertEquals("https://cdn.example/news.png", channels[0].logo)
        assertEquals("news.de", channels[0].tvgId)
        assertEquals(MediaKind.LIVE, channels[0].kind)
        assertEquals(MediaKind.MOVIE, channels[1].kind)
        assertEquals(MediaKind.SERIES, channels[2].kind)
    }

    @Test
    fun infersMovieFromExtensionAndKeyword() {
        val playlist = """
            #EXTM3U
            #EXTINF:-1 group-title="TV",Kanal Eins
            https://example.com/aufnahme.mkv
            #EXTINF:-1 group-title="TV",Kanal Zwei
            https://example.com/aufnahme.avi
            #EXTINF:-1 group-title="TV",Kanal Drei
            https://example.com/aufnahme.webm
            #EXTINF:-1 group-title="TV",Doku über Berge
            https://example.com/live/doku.m3u8
        """.trimIndent()

        val channels = M3uParser.parse(playlist)

        assertEquals(4, channels.size)
        assertEquals(List(4) { MediaKind.MOVIE }, channels.map { it.kind })
    }

    @Test
    fun supportsExtGrpAndDeduplicatesUrls() {
        val playlist = """
            #EXTM3U
            #EXTINF:-1,Erster Sender
            #EXTGRP:Nachrichten
            https://example.com/live/one.m3u8
            #EXTINF:-1,Doppelter Eintrag
            https://example.com/live/one.m3u8
        """.trimIndent()

        val channels = M3uParser.parse(playlist)

        assertEquals(1, channels.size)
        assertEquals("Nachrichten", channels[0].group)
        assertEquals("https://example.com/live/one.m3u8", channels[0].url)
        assertNull(channels[0].logo)
    }

    @Test
    fun ignoresHeaderAndNonPlayableLines() {
        val playlist = """
            #EXTM3U
            #EXTVLCOPT:http-user-agent=StreamingHub
            #EXTINF:-1 group-title="Ohne URL",Kein Eintrag
            #EXTINF:-1 group-title="Live",Gültig
            https://example.com/live.m3u8
        """.trimIndent()

        val channels = M3uParser.parse(playlist)

        assertEquals(1, channels.size)
        assertTrue(channels[0].url.startsWith("https://"))
    }

    @Test
    fun assignsKodipropToTheFollowingEntryOnly() {
        val playlist = """
            #EXTM3U
            #EXTINF:-1 group-title="Live",Verschlüsselt
            #KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha
            #KODIPROP:inputstream.adaptive.license_key=https://lizenz.example/wv|Authorization=Bearer%20abc
            https://example.com/live/drm.m3u8
            #EXTINF:-1 group-title="Live",Offen
            https://example.com/live/free.m3u8
        """.trimIndent()

        val channels = M3uParser.parse(playlist)

        assertEquals(2, channels.size)
        assertEquals(de.streaminghub.app.model.DrmScheme.WIDEVINE, channels[0].drm?.scheme)
        assertEquals("https://lizenz.example/wv", channels[0].drm?.licenseUrl)
        assertEquals("Bearer abc", channels[0].drm?.headers?.get("Authorization"))
        assertNull(channels[1].drm)
    }

    @Test
    fun entryWithLicenseTypeButNoKeyStaysFree() {
        val playlist = """
            #EXTM3U
            #EXTINF:-1,Sender
            #KODIPROP:inputstream.adaptive.license_type=com.widevine.alpha
            https://example.com/live/no-key.m3u8
        """.trimIndent()

        val channels = M3uParser.parse(playlist)

        assertEquals(1, channels.size)
        assertNull(channels[0].drm)
    }
}
