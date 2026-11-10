package de.streaminghub.app.data

import de.streaminghub.app.model.MediaKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class M3uParserTest {

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
}
