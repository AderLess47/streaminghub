package de.streaminghub.app.data

import de.streaminghub.app.model.Channel
import de.streaminghub.app.model.MediaKind
import java.util.Locale

/**
 * Parses the extended M3U format used by IPTV providers.
 *
 * The parser deliberately keeps every URL as an opaque source. StreamingHub does
 * not bundle, proxy or claim rights to any playlist content.
 */
object M3uParser {

    private val attributePattern = Regex("""([A-Za-z0-9_-]+)\s*=\s*"([^"]*)"""")
    private const val MAX_CHANNELS = 50_000

    private data class PendingInfo(
        val name: String,
        val logo: String?,
        val group: String,
        val tvgId: String?,
    )

    fun parse(content: String): List<Channel> {
        val channels = LinkedHashMap<String, Channel>()
        var pending: PendingInfo? = null
        var extGroup = ""
        // `#KODIPROP` gilt für den nächsten Eintrag und wird danach geleert.
        val properties = LinkedHashMap<String, String>()

        content.lineSequence().forEach { rawLine ->
            val line = rawLine.trim().removePrefix("\uFEFF")
            when {
                line.isEmpty() -> Unit

                line.startsWith("#EXTINF", ignoreCase = true) -> {
                    val info = line.substringAfter(":", "")
                    val comma = info.lastIndexOf(',')
                    val metadata = if (comma >= 0) info.substring(0, comma) else ""
                    val title = if (comma >= 0) info.substring(comma + 1).trim() else ""
                    val attributes = attributePattern.findAll(metadata).associate { match ->
                        match.groupValues[1].lowercase(Locale.ROOT) to match.groupValues[2].trim()
                    }
                    pending = PendingInfo(
                        name = title.ifBlank { "Unbenannter Eintrag" },
                        logo = attributes["tvg-logo"]?.takeIf { it.isNotBlank() },
                        group = attributes["group-title"]?.takeIf { it.isNotBlank() } ?: extGroup,
                        tvgId = attributes["tvg-id"]?.takeIf { it.isNotBlank() },
                    )
                }

                line.startsWith("#EXTGRP:", ignoreCase = true) -> {
                    extGroup = line.substringAfter(":").trim()
                }

                line.startsWith("#KODIPROP:", ignoreCase = true) -> {
                    val payload = line.substringAfter(":").trim()
                    val separator = payload.indexOf('=')
                    if (separator > 0) {
                        properties[payload.substring(0, separator).trim()] =
                            payload.substring(separator + 1).trim()
                    }
                }

                line.startsWith("#") -> Unit

                line.contains("://") || line.startsWith("/") -> {
                    if (channels.size >= MAX_CHANNELS) return@forEach

                    val info = pending
                    val title = info?.name?.takeIf { it.isNotBlank() }
                        ?: line.substringAfterLast('/').substringBefore('?').ifBlank { "Sender" }
                    val group = info?.group?.takeIf { it.isNotBlank() }
                        ?: extGroup.ifBlank { "Ohne Kategorie" }

                    val channel = Channel(
                        name = title,
                        url = line,
                        logo = info?.logo,
                        group = group,
                        tvgId = info?.tvgId,
                        kind = inferKind(title, group, line),
                        drm = DrmProperties.drmFrom(properties),
                    )
                    channels.putIfAbsent(channel.url, channel)
                    pending = null
                    properties.clear()
                }
            }
        }

        return channels.values.toList()
    }

    private fun inferKind(name: String, group: String, url: String): MediaKind {
        val haystack = "$name $group".lowercase(Locale.ROOT)
        val path = url.lowercase(Locale.ROOT)

        val looksLikeSeries =
            haystack.contains("serie") ||
                haystack.contains("series") ||
                haystack.contains("episode") ||
                haystack.contains("staffel") ||
                path.contains("/series/") ||
                path.contains("/serie/")
        if (looksLikeSeries) return MediaKind.SERIES

        val looksLikeMovie =
            haystack.contains("film") ||
                haystack.contains("movie") ||
                haystack.contains("kino") ||
                haystack.contains("vod") ||
                haystack.contains("doku") ||
                haystack.contains("documentary") ||
                path.contains("/movie/") ||
                path.endsWith(".mp4") ||
                path.endsWith(".mkv") ||
                path.endsWith(".avi") ||
                path.endsWith(".webm")
        if (looksLikeMovie) return MediaKind.MOVIE

        return MediaKind.LIVE
    }
}
