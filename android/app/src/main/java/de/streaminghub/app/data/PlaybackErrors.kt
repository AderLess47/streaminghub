package de.streaminghub.app.data

import androidx.media3.common.PlaybackException

/**
 * Übersetzt ExoPlayer-Fehler in Sätze, mit denen ein Zuschauer etwas anfangen
 * kann. Vorher stand dort nur `localizedMessage` – bei DRM-Fehlern etwa
 * „Source error“, ohne Hinweis, ob Lizenz, Netz oder Format die Ursache ist.
 *
 * Die reinen Fehlercodes (statt der Exception) machen die Abbildung ohne
 * Android-Laufzeit testbar.
 */
object PlaybackErrors {

    const val BACK_HINT = "Mit „Zurück“ geht es zur Senderliste."

    private const val MAX_DETAIL = 140

    fun describe(
        errorCode: Int,
        detail: String?,
        hasDrm: Boolean,
        insecure: Boolean,
    ): String {
        val reason = reason(errorCode, detail, hasDrm)
        val parts = buildList {
            add(reason)
            if (insecure) add("Die Adresse ist unverschlüsselt (http).")
            add(BACK_HINT)
        }
        return parts.joinToString("\n")
    }

    private fun reason(errorCode: Int, detail: String?, hasDrm: Boolean): String = when (errorCode) {
        PlaybackException.ERROR_CODE_DRM_LICENSE_ACQUISITION_FAILED ->
            "Der Lizenzserver hat die Wiedergabe abgelehnt. Prüfe die DRM-Angaben der Playlist oder frage deinen Anbieter."

        PlaybackException.ERROR_CODE_DRM_LICENSE_EXPIRED ->
            "Die DRM-Lizenz ist abgelaufen. Lade die Playlist neu und starte den Sender erneut."

        PlaybackException.ERROR_CODE_DRM_PROVISIONING_FAILED ->
            "Das Gerät konnte die DRM-Wiedergabe nicht einrichten. Starte die App neu oder prüfe die Systemzeit."

        PlaybackException.ERROR_CODE_DRM_SCHEME_UNSUPPORTED ->
            "Dieses Gerät unterstützt das DRM-Verfahren des Senders nicht."

        PlaybackException.ERROR_CODE_DRM_DISALLOWED_OPERATION ->
            "Die Wiedergabe ist auf diesem Gerät nicht erlaubt, zum Beispiel wegen einer nicht unterstützten Bildausgabe."

        PlaybackException.ERROR_CODE_DRM_CONTENT_ERROR ->
            "Der geschützte Inhalt konnte nicht entschlüsselt werden. Meist stimmt die Lizenz nicht zum Sender."

        PlaybackException.ERROR_CODE_DRM_SYSTEM_ERROR,
        PlaybackException.ERROR_CODE_DRM_UNSPECIFIED,
        -> if (hasDrm) {
            "Die DRM-Wiedergabe ist fehlgeschlagen. Prüfe die DRM-Angaben der Playlist oder frage deinen Anbieter."
        } else {
            "Die Wiedergabe ist fehlgeschlagen. Prüfe die Adresse des Senders."
        }

        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
        -> "Der Sender ist nicht erreichbar. Prüfe deine Internetverbindung."

        PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ->
            "Der Server hat die Wiedergabe abgelehnt. Prüfe die Adresse des Senders."

        PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND ->
            "Die Adresse des Senders gibt es nicht mehr. Lade die Playlist neu."

        PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED,
        PlaybackException.ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED,
        PlaybackException.ERROR_CODE_PARSING_MANIFEST_UNSUPPORTED,
        PlaybackException.ERROR_CODE_DECODING_FORMAT_UNSUPPORTED,
        -> "Das Format des Senders wird nicht unterstützt."

        PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ->
            "Der Decoder für diesen Sender konnte nicht gestartet werden."

        else -> "Die Quelle konnte nicht abgespielt werden."
    }.let { text ->
        val trimmed = detail?.trim()?.takeIf { it.isNotEmpty() }?.let { clips(it) }
        if (errorCode == PlaybackException.ERROR_CODE_UNSPECIFIED && trimmed != null) {
            "$text ($trimmed)"
        } else {
            text
        }
    }

    private fun clips(detail: String): String =
        if (detail.length <= MAX_DETAIL) detail else detail.take(MAX_DETAIL - 1) + "…"
}
