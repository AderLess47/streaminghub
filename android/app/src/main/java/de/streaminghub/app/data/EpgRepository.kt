package de.streaminghub.app.data

import android.content.Context
import de.streaminghub.app.model.EpgProgramme
import org.json.JSONArray
import org.json.JSONObject

data class StoredEpg(
    val programmes: List<EpgProgramme>,
    val sourceUrl: String?,
    val updatedAt: Long?,
)

class EpgRepository(context: Context) {

    private val preferences = context.applicationContext
        .getSharedPreferences("streaminghub_epg", Context.MODE_PRIVATE)

    fun load(): StoredEpg {
        val programmes = runCatching {
            val raw = preferences.getString(KEY_PROGRAMMES, null) ?: return@runCatching emptyList()
            val array = JSONArray(raw)
            buildList(array.length()) {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val title = item.optString("title").takeIf { it.isNotBlank() } ?: continue
                    val channelId = item.optString("channelId").takeIf { it.isNotBlank() } ?: continue
                    add(
                        EpgProgramme(
                            channelId = channelId,
                            channelName = item.optString("channelName").ifBlank { channelId },
                            startMs = item.optLong("startMs"),
                            stopMs = item.optLong("stopMs"),
                            title = title,
                            description = item.optString("description").takeIf { it.isNotBlank() },
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())

        return StoredEpg(
            programmes = programmes,
            sourceUrl = preferences.getString(KEY_SOURCE_URL, null),
            updatedAt = preferences.getLong(KEY_UPDATED_AT, 0L).takeIf { it > 0L },
        )
    }

    fun save(programmes: List<EpgProgramme>, sourceUrl: String?) {
        val array = JSONArray()
        programmes.forEach { programme ->
            array.put(
                JSONObject().apply {
                    put("channelId", programme.channelId)
                    put("channelName", programme.channelName)
                    put("startMs", programme.startMs)
                    put("stopMs", programme.stopMs)
                    put("title", programme.title)
                    put("description", programme.description ?: "")
                },
            )
        }

        preferences.edit()
            .putString(KEY_PROGRAMMES, array.toString())
            .putString(KEY_SOURCE_URL, sourceUrl)
            .putLong(KEY_UPDATED_AT, System.currentTimeMillis())
            .apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    private companion object {
        const val KEY_PROGRAMMES = "programmes_json"
        const val KEY_SOURCE_URL = "source_url"
        const val KEY_UPDATED_AT = "updated_at"
    }
}
