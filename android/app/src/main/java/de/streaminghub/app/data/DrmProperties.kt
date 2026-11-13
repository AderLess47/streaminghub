package de.streaminghub.app.data

import de.streaminghub.app.model.ChannelDrm
import de.streaminghub.app.model.DrmScheme
import java.nio.charset.StandardCharsets
import java.net.URLDecoder

/**
 * Übersetzt gesammelte `#KODIPROP`-Zeilen in die DRM-Angaben eines Senders.
 *
 * `#KODIPROP:inputstream.adaptive.license_key` hat die Form
 * `https://lizenz.example/wv|Authorization=Bearer%20abc&X-Test=1`. Alles ab dem
 * ersten `|` sind Header, `&`-getrennt und URL-kodiert. Ohne `license_type`
 * oder ohne Lizenz-URL gibt es keine DRM-Angaben – dann bleibt der Sender ein
 * normaler Eintrag, statt mit einer leeren Konfiguration zu scheitern.
 */
object DrmProperties {

    const val LICENSE_TYPE = "inputstream.adaptive.license_type"
    const val LICENSE_KEY = "inputstream.adaptive.license_key"

    fun drmFrom(properties: Map<String, String>): ChannelDrm? {
        val scheme = DrmScheme.fromKodiprop(properties[LICENSE_TYPE]) ?: return null
        val raw = properties[LICENSE_KEY]?.trim().orEmpty()
        if (raw.isEmpty()) return null

        val separator = raw.indexOf('|')
        val urlPart = if (separator >= 0) raw.substring(0, separator) else raw
        val headerPart = if (separator >= 0) raw.substring(separator + 1) else null

        val licenseUrl = urlPart.trim()
        if (licenseUrl.isEmpty()) return null

        return ChannelDrm(
            scheme = scheme,
            licenseUrl = licenseUrl,
            headers = licenseHeaders(headerPart),
        )
    }

    private fun licenseHeaders(raw: String?): Map<String, String> {
        if (raw.isNullOrBlank()) return emptyMap()
        val headers = LinkedHashMap<String, String>()
        raw.split('&').forEach { part ->
            val separator = part.indexOf('=')
            if (separator <= 0) return@forEach
            val name = decode(part.substring(0, separator).trim())
            if (name.isEmpty()) return@forEach
            headers[name] = decode(part.substring(separator + 1))
        }
        return headers
    }

    /**
     * `URLDecoder` macht aus `+` ein Leerzeichen; in Header-Werten ist `+` aber
     * ein normales Zeichen (z. B. in Basistokens), deshalb wird es vorher
     * geschützt.
     */
    private fun decode(value: String): String =
        runCatching {
            URLDecoder.decode(value.replace("+", "%2B"), StandardCharsets.UTF_8.name())
        }.getOrDefault(value)
}
