package de.streaminghub.app.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class XmltvParserTest {

    @Test
    fun parsesChannelNamesAndProgrammeDataWithTimezone() {
        val xml = """
            <?xml version="1.0" encoding="UTF-8"?>
            <tv>
              <channel id="news.de">
                <display-name>Nachrichten Deutschland</display-name>
              </channel>
              <programme channel="news.de" start="20261110180000 +0100" stop="20261110190000 +0100">
                <title>Abendnachrichten</title>
                <desc>Die Nachrichten des Tages.</desc>
              </programme>
            </tv>
        """.trimIndent()

        val programmes = XmltvParser.parse(xml)

        assertEquals(1, programmes.size)
        assertEquals("news.de", programmes[0].channelId)
        assertEquals("Nachrichten Deutschland", programmes[0].channelName)
        assertEquals("Abendnachrichten", programmes[0].title)
        assertEquals("Die Nachrichten des Tages.", programmes[0].description)
        assertEquals(3_600_000L, programmes[0].stopMs - programmes[0].startMs)
    }

    @Test
    fun skipsInvalidProgrammesAndKeepsDescriptionsOptional() {
        val xml = """
            <tv>
              <channel id="film.de"><display-name>Filme</display-name></channel>
              <programme channel="film.de" start="not-a-date" stop="20261110220000 +0000">
                <title>Ungültig</title>
              </programme>
              <programme channel="film.de" start="20261110200000 +0000" stop="20261110220000 +0000">
                <title>Gültiger Film</title>
              </programme>
              <programme channel="film.de" start="20261110200000 +0000" stop="20261110220000 +0000">
                <desc>Ohne Titel</desc>
              </programme>
            </tv>
        """.trimIndent()

        val programmes = XmltvParser.parse(xml)

        assertEquals(1, programmes.size)
        assertEquals("Gültiger Film", programmes[0].title)
        assertNull(programmes[0].description)
    }
}
