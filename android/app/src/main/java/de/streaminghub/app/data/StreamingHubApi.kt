package de.streaminghub.app.data

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

class StreamingHubApiException(
    val httpStatus: Int,
    val apiCode: String?,
    override val message: String,
) : IOException(message)

data class PairingCodeData(
    val requestId: String,
    val code: String,
    val pollToken: String,
    val pollIntervalSeconds: Long,
)

data class PairingPollData(
    val status: String,
    val activationToken: String?,
)

data class ManagedPlaylist(
    val url: String,
    val updatedAt: String?,
)

data class AccountInfo(
    val email: String,
    val displayName: String,
    val deviceName: String,
    val platform: String,
    val deviceActivatedAt: String?,
    val plan: String,
    val subscriptionStatus: String,
    val channel: String,
    val currentPeriodEnd: String?,
    val premiumActive: Boolean,
    val playlist: ManagedPlaylist? = null,
)

/**
 * Account, device, subscription metadata and the optional admin-managed M3U
 * source URL are exchanged with StreamingHub. Playlist content, EPG documents
 * and stream URLs stay on the device.
 */
class StreamingHubApi(
    private val baseUrl: String = "https://streaminghub.org",
) {

    suspend fun requestPairing(
        deviceName: String,
        platform: String,
        appVersion: String,
    ): PairingCodeData = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("deviceName", deviceName)
            .put("platform", platform)
            .put("appVersion", appVersion)

        val json = call(
            path = "/api/v1/pairing/request",
            method = "POST",
            body = body,
        )

        PairingCodeData(
            requestId = json.optString("requestId"),
            code = json.optString("code"),
            pollToken = json.optString("pollToken"),
            pollIntervalSeconds = json.optLong("pollIntervalSeconds", 3L)
                .coerceAtLeast(3L),
        ).also {
            if (it.requestId.isBlank() || it.code.isBlank() || it.pollToken.isBlank()) {
                throw IOException("Die Kopplungsantwort war unvollständig.")
            }
        }
    }

    suspend fun pollPairing(requestId: String, pollToken: String): PairingPollData =
        withContext(Dispatchers.IO) {
            val encoded = URLEncoder.encode(requestId, Charsets.UTF_8.name())
            val json = call(
                path = "/api/v1/pairing/status?requestId=$encoded",
                method = "GET",
                bearerToken = pollToken,
            )
            PairingPollData(
                status = json.optString("status", "pending"),
                activationToken = json.optString("activationToken")
                    .takeIf { it.isNotBlank() },
            )
        }

    suspend fun me(activationToken: String): AccountInfo = withContext(Dispatchers.IO) {
        val json = call(
            path = "/api/v1/me",
            method = "GET",
            bearerToken = activationToken,
        )
        val account = json.optJSONObject("account")
        val device = json.optJSONObject("device")
        val subscription = json.optJSONObject("subscription")
        val playlistJson = json.optJSONObject("playlist")

        AccountInfo(
            email = account?.optString("email").orEmpty(),
            displayName = account?.optString("displayName")
                ?.takeIf { it.isNotBlank() }
                ?: account?.optString("email").orEmpty(),
            deviceName = device?.optString("name").orEmpty().ifBlank { "StreamingHub Gerät" },
            platform = device?.optString("platform").orEmpty(),
            deviceActivatedAt = device?.optString("activatedAt")?.takeIf { it.isNotBlank() },
            plan = subscription?.optString("plan").orEmpty().ifBlank { "premium" },
            subscriptionStatus = subscription?.optString("status").orEmpty().ifBlank { "none" },
            channel = subscription?.optString("channel").orEmpty().ifBlank { "web" },
            currentPeriodEnd = subscription?.optString("currentPeriodEnd")
                ?.takeIf { it.isNotBlank() },
            premiumActive = subscription?.optBoolean("premiumActive", false) ?: false,
            playlist = playlistJson?.let { source ->
                source.optString("url")
                    .trim()
                    .takeIf { it.isNotBlank() }
                    ?.let { url ->
                        ManagedPlaylist(
                            url = url,
                            updatedAt = source.optString("updatedAt")
                                .takeIf { it.isNotBlank() },
                        )
                    }
            },
        )
    }

    private fun call(
        path: String,
        method: String,
        bearerToken: String? = null,
        body: JSONObject? = null,
    ): JSONObject {
        val connection = (URL(baseUrl.trimEnd('/') + path).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 20_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            setRequestProperty("Accept", "application/json")
            setRequestProperty("User-Agent", "StreamingHub/1.1 (Android)")
            if (bearerToken != null) {
                setRequestProperty("Authorization", "Bearer $bearerToken")
            }
        }

        try {
            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
                connection.outputStream.use { stream ->
                    stream.write(body.toString().toByteArray(Charsets.UTF_8))
                }
            }

            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val raw = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(raw) }.getOrNull()

            if (status !in 200..299) {
                val apiError = json?.optJSONObject("error")
                val message = apiError?.optString("message")
                    ?.takeIf { it.isNotBlank() }
                    ?: when (status) {
                        401 -> "Die Gerätekopplung ist abgelaufen."
                        403 -> "Dieses Gerät wurde im Konto getrennt."
                        429 -> "Zu viele Versuche. Bitte warte einen Moment."
                        else -> "StreamingHub antwortet mit HTTP $status."
                    }
                throw StreamingHubApiException(
                    httpStatus = status,
                    apiCode = apiError?.optString("code"),
                    message = message,
                )
            }

            return json ?: throw IOException("Die Serverantwort war nicht lesbar.")
        } finally {
            connection.disconnect()
        }
    }
}
