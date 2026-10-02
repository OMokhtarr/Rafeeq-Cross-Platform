package com.rafeeq.quranquiz.prayer

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.rafeeq.quranquiz.MainActivity
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.util.Date

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

        /**
         * How late a reminder may still be shown. Xiaomi's battery manager
         * (MIUI/HyperOS) can hold an alarm for hours and release it when the
         * app is next opened — testers saw "Maghrib" at 23:13. Past this,
         * the prayer the reminder names is no longer the one that is due,
         * so announcing it would mislead; the chain is re-armed either way.
         */
        internal const val MAX_LATENESS_MS = 30 * 60_000L

        internal fun isStale(prayerAt: Long, now: Long): Boolean =
            prayerAt > 0 && now - prayerAt > MAX_LATENESS_MS

        private val NAME_RES = mapOf(
            "fajr" to R.string.prayer_widget_name_fajr,
            "dhuhr" to R.string.prayer_widget_name_dhuhr,
            "asr" to R.string.prayer_widget_name_asr,
            "maghrib" to R.string.prayer_widget_name_maghrib,
            "isha" to R.string.prayer_widget_name_isha,
        )
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
        val prayerAt = intent.getLongExtra(PrayerAlarmScheduler.EXTRA_PRAYER_AT, 0L)
        try {
            if (isStale(prayerAt, System.currentTimeMillis())) {
                Log.w(TAG, "alarm for prayer=$prayerName fired ${(System.currentTimeMillis() - prayerAt) / 60_000} min late — not shown")
            } else {
                postNotification(context, prayerName, prayerAt)
            }
        } catch (e: Exception) {
            Log.e(TAG, "postNotification failed for prayer=$prayerName — reminder not shown, still re-arming next alarm", e)
        }

        // Re-arm the next reminder. Runs on both the success and failure path
        // above, unconditionally: this is the only link in the chain, and a
        // skipped call here would silently stop all future reminders.
        PrayerAlarmScheduler.scheduleNext(context)

        PrayerWidgetProvider.refresh(context)
    }

    private fun postNotification(context: Context, prayerName: String?, prayerAt: Long) {
        createNotificationChannel(context)

        // The app's own language, as in the rest of the app — not the device's.
        val locale = PrayerConfig.appLocale(context)
        val res = context.createConfigurationContext(
            Configuration(context.resources.configuration).apply { setLocale(locale) },
        ).resources

        val displayName = NAME_RES[prayerName]?.let { res.getString(it) }
            ?: context.getString(R.string.app_name)
        // The prayer's time, not the moment the alarm happened to fire: a
        // delayed alarm otherwise reads as a wrong prayer time.
        val pattern = if (PrayerConfig.use24Hour(context)) "H:mm" else "h:mm a"
        val time = SimpleDateFormat(pattern, locale)
            .format(Date(if (prayerAt > 0) prayerAt else System.currentTimeMillis()))

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
            // Brand gold for the icon and app name, where the system tints them.
            .setColor(ContextCompat.getColor(context, R.color.colorAccent))
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
