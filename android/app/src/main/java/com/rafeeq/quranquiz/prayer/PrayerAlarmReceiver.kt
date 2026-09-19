package com.rafeeq.quranquiz.prayer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.rafeeq.quranquiz.MainActivity
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Fires at a single prayer's time and posts the reminder notification.
 *
 * The very first thing it does after posting is re-arm the next alarm via
 * [PrayerAlarmScheduler.scheduleNext] — prayer times move daily so nothing
 * recurs on its own, and this chain is the only thing that keeps future
 * reminders coming. That call must never be skipped, even if notification
 * posting somehow fails, so scheduling happens unconditionally.
 */
class PrayerAlarmReceiver : BroadcastReceiver() {

    companion object {
        const val CHANNEL_ID = "rafeeq_prayer"
        private const val NOTIFICATION_ID = 4201
    }

    override fun onReceive(context: Context, intent: Intent) {
        val prayerName = intent.getStringExtra(PrayerAlarmScheduler.EXTRA_PRAYER_NAME)
        postNotification(context, prayerName)

        // Re-arm the next reminder. This must run regardless of whether the
        // notification above succeeded — it is the only thing standing
        // between now and the next prayer's reminder ever firing.
        PrayerAlarmScheduler.scheduleNext(context)

        // Stage 3 (Task 8) will add the home-screen widget; once it exists,
        // this is where it gets nudged to refresh:
        //   PrayerWidgetProvider.refresh(context)
        // Omitted for now — the widget class does not exist yet.
    }

    private fun postNotification(context: Context, prayerName: String?) {
        createNotificationChannel(context)

        val displayName = prayerName
            ?.replaceFirstChar { if (it.isLowerCase()) it.titlecase(Locale.US) else it.toString() }
            ?: context.getString(R.string.app_name)
        val time = SimpleDateFormat("h:mm a", Locale.getDefault()).format(java.util.Date())

        val openAppIntent = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(displayName)
            .setContentText(time)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent)
            .build()

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Prayer reminders",
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "A reminder at each prayer time"
        }
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)
    }
}
