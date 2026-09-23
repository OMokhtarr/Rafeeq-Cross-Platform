package com.rafeeq.quranquiz.prayer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.rafeeq.quranquiz.MainActivity
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.util.Locale

/**
 * Fires at a single prayer's time and posts the reminder notification.
 *
 * Re-arming the next alarm via [PrayerAlarmScheduler.scheduleNext] is the
 * only thing that keeps future reminders coming — prayer times move daily,
 * so nothing recurs on its own. [postNotification] is therefore wrapped in a
 * try/catch: a failure there is logged and swallowed so it genuinely cannot
 * stop the re-arm below from running. `scheduleNext` itself is deliberately
 * left outside that catch — if scheduling fails, that is a real defect that
 * should surface (e.g. crash-report), not one we mask.
 */
class PrayerAlarmReceiver : BroadcastReceiver() {

    companion object {
        const val CHANNEL_ID = "rafeeq_prayer"
        private const val NOTIFICATION_ID = 4201
        private const val TAG = "RafeeqPrayer"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.getBooleanExtra(PrayerAlarmScheduler.EXTRA_WIDGET_ROLL, false)) {
            // The widget's own refresh tick: the new day, a prayer arriving,
            // or a prayer's elapsed window closing — whichever came first.
            // Not a reminder: no notification, just a refresh and re-arming
            // the next tick. Independent of the reminder toggle, which is
            // why it exists at all.
            PrayerWidgetProvider.refresh(context)
            PrayerAlarmScheduler.scheduleMidnightRoll(context)
            return
        }

        val prayerName = intent.getStringExtra(PrayerAlarmScheduler.EXTRA_PRAYER_NAME)
        try {
            postNotification(context, prayerName)
        } catch (e: Exception) {
            Log.e(TAG, "postNotification failed for prayer=$prayerName — reminder not shown, still re-arming next alarm", e)
        }

        // Re-arm the next reminder. Runs on both the success and failure path
        // above, unconditionally: this is the only link in the chain, and a
        // skipped call here would silently stop all future reminders.
        PrayerAlarmScheduler.scheduleNext(context)

        PrayerWidgetProvider.refresh(context)
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
