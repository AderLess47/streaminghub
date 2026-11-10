package de.streaminghub.app.data

import android.app.ActivityManager
import android.content.Context

class SettingsRepository(context: Context) {

    private val appContext = context.applicationContext
    private val preferences = appContext
        .getSharedPreferences("streaminghub_settings", Context.MODE_PRIVATE)

    fun isLowSpecMode(): Boolean {
        if (preferences.contains(KEY_LOW_SPEC)) {
            return preferences.getBoolean(KEY_LOW_SPEC, false)
        }

        val activityManager = appContext.getSystemService(ActivityManager::class.java)
        return activityManager?.isLowRamDevice == true
    }

    fun saveLowSpecMode(enabled: Boolean) {
        preferences.edit().putBoolean(KEY_LOW_SPEC, enabled).apply()
    }

    private companion object {
        const val KEY_LOW_SPEC = "low_spec_mode"
    }
}
