package de.streaminghub.app.data

import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy

/**
 * Mehr Wiederholungen für wackelige IPTV-Quellen.
 *
 * Media3 versucht es standardmäßig dreimal (HLS zählt als normaler Datenstrom,
 * nicht als „progressive live“), mit 0, 1 und 2 Sekunden Pause dazwischen. Ein
 * Aussetzer von wenigen Sekunden landet damit schon im Fehlerbildschirm. Acht
 * Versuche verlängern das Fenster auf rund 20 Sekunden, ohne die Wartezeit
 * danach zu verlängern.
 *
 * Alles andere bleibt beim Standard: Die Verzögerung kommt weiterhin von
 * [DefaultLoadErrorHandlingPolicy], und endgültige Fehler (kaputtes Manifest,
 * 404, fehlende Berechtigung) liefern `C.TIME_UNSET` und werden nicht
 * wiederholt.
 */
class ResilientLoadErrorPolicy(
    private val retries: Int = DEFAULT_RETRIES,
    private val delegate: LoadErrorHandlingPolicy = DefaultLoadErrorHandlingPolicy(),
) : LoadErrorHandlingPolicy by delegate {

    override fun getMinimumLoadableRetryCount(dataType: Int): Int =
        maxOf(retries, delegate.getMinimumLoadableRetryCount(dataType))

    companion object {
        const val DEFAULT_RETRIES = 8
    }
}
