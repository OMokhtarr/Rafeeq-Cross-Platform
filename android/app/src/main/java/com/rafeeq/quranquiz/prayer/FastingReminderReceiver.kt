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
import java.time.LocalDate
import java.util.TimeZone

/**
 * Fires on the evening before a Sunnah fasting day and posts the reminder.
 *
 * Same contract as [AzkarReminderReceiver]: the notification is best effort,
 * the re-arm below it is not — it is the only link to the next reminder.
 *
 * Tapping the notification opens the Worship Tracker through a
 * `rafeeq://tracker` VIEW intent, which the web layer routes (App.tsx).
 */
class FastingReminderReceiver : BroadcastReceiver() {

    companion object {
        const val CHANNEL_ID = "rafeeq_fasting"
        private const val NOTIFICATION_ID = 4401
        private const val TAG = "RafeeqFasting"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val occasion = intent.getStringExtra(FastingReminderScheduler.EXTRA_OCCASION)
            ?.let { runCatching { FastingOccasion.valueOf(it) }.getOrNull() }
        val fastDate = intent.getStringExtra(FastingReminderScheduler.EXTRA_DATE)
            ?.let { runCatching { LocalDate.parse(it) }.getOrNull() }
        val at = intent.getLongExtra(FastingReminderScheduler.EXTRA_AT, 0L)
        val stale = fastDate == null ||
            FastingReminderScheduler.isTooLate(System.currentTimeMillis(), at, fastDate, TimeZone.getDefault())
        if (occasion != null && !stale) {
            try {
                postNotification(context, occasion)
            } catch (e: Exception) {
                Log.e(TAG, "postNotification failed for $occasion — still re-arming", e)
            }
        }

        FastingReminderScheduler.scheduleNext(context)
    }

    private fun titleFor(occasion: FastingOccasion): Int = when (occasion) {
        FastingOccasion.MONDAY -> R.string.fasting_reminder_monday_title
        FastingOccasion.THURSDAY -> R.string.fasting_reminder_thursday_title
        FastingOccasion.WHITE_DAYS -> R.string.fasting_reminder_white_days_title
        FastingOccasion.ARAFAH -> R.string.fasting_reminder_arafah_title
        FastingOccasion.ASHURA -> R.string.fasting_reminder_ashura_title
        FastingOccasion.TASUA -> R.string.fasting_reminder_tasua_title
        FastingOccasion.SHAWWAL -> R.string.fasting_reminder_shawwal_title
        // Never scheduled (FastingCalendar.reminderFor drops it); kept total.
        FastingOccasion.RAMADAN -> R.string.fasting_reminder_channel
    }

    private fun postNotification(context: Context, occasion: FastingOccasion) {
        // The app's own language, not the device's: this is the app speaking.
        val config = Configuration(context.resources.configuration).apply {
            setLocale(PrayerConfig.appLocale(context))
        }
        val res = context.createConfigurationContext(config).resources

        createNotificationChannel(context, res.getString(R.string.fasting_reminder_channel))

        val openTracker = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID,
            Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("rafeeq://tracker")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            // Brand gold for the icon and app name, where the system tints them.
            .setColor(ContextCompat.getColor(context, R.color.colorAccent))
            .setContentTitle(res.getString(titleFor(occasion)))
            .setContentText(res.getString(R.string.fasting_reminder_text))
            .setStyle(NotificationCompat.BigTextStyle().bigText(res.getString(R.string.fasting_reminder_text)))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openTracker)
            .build()

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannel(context: Context, name: String) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            name,
            NotificationManager.IMPORTANCE_DEFAULT,
        )
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .createNotificationChannel(channel)
    }
}
