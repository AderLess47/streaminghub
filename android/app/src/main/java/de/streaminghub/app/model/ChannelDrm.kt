package de.streaminghub.app.model

import java.util.UUID

/**
 * DRM-Angaben eines Senders aus der Playlist (`#KODIPROP`), wie sie
 * IPTV-Anbieter liefern.
 *
 * Nur die Verfahren, für die ExoPlayer auf Android eine Plattform-Implementierung
 * mitbringt, werden übernommen: Widevine und PlayReady. Alles andere bleibt
 * bewusst ohne DRM, statt mit einer geratenen Lizenz-URL zu scheitern.
 */
enum class DrmScheme(
    val kodipropName: String,
    val uuid: UUID,
    val label: String,
) {
    WIDEVINE(
        kodipropName = "com.widevine.alpha",
        uuid = UUID.fromString("edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"),
        label = "Widevine",
    ),
    PLAYREADY(
        kodipropName = "com.microsoft.playready",
        uuid = UUID.fromString("9a04f079-9840-4286-ab92-e65be0885f95"),
        label = "PlayReady",
    ),
    ;

    companion object {
        fun fromKodiprop(value: String?): DrmScheme? {
            val normalized = value?.trim()?.lowercase() ?: return null
            return entries.firstOrNull { it.kodipropName == normalized }
        }
    }
}

data class ChannelDrm(
    val scheme: DrmScheme,
    val licenseUrl: String,
    /** Zusätzliche Lizenz-Header (z. B. `Authorization`), falls der Anbieter sie verlangt. */
    val headers: Map<String, String> = emptyMap(),
)
