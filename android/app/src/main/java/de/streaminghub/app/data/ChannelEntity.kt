package de.streaminghub.app.data

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.ChannelDrm
import de.streaminghub.app.model.DrmScheme
import de.streaminghub.app.model.MediaKind
import org.json.JSONObject

@Entity(tableName = "channels")
data class ChannelEntity(
    @PrimaryKey val url: String,
    val name: String,
    val logo: String?,
    @ColumnInfo(name = "group_name") val group: String,
    val tvgId: String?,
    val kind: String,
    val position: Int,
    val drmScheme: String?,
    val drmLicenseUrl: String?,
    val drmHeaders: String?,
)

internal fun Channel.toEntity(position: Int): ChannelEntity {
    val drm = drm
    return ChannelEntity(
        url = url,
        name = name,
        logo = logo,
        group = group,
        tvgId = tvgId,
        kind = kind.name,
        position = position,
        drmScheme = drm?.scheme?.kodipropName,
        drmLicenseUrl = drm?.licenseUrl,
        drmHeaders = drm?.headers
            ?.takeIf { it.isNotEmpty() }
            ?.let { JSONObject(it as Map<*, *>).toString() },
    )
}

internal fun ChannelEntity.toChannel(): Channel {
    val parsedKind = runCatching { MediaKind.valueOf(kind) }.getOrDefault(MediaKind.LIVE)
    val drm = runCatching {
        val scheme = DrmScheme.fromKodiprop(drmScheme) ?: return@runCatching null
        val licenseUrl = drmLicenseUrl?.takeIf { it.isNotBlank() } ?: return@runCatching null
        val headers = drmHeaders?.let { raw ->
            val stored = JSONObject(raw)
            buildMap {
                stored.keys().forEach { key -> put(key, stored.optString(key)) }
            }
        } ?: emptyMap()
        ChannelDrm(scheme = scheme, licenseUrl = licenseUrl, headers = headers)
    }.getOrNull()

    return Channel(
        name = name,
        url = url,
        logo = logo,
        group = group,
        tvgId = tvgId,
        kind = parsedKind,
        drm = drm,
    )
}
