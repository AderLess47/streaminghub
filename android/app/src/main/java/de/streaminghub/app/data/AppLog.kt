package de.streaminghub.app.data

import android.content.Context
import android.os.Build
import de.streaminghub.app.BuildConfig
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Diagnose-Protokoll für Fehler und Hardware.
 *
 * Die Datei liegt im privaten App-Verzeichnis (`files/diagnostics/diagnostics.log`),
 * wird nie automatisch übertragen und lässt sich in den Einstellungen ansehen,
 * teilen und löschen. Aufgezeichnet werden nur technische Angaben: Zeitpunkt,
 * Stufe, Bereich, Meldung und – einmal je Start – Modell, Systemstand, Bildschirm
 * und Sprache. Keine Tokens, keine E-Mail-Adressen; URLs werden vor dem Schreiben
 * von Zugangsdaten, Query und Fragment befreit.
 *
 * Das Format ist bewusst dasselbe wie in der Vega- und der Apple-App, damit sich
 * Protokolle vergleichen lassen.
 */
object AppLog {

    private const val FILE_NAME = "diagnostics.log"
    private const val MAX_CHARS = 64_000
    private const val MAX_FIELD_CHARS = 500

    private val lock = Any()
    private var logFile: File? = null

    /** Legt die Datei an und schreibt einmal je Prozess den Hardware-Kopf. */
    fun install(context: Context) {
        val application = context.applicationContext
        synchronized(lock) {
            if (logFile != null) return
            val directory = File(application.filesDir, "diagnostics")
            if (!directory.exists()) directory.mkdirs()
            logFile = File(directory, FILE_NAME)
        }
        info("device", hardware(application))
    }

    fun info(area: String, message: String, meta: String? = null) = write("info", area, message, meta)

    fun warn(area: String, message: String, meta: String? = null) = write("warn", area, message, meta)

    fun error(area: String, throwable: Throwable, meta: String? = null) =
        write("error", area, throwable.message ?: throwable.javaClass.simpleName, meta)

    fun error(area: String, message: String, meta: String? = null) = write("error", area, message, meta)

    fun read(): String = synchronized(lock) {
        logFile?.takeIf { it.exists() }?.readText().orEmpty()
    }

    fun sizeChars(): Int = read().length

    fun clear() {
        synchronized(lock) {
            logFile?.takeIf { it.exists() }?.runCatching { delete() }
        }
    }

    /**
     * Entfernt Zugangsdaten und Query aus einer URL. Playlist-Adressen enthalten
     * häufig Tokens; die gehören nicht in ein Protokoll, das jemand weitergibt.
     */
    fun redactUrl(value: String): String = value.trim()
        .replace(Regex("//[^/@\\s]*@"), "//")
        .replace(Regex("[?#].*$"), "")

    private fun hardware(context: Context): String {
        val configuration = context.resources.configuration
        @Suppress("DEPRECATION")
        val locale = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            configuration.locales[0]
        } else {
            configuration.locale
        }
        return listOf(
            "os=android",
            "release=${Build.VERSION.RELEASE}",
            "sdk=${Build.VERSION.SDK_INT}",
            "manufacturer=${Build.MANUFACTURER ?: "unbekannt"}",
            "model=${Build.MODEL ?: "unbekannt"}",
            "device=${Build.DEVICE ?: "unbekannt"}",
            "app=${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})",
            "screen=${configuration.screenWidthDp}x${configuration.screenHeightDp}dp/${configuration.densityDpi}dpi",
            "uiMode=${configuration.uiMode}",
            "locale=${locale.toLanguageTag()}",
        ).joinToString(" ")
    }

    private fun write(level: String, area: String, message: String, meta: String? = null) {
        val target = synchronized(lock) { logFile } ?: return
        val stamp = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }.format(Date())
        val line = buildString {
            append(stamp)
            append(' ')
            append(level.uppercase(Locale.US).padEnd(5))
            append(' ')
            append(area.take(40))
            append(": ")
            append(message.take(MAX_FIELD_CHARS).replace('\n', ' '))
            if (!meta.isNullOrBlank()) {
                append(" | ")
                append(meta.take(MAX_FIELD_CHARS).replace('\n', ' '))
            }
        }
        synchronized(lock) {
            runCatching {
                val existing = if (target.exists()) target.readText() else ""
                val combined = existing + line + "\n"
                val overflow = combined.length - MAX_CHARS
                val kept = if (overflow > 0) {
                    // Älteste Einträge zuerst, aber sauber an einer Zeilengrenze schneiden.
                    val cut = combined.indexOf('\n', overflow)
                    if (cut >= 0) combined.substring(cut + 1) else combined.takeLast(MAX_CHARS)
                } else {
                    combined
                }
                target.writeText(kept)
            }
        }
    }
}
