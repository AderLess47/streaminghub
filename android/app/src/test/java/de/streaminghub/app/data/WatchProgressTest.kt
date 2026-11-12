package de.streaminghub.app.data

import org.junit.Assert.assertEquals
import org.junit.Test

class WatchProgressTest {

    @Test
    fun `a fresh device resumes at the synced position`() {
        assertEquals(90_000L, resumeStart(0L, 90_000L))
    }

    @Test
    fun `local progress wins when it is further ahead`() {
        assertEquals(120_000L, resumeStart(120_000L, 90_000L))
    }

    @Test
    fun `synced progress wins when this device never played the title`() {
        assertEquals(240_000L, resumeStart(5_000L, 240_000L))
    }

    @Test
    fun `without any position playback starts at the beginning`() {
        assertEquals(0L, resumeStart(0L, 0L))
        assertEquals(0L, resumeStart(-10L, -5L))
    }
}
