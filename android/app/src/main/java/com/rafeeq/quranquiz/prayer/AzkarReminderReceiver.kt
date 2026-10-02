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
 * Fires at a morning or evening azkar slot and posts the reminder.
 *
 * Same contract as [PrayerAlarmReceiver]: the notification is best effort,
 * the re-arm below it is not — it is the only link to the next reminder.
 *
 * Tapping the notification opens the matching azkar list through a
 * `rafeeq://azkar/<slot>` VIEW intent, which the web layer routes (App.tsx).
 */
class AzkarReminderReceiver : BroadcastReceiver() {

    companion object {
        const val CHANNEL_ID = "rafeeq_azkar"
        private const val NOTIFICATION_ID_BASE = 4301
        private const val TAG = "RafeeqAzkar"

        /** Wider than the prayer reminder's: the azkar window is hours long,
         *  but a morning reminder held until the evening is wrong. */
        private const val MAX_LATENESS_MS = 2 * 60 * 60_000L
    }

    override fun onReceive(context: Context, intent: Intent) {
        val slot = intent.getStringExtra(AzkarReminderScheduler.EXTRA_SLOT)
            ?.let { runCatching { AzkarSlot.valueOf(it) }.getOrNull() }
        val slotAt = intent.getLongExtra(AzkarReminderScheduler.EXTRA_SLOT_AT, 0L)
        val late = slotAt > 0 && System.currentTimeMillis() - slotAt > MAX_LATENESS_MS
        if (slot != null && !late) {
            try {
                postNotification(context, slot)
            } catch (e: Exception) {
                Log.e(TAG, "postNotification failed for slot=$slot — still re-arming", e)
            }
        }

        AzkarReminderScheduler.scheduleNext(context)
    }

    private fun postNotification(context: Context, slot: AzkarSlot) {
        // The app's own language, not the device's: this is the app speaking.
        val config = Configuration(context.resources.configuration).apply {
            setLocale(PrayerConfig.appLocale(context))
        }
        val res = context.createConfigurationContext(config).resources

        createNotificationChannel(context, res.getString(R.string.azkar_reminder_channel))

        val (title, text) = when (slot) {
            AzkarSlot.MORNING -> R.string.azkar_reminder_morning_title to R.string.azkar_reminder_morning_text
            AzkarSlot.EVENING -> R.string.azkar_reminder_evening_title to R.string.azkar_reminder_evening_text
        }

        val openAzkar = PendingIntent.getActivity(
            context,
            NOTIFICATION_ID_BASE + slot.ordinal,
            Intent(context, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW
                data = Uri.parse("rafeeq://azkar/${slot.name.lowercase()}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            // Brand gold for the icon and app name, where the system tints them.
            .setColor(ContextCompat.getColor(context, R.color.colorAccent))
            .setContentTitle(res.getString(title))
            .setContentText(res.getString(text))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openAzkar)
            .build()

        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
            .notify(NOTIFICATION_ID_BASE + slot.ordinal, notification)
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
