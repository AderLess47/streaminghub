package de.streaminghub.app.reminder

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import de.streaminghub.app.MainActivity
import de.streaminghub.app.R

class ReminderReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            return
        }

        val channelName = intent.getStringExtra(EXTRA_CHANNEL).orEmpty()
        val title = intent.getStringExtra(EXTRA_TITLE).orEmpty()
        val start = intent.getLongExtra(EXTRA_START, 0L)
        if (title.isBlank()) return

        createChannel(context)
        val openApp = PendingIntent.getActivity(
            context,
            start.hashCode(),
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText("Jetzt auf $channelName")
            .setContentIntent(openApp)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        runCatching {
            NotificationManagerCompat.from(context).notify(start.hashCode(), notification)
        }
    }

    private fun createChannel(context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Sendungserinnerungen",
            NotificationManager.IMPORTANCE_DEFAULT,
        ).apply {
            description = "Erinnerungen für Sendungen im StreamingHub-Programmführer"
        }
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val EXTRA_CHANNEL = "programme_channel"
        const val EXTRA_TITLE = "programme_title"
        const val EXTRA_START = "programme_start"
        const val CHANNEL_ID = "streaminghub_reminders"
    }
}
