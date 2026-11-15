package de.streaminghub.app.data

import android.content.Context
import java.io.File
import java.io.IOException
import java.io.InputStream

/**
 * Hält die zuletzt geladene M3U-Datei im privaten Cache der App.
 *
 * Der Download wird zuerst in eine `.part`-Datei geschrieben und erst nach
 * vollständigem Erfolg umbenannt. Ein abgebrochener oder zu großer Download
 * überschreibt damit keine bereits vorhandene Playlist.
 */
class PlaylistCache(context: Context) {

    private val directory = File(context.applicationContext.cacheDir, DIRECTORY_NAME)
    private val partFile = File(directory, "$FILE_NAME.part")

    val file: File
        get() = File(directory, FILE_NAME)

    /**
     * Schreibt [input] in den Cache und gibt die fertige Datei zurück.
     * Der Stream wird geschlossen.
     */
    fun store(input: InputStream, maxBytes: Long = MAX_PLAYLIST_BYTES): File {
        if (!directory.exists() && !directory.mkdirs()) {
            throw IOException("Der Playlist-Cache konnte nicht angelegt werden.")
        }

        try {
            input.use { source ->
                partFile.outputStream().buffered().use { target ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    var total = 0L
                    while (true) {
                        val read = source.read(buffer)
                        if (read < 0) break
                        total += read
                        if (total > maxBytes) {
                            throw IOException("Die Playlist ist zu groß (maximal 50 MB).")
                        }
                        target.write(buffer, 0, read)
                    }
                }
            }

            if (!partFile.renameTo(file)) {
                partFile.copyTo(file, overwrite = true)
                partFile.delete()
            }
            return file
        } catch (throwable: Throwable) {
            partFile.delete()
            throw throwable
        }
    }

    fun clear() {
        file.delete()
        partFile.delete()
    }

    private companion object {
        const val DIRECTORY_NAME = "playlists"
        const val FILE_NAME = "current.m3u"
        const val MAX_PLAYLIST_BYTES = 50L * 1024 * 1024
    }
}
