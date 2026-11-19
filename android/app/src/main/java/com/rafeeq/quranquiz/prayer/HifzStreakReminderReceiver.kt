package com.rafeeq.quranquiz.prayer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.rafeeq.quranquiz.MainActivity
import com.rafeeq.quranquiz.R

/**
 * Fires at the user's daily streak-reminder time and posts the reminder.
 *
 * Same contract as [AzkarReminderReceiver]: the notification is best effort,
 * the re-arm below it is not — it is the only link to tomorrow's reminder.
 *
 * Tapping the notification opens the Hifz page through a `rafeeq://hifz`
 * VIEW intent, which the web layer routes (App.tsx).
 */
class HifzStreakReminderReceiver : BroadcastReceiver() {

    companion object {
        const val CHANNEL_ID = "rafeeq_hifz_streak"
        private const val NOTIFICATION_ID = 4601
        private const val TAG = "RafeeqStreak"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val slotAt = intent.getLongExtra(HifzStreakReminderScheduler.EXTRA_SLOT_AT, 0L)
        if (!HifzStreakReminderScheduler.isLate(System.currentTimeMillis(), slotAt)) {
            try {
                postNotification(context)
            } catch (e: Exception) {
                Log.e(TAG, "postNotification failed — still re-arming", e)
            }
        }

        HifzStreakReminderScheduler.scheduleNext(context)
    }

    private fun postNotification(context: Context) {
        // The app's own language, not the device's: this is the app speaking.
        val config = Configuration(context.resources.configuration).apply {
            setLocale(PrayerConfig.appLocale(context))
        }
        val res = context.createConfigurationContext(config).resources

        createNotificationChannel(context, res.getString(R.string.streak_reminder_channel))

        val openHifz = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("rafeeq://hifz")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(ContextCompat.getColor(context, R.color.colorAccent))
            .setContentTitle(res.getString(R.string.streak_reminder_title))
            .setContentText(res.getString(R.string.streak_reminder_text))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openHifz)
            .build()

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel(context: Context, name: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_DEFAULT)
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)
    }
}
