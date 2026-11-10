package de.streaminghub.app.data

import de.streaminghub.app.model.EpgProgramme
import org.w3c.dom.Element
import org.xml.sax.InputSource
import java.io.StringReader
import java.text.SimpleDateFormat
import java.util.Locale
import javax.xml.parsers.DocumentBuilderFactory

/**
 * Minimal XMLTV reader for the programme guide. It intentionally ignores
 * channel icons and unsupported extensions, keeping only the data the app
 * displays: channel identity, start/stop, title and description.
 */
object XmltvParser {

    private const val MAX_PROGRAMMES = 50_000

    private val datePatterns = listOf(
        "yyyyMMddHHmmss Z",
        "yyyyMMddHHmmssZ",
        "yyyyMMddHHmmss",
    )

    fun parse(xml: String): List<EpgProgramme> {
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = false
            isExpandEntityReferences = false
            runCatching {
                setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            }
            runCatching {
                setFeature("http://xml.org/sax/features/external-general-entities", false)
            }
            runCatching {
                setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            }
        }

        val document = factory.newDocumentBuilder().parse(InputSource(StringReader(xml)))
        val channelNames = mutableMapOf<String, String>()

        val channelNodes = document.getElementsByTagName("channel")
        for (index in 0 until channelNodes.length) {
            val channel = channelNodes.item(index) as? Element ?: continue
            val id = channel.getAttribute("id").trim()
            if (id.isBlank()) continue
            val names = channel.getElementsByTagName("display-name")
            val displayName = (0 until names.length)
                .asSequence()
                .map { names.item(it)?.textContent?.trim().orEmpty() }
                .firstOrNull { it.isNotBlank() }
                .orEmpty()
            if (displayName.isNotBlank()) channelNames[id] = displayName
        }

        val result = ArrayList<EpgProgramme>()
        val programmeNodes = document.getElementsByTagName("programme")
        for (index in 0 until programmeNodes.length) {
            if (result.size >= MAX_PROGRAMMES) break
            val programme = programmeNodes.item(index) as? Element ?: continue
            val channelId = programme.getAttribute("channel").trim()
            if (channelId.isBlank()) continue

            val start = parseDate(programme.getAttribute("start")) ?: continue
            val stop = parseDate(programme.getAttribute("stop")) ?: continue
            if (stop <= start) continue

            val title = childText(programme, "title")
            if (title.isBlank()) continue
            val description = childText(programme, "desc").takeIf { it.isNotBlank() }

            result += EpgProgramme(
                channelId = channelId,
                channelName = channelNames[channelId] ?: channelId,
                startMs = start,
                stopMs = stop,
                title = title,
                description = description,
            )
        }

        return result.sortedWith(compareBy(EpgProgramme::startMs, EpgProgramme::channelName))
    }

    private fun childText(parent: Element, tag: String): String {
        val nodes = parent.getElementsByTagName(tag)
        if (nodes.length == 0) return ""
        return nodes.item(0)?.textContent?.trim().orEmpty()
    }

    private fun parseDate(raw: String): Long? {
        val value = raw.trim()
        if (value.isBlank()) return null

        for (pattern in datePatterns) {
            val date = runCatching {
                SimpleDateFormat(pattern, Locale.US).apply {
                    isLenient = false
                }.parse(value)
            }.getOrNull()
            if (date != null) return date.time
        }
        return null
    }
}
