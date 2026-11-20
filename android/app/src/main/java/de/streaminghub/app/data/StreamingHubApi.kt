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

/** A watch position the server keeps for a premium account. */
data class WatchProgressItem(
    val url: String,
    val positionMs: Long,
    val durationMs: Long,
    val updatedAt: String?,
)

/** Subscription state as confirmed by the server after a purchase. */
data class AmazonSubscriptionState(
    val premiumActive: Boolean,
    val status: String,
    val channel: String,
    val currentPeriodEnd: String?,
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
class StreamingHubApi(baseUrl: String = DEFAULT_BASE_URL) {

    private val baseUrl: String = secureBaseUrl(baseUrl)

    companion object {
        const val DEFAULT_BASE_URL = "https://streaminghub.org"

        private val LOOPBACK_HOSTS = setOf("127.0.0.1", "localhost", "::1", "[::1]")

        /**
         * Konto-, Geräte- und Abo-Daten gehen nur über TLS. Klartext ist
         * ausschließlich für die Loopback-Adresse der Unit-Tests erlaubt; ein
         * Tippfehler oder eine umgebogene Konfiguration fällt so beim Start auf
         * statt still unverschlüsselt zu senden.
         */
        private fun secureBaseUrl(value: String): String {
            val trimmed = value.trim().trimEnd('/')
            val url = runCatching { URL(trimmed) }.getOrNull()
                ?: throw IllegalArgumentException("Ungültige API-Adresse: $value")
            val secure = url.protocol.equals("https", ignoreCase = true)
            val loopback = url.protocol.equals("http", ignoreCase = true) &&
                url.host.lowercase() in LOOPBACK_HOSTS
            if (!secure && !loopback) {
                throw IllegalArgumentException("Die API-Adresse muss HTTPS verwenden: $value")
            }
            return trimmed
        }
    }

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

    /**
     * Sends an Amazon receipt for verification. Premium is granted by the
     * server response only, never by the store alone.
     */
    suspend fun submitAmazonReceipt(
        activationToken: String,
        receiptId: String,
        appUserId: String,
        productId: String,
    ): AmazonSubscriptionState = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("receiptId", receiptId)
            .put("appUserId", appUserId)
            .put("productId", productId)
        val json = call(
            path = "/api/v1/amazon/purchase",
            method = "POST",
            bearerToken = activationToken,
            body = body,
        )
        json.subscriptionState()
    }

    /** Pull model: renewals and cancellations recorded by Amazon. */
    suspend fun refreshAmazonSubscription(activationToken: String): AmazonSubscriptionState =
        withContext(Dispatchers.IO) {
            val json = call(
                path = "/api/v1/amazon/refresh",
                method = "POST",
                bearerToken = activationToken,
            )
            json.subscriptionState()
        }

    /**
     * Cross-device resume is a premium feature; free accounts get
     * `premium_required` and keep their positions on the device only.
     */
    suspend fun fetchWatchProgress(activationToken: String): List<WatchProgressItem> =
        withContext(Dispatchers.IO) {
            val json = call(
                path = "/api/v1/progress",
                method = "GET",
                bearerToken = activationToken,
            )
            val items = json.optJSONArray("items") ?: return@withContext emptyList()
            (0 until items.length()).mapNotNull { index ->
                val item = items.optJSONObject(index) ?: return@mapNotNull null
                val url = item.optString("url").takeIf { it.isNotBlank() } ?: return@mapNotNull null
                WatchProgressItem(
                    url = url,
                    positionMs = item.optLong("positionMs", 0L).coerceAtLeast(0L),
                    durationMs = item.optLong("durationMs", 0L).coerceAtLeast(0L),
                    updatedAt = item.optString("updatedAt").takeIf { it.isNotBlank() },
                )
            }
        }

    suspend fun saveWatchProgress(
        activationToken: String,
        url: String,
        positionMs: Long,
        durationMs: Long,
    ): Boolean = withContext(Dispatchers.IO) {
        val body = JSONObject()
            .put("url", url)
            .put("positionMs", positionMs)
            .put("durationMs", durationMs)
        call(
            path = "/api/v1/progress",
            method = "PUT",
            bearerToken = activationToken,
            body = body,
        )
        true
    }

    private fun JSONObject.subscriptionState(): AmazonSubscriptionState {
        val subscription = optJSONObject("subscription")
        return AmazonSubscriptionState(
            premiumActive = subscription?.optBoolean("premiumActive", false) ?: false,
            status = subscription?.optString("status").orEmpty().ifBlank { "none" },
            channel = subscription?.optString("channel").orEmpty().ifBlank { "web" },
            currentPeriodEnd = subscription?.optString("currentPeriodEnd")
                ?.takeIf { it.isNotBlank() },
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
            // Ein 3xx auf http:// würde den Bearer-Token im Klartext erneut
            // senden. Weiterleitungen werden deshalb nie automatisch verfolgt.
            instanceFollowRedirects = false
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

            if (status in 300..399) {
                throw StreamingHubApiException(
                    httpStatus = status,
                    apiCode = "redirect_rejected",
                    message = "Der Server hat eine Weiterleitung verlangt. Aus Sicherheitsgründen wird sie nicht verfolgt.",
                )
            }

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
