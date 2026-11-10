package de.streaminghub.app.data

import android.content.Context
import android.content.res.Configuration
import android.os.Build

object DeviceIdentity {

    fun platform(context: Context): String {
        if (Build.MANUFACTURER.equals("Amazon", ignoreCase = true)) return "firetv"
        val uiMode = context.resources.configuration.uiMode and Configuration.UI_MODE_TYPE_MASK
        return if (uiMode == Configuration.UI_MODE_TYPE_TELEVISION) "androidtv" else "android"
    }

    fun name(): String {
        val value = listOf(Build.MANUFACTURER, Build.MODEL)
            .filter { it.isNotBlank() }
            .joinToString(" ")
            .replace(Regex("\\s+"), " ")
            .trim()
        return value.ifBlank { "Android-Gerät" }.take(60)
    }
}
