package de.streaminghub.app.reminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import de.streaminghub.app.model.EpgProgramme

object ReminderScheduler {

    fun schedule(context: Context, programme: EpgProgramme): Boolean {
        if (programme.startMs <= System.currentTimeMillis()) return false
        val alarmManager = context.getSystemService(AlarmManager::class.java) ?: return false

        val intent = Intent(context, ReminderReceiver::class.java).apply {
            putExtra(ReminderReceiver.EXTRA_CHANNEL, programme.channelName)
            putExtra(ReminderReceiver.EXTRA_TITLE, programme.title)
            putExtra(ReminderReceiver.EXTRA_START, programme.startMs)
        }
        val requestCode = (programme.channelId + ":" + programme.startMs).hashCode()
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return runCatching {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.RTC_WAKEUP,
                programme.startMs,
                pendingIntent,
            )
        }.isSuccess
    }
}
