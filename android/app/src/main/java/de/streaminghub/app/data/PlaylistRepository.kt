package de.streaminghub.app.data

import android.content.Context
import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.ChannelDrm
import de.streaminghub.app.model.DrmScheme
import de.streaminghub.app.model.MediaKind
import org.json.JSONArray
import org.json.JSONObject

data class StoredPlaylist(
    val channels: List<Channel>,
    val sourceUrl: String?,
    val sourceLabel: String?,
    val updatedAt: Long?,
)

class PlaylistRepository(context: Context) {

    private val preferences = context.applicationContext
        .getSharedPreferences("streaminghub", Context.MODE_PRIVATE)

    fun loadPlaylist(): StoredPlaylist {
        val channels = runCatching {
            val raw = preferences.getString(KEY_CHANNELS, null) ?: return@runCatching emptyList()
            val array = JSONArray(raw)
            buildList(array.length()) {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val name = item.optString("name").takeIf { it.isNotBlank() } ?: continue
                    val url = item.optString("url").takeIf { it.isNotBlank() } ?: continue
                    add(
                        Channel(
                            name = name,
                            url = url,
                            logo = item.optString("logo").takeIf { it.isNotBlank() },
                            group = item.optString("group").ifBlank { "Ohne Kategorie" },
                            tvgId = item.optString("tvgId").takeIf { it.isNotBlank() },
                            kind = runCatching {
                                MediaKind.valueOf(item.optString("kind"))
                            }.getOrDefault(MediaKind.LIVE),
                            drm = readDrm(item.optJSONObject("drm")),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())

        return StoredPlaylist(
            channels = channels,
            sourceUrl = preferences.getString(KEY_SOURCE_URL, null),
            sourceLabel = preferences.getString(KEY_SOURCE_LABEL, null),
            updatedAt = preferences.getLong(KEY_UPDATED_AT, 0L).takeIf { it > 0L },
        )
    }

    fun savePlaylist(
        channels: List<Channel>,
        sourceUrl: String?,
        sourceLabel: String,
    ) {
        val array = JSONArray()
        channels.forEach { channel ->
            array.put(
                JSONObject().apply {
                    put("name", channel.name)
                    put("url", channel.url)
                    put("logo", channel.logo ?: "")
                    put("group", channel.group)
                    put("tvgId", channel.tvgId ?: "")
                    put("kind", channel.kind.name)
                    channel.drm?.let { drm ->
                        put(
                            "drm",
                            JSONObject().apply {
                                put("scheme", drm.scheme.kodipropName)
                                put("licenseUrl", drm.licenseUrl)
                                if (drm.headers.isNotEmpty()) {
                                    put("headers", JSONObject(drm.headers as Map<*, *>))
                                }
                            },
                        )
                    }
                },
            )
        }

        preferences.edit()
            .putString(KEY_CHANNELS, array.toString())
            .putString(KEY_SOURCE_URL, sourceUrl)
            .putString(KEY_SOURCE_LABEL, sourceLabel)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    private fun readDrm(item: JSONObject?): ChannelDrm? {
        if (item == null) return null
        val scheme = DrmScheme.fromKodiprop(item.optString("scheme")) ?: return null
        val licenseUrl = item.optString("licenseUrl").takeIf { it.isNotBlank() } ?: return null
        val headers = item.optJSONObject("headers")?.let { stored ->
            buildMap {
                stored.keys().forEach { key -> put(key, stored.optString(key)) }
            }
        } ?: emptyMap()
        return ChannelDrm(scheme = scheme, licenseUrl = licenseUrl, headers = headers)
    }

    fun clearPlaylist() {
        preferences.edit()
            .remove(KEY_CHANNELS)
            .remove(KEY_SOURCE_URL)
            .remove(KEY_SOURCE_LABEL)
            .remove(KEY_UPDATED_AT)
            .remove(KEY_FAVORITES)
            .apply()
    }

    fun loadFavorites(): Set<String> =
        preferences.getStringSet(KEY_FAVORITES, emptySet())?.toSet() ?: emptySet()

    fun toggleFavorite(url: String): Set<String> {
        val updated = loadFavorites().toMutableSet().apply {
            if (!add(url)) remove(url)
        }
        preferences.edit().putStringSet(KEY_FAVORITES, updated).apply()
        return updated
    }

    fun progressFor(url: String): Long =
        preferences.getLong(progressKey(url), 0L).coerceAtLeast(0L)

    fun saveProgress(url: String, positionMs: Long, durationMs: Long) {
        // Live streams and unknown durations have no meaningful resumable timeline.
        if (durationMs <= 0L || positionMs < 5_000L) return
        val editor = preferences.edit()
        if (durationMs > 0L && positionMs >= durationMs - 10_000L) {
            editor.remove(progressKey(url))
        } else {
            editor.putLong(progressKey(url), positionMs)
        }
        editor.apply()
    }

    fun clearProgress() {
        val keys = preferences.all.keys.filter { it.startsWith(PROGRESS_PREFIX) }
        if (keys.isEmpty()) return
        preferences.edit().apply {
            keys.forEach { remove(it) }
        }.apply()
    }

    private fun progressKey(url: String) = PROGRESS_PREFIX + url

    private companion object {
        const val KEY_CHANNELS = "channels_json"
        const val KEY_SOURCE_URL = "source_url"
        const val KEY_SOURCE_LABEL = "source_label"
        const val KEY_UPDATED_AT = "updated_at"
        const val KEY_FAVORITES = "favorites"
        const val PROGRESS_PREFIX = "progress:"
    }
}
