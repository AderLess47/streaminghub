package de.streaminghub.app.model

enum class MediaKind(val label: String) {
    LIVE("Live"),
    MOVIE("Film"),
    SERIES("Serie"),
}

data class Channel(
    val name: String,
    val url: String,
    val logo: String?,
    val group: String,
    val tvgId: String?,
    val kind: MediaKind,
)
