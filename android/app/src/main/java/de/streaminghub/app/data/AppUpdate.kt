package de.streaminghub.app.data

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/** Eine neuere Sideload-Version, wie sie `/api/release` beschreibt. */
data class AppUpdateInfo(
    val version: String,
    val versionCode: Int,
    val sizeBytes: Long,
    val sizeLabel: String,
    val sha256: String,
    val url: String,
)

private const val MAX_RELEASE_JSON_CHARS = 64_000
private const val MAX_UPDATE_BYTES = 200L * 1024L * 1024L
private const val APK_MIME = "application/vnd.android.package-archive"

/**
 * Liest die Release-Antwort. Gibt nur dann ein Update zurück, wenn Version,
 * Größe, Prüfsumme und HTTPS-Adresse vollständig und plausibel sind.
 */
internal fun parseAppUpdate(json: String, currentVersionCode: Int): AppUpdateInfo? {
    val obj = runCatching { JSONObject(json) }.getOrNull() ?: return null
    val version = obj.optString("version").trim()
    val versionCode = obj.optInt("versionCode", 0)
    val sizeBytes = obj.optLong("sizeBytes", 0L)
    val sha256 = obj.optString("sha256").trim().lowercase()
    val url = obj.optString("url").trim()

    if (version.isBlank() || versionCode <= currentVersionCode) return null
    if (sizeBytes <= 0L || sizeBytes > MAX_UPDATE_BYTES) return null
    if (!Regex("^[0-9a-f]{64}$").matches(sha256)) return null
    if (!url.startsWith("https://")) return null

    val sizeLabel = obj.optString("sizeLabel").trim()
        .ifBlank { "${sizeBytes / (1024 * 1024)} MB" }

    return AppUpdateInfo(
        version = version,
        versionCode = versionCode,
        sizeBytes = sizeBytes,
        sizeLabel = sizeLabel,
        sha256 = sha256,
        url = url,
    )
}

/**
 * Prüft und lädt eine neue direkte APK. Der Download läuft in den App-Cache,
 * wird gegen die vom Server genannte SHA-256-Summe geprüft und erst dann an
 * den System-Installer übergeben. Es gibt keine stille Installation.
 */
class AppUpdater(private val context: Context) {

    suspend fun check(
        currentVersionCode: Int,
        baseUrl: String = "https://streaminghub.org",
    ): AppUpdateInfo? = withContext(Dispatchers.IO) {
        val connection = open("$baseUrl/api/release", "application/json")
        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                throw IOException("Der Update-Server antwortet mit HTTP $code.")
            }
            val body = connection.inputStream.bufferedReader(Charsets.UTF_8).use { reader ->
                val builder = StringBuilder()
                val buffer = CharArray(4_096)
                while (true) {
                    val read = reader.read(buffer)
                    if (read < 0) break
                    builder.append(buffer, 0, read)
                    if (builder.length > MAX_RELEASE_JSON_CHARS) {
                        throw IOException("Die Update-Antwort ist zu groß.")
                    }
                }
                builder.toString()
            }
            parseAppUpdate(body, currentVersionCode)
        } finally {
            connection.disconnect()
        }
    }

    suspend fun download(
        update: AppUpdateInfo,
        onProgress: (Int) -> Unit,
    ): File = withContext(Dispatchers.IO) {
        val directory = File(context.cacheDir, "updates").apply { mkdirs() }
        val target = File(directory, "streaminghub-${update.version}.apk")
        val partial = File(directory, "streaminghub-${update.version}.apk.part")
        partial.delete()

        val connection = open(update.url, APK_MIME)
        try {
            val code = connection.responseCode
            if (code !in 200..299) {
                throw IOException("Der Download antwortet mit HTTP $code.")
            }
            val total = connection.contentLength.toLong()
            if (total > MAX_UPDATE_BYTES) {
                throw IOException("Die Update-Datei ist unerwartet groß.")
            }

            val digest = MessageDigest.getInstance("SHA-256")
            var received = 0L
            var lastPercent = -1
            connection.inputStream.use { input ->
                partial.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        output.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        received += read
                        if (total > 0L) {
                            val percent = ((received * 100L) / total).toInt().coerceIn(0, 100)
                            if (percent != lastPercent) {
                                lastPercent = percent
                                onProgress(percent)
                            }
                        }
                    }
                }
            }

            if (total > 0L && received != total) {
                partial.delete()
                throw IOException("Der Download wurde unterbrochen.")
            }
            if (received <= 0L || received > MAX_UPDATE_BYTES) {
                partial.delete()
                throw IOException("Die Update-Datei ist leer oder unerwartet groß.")
            }

            val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
            if (!actualHash.equals(update.sha256, ignoreCase = true)) {
                partial.delete()
                throw IOException("Die Prüfsumme der Update-Datei stimmt nicht.")
            }

            target.delete()
            if (!partial.renameTo(target)) {
                partial.copyTo(target, overwrite = true)
                partial.delete()
            }
            AppLog.info("update", "Update ${update.version} (${update.versionCode}) geladen.")
            target
        } finally {
            connection.disconnect()
        }
    }

    fun canRequestInstall(): Boolean =
        Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            context.packageManager.canRequestPackageInstalls()

    /** Öffnet die Systemfreigabe „Unbekannte Apps installieren“. */
    fun openInstallPermissionSettings(): Boolean = runCatching {
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${context.packageName}"),
        ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
    }.getOrDefault(false)

    fun install(file: File): Result<Unit> = runCatching {
        if (!file.isFile) throw IOException("Die Update-Datei fehlt.")
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.updates", file)
        val intent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, APK_MIME)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
    }

    private fun open(address: String, accept: String): HttpURLConnection {
        val url = URL(address)
        if (!url.protocol.equals("https", ignoreCase = true)) {
            throw IOException("Updates werden nur über HTTPS geladen.")
        }
        return (url.openConnection() as HttpURLConnection).apply {
            connectTimeout = 20_000
            readTimeout = 60_000
            instanceFollowRedirects = true
            requestMethod = "GET"
            setRequestProperty("Accept", accept)
            setRequestProperty("User-Agent", "StreamingHub-Updater/1.0 (Android)")
        }
    }
}
