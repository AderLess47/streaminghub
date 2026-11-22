package de.streaminghub.app

import de.streaminghub.app.data.parseAppUpdate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppUpdateTest {

    private val valid = """
        {
          "version": "1.6.0",
          "versionCode": 13,
          "sizeBytes": 14347681,
          "sizeLabel": "14 MB",
          "sha256": "ea3d43b0bb960c830d08ee181f802915792388f495a7cae093ef5cefa91db96a",
          "url": "https://downloads.streaminghub.org/streaminghub-1.6.0.apk"
        }
    """.trimIndent()

    @Test
    fun newerVersionIsAccepted() {
        val update = parseAppUpdate(valid, currentVersionCode = 12)
        assertEquals("1.6.0", update?.version)
        assertEquals(13, update?.versionCode)
        assertEquals("14 MB", update?.sizeLabel)
    }

    @Test
    fun sameOrOlderVersionIsIgnored() {
        assertNull(parseAppUpdate(valid, currentVersionCode = 13))
        assertNull(parseAppUpdate(valid, currentVersionCode = 14))
    }

    @Test
    fun insecureOrIncompleteReleasesAreIgnored() {
        assertNull(parseAppUpdate(valid.replace("https://", "http://"), currentVersionCode = 12))
        assertNull(parseAppUpdate(valid.replace("ea3d43b0", "nicht-hex"), currentVersionCode = 12))
        assertNull(parseAppUpdate(valid.replace("\"sizeBytes\": 14347681", "\"sizeBytes\": 0"), currentVersionCode = 12))
        assertNull(parseAppUpdate("kein JSON", currentVersionCode = 12))
    }

    @Test
    fun sizeAtTwoHundredMegabytesIsTheUpperBound() {
        val atLimit = valid.replace("\"sizeBytes\": 14347681", "\"sizeBytes\": 209715200")
        val aboveLimit = valid.replace("\"sizeBytes\": 14347681", "\"sizeBytes\": 209715201")

        assertEquals(209_715_200L, parseAppUpdate(atLimit, currentVersionCode = 12)?.sizeBytes)
        assertNull(parseAppUpdate(aboveLimit, currentVersionCode = 12))
    }

    @Test
    fun missingSizeLabelFallsBackToMegabytes() {
        val update = parseAppUpdate(
            valid.replace("\"sizeLabel\": \"14 MB\",", ""),
            currentVersionCode = 12,
        )
        assertEquals("13 MB", update?.sizeLabel)
    }
}
