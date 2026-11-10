package de.streaminghub.app.model

data class EpgProgramme(
    val channelId: String,
    val channelName: String,
    val startMs: Long,
    val stopMs: Long,
    val title: String,
    val description: String?,
)
