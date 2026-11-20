package de.streaminghub.app.data

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.media3.common.PlaybackException

/**
 * Automatischer Neustart nach einem Netzfehler.
 *
 * Der Fehlerbildschirm bleibt sichtbar, aber die App versucht es selbst weiter:
 * alle fünf Sekunden, solange die Verbindung fehlt, und sofort beim nächsten
 * Versuch, sobald wieder ein Netz da ist. Vier automatische Versuche reichen für
 * einen längeren Ausfall; danach bleibt „Erneut versuchen“.
 *
 * Bewusst kein `NetworkCallback`: Die Abfrage ist billig, funktioniert ab API 23
 * ohne Verzweigung und kann nicht vergessen werden abzumelden.
 */
object PlaybackRetry {

    /** Abstand zwischen zwei Versuchen, solange kein Netz da ist. */
    const val POLL_MS = 5_000L

    /** So oft startet die App nach einem Netzfehler von selbst neu. */
    const val MAX_AUTO_RETRIES = 4

    /** Zusatz zur Fehlermeldung, solange automatisch weiterversucht wird. */
    const val HINT = "Sobald die Verbindung wieder da ist, startet die Wiedergabe automatisch neu."

    fun isNetworkError(errorCode: Int): Boolean = when (errorCode) {
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT,
        -> true

        else -> false
    }

    fun canRetryAutomatically(attempts: Int): Boolean = attempts < MAX_AUTO_RETRIES

    fun isOnline(context: Context): Boolean {
        val manager = context.applicationContext
            .getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
        val network = manager.activeNetwork ?: return false
        val capabilities = manager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
