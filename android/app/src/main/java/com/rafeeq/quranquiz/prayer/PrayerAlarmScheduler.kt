package com.rafeeq.quranquiz.prayer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.util.Date
import java.util.TimeZone

/**
 * Arms the single pending prayer-reminder alarm.
 *
 * Prayer times move every day, so nothing here recurs: there is exactly one
 * alarm pending at a time, targeting the very next enabled prayer. Each time
 * it fires, PrayerAlarmReceiver's first action is to call [scheduleNext]
 * again to arm the one after that — the chain re-arms itself rather than any
 * alarm repeating. This also means a stale alarm is never left behind: the
 * fixed request code below lets a new call replace whatever was pending.
 */
object PrayerAlarmScheduler {

    private const val REQUEST_CODE = 4200
    const val EXTRA_PRAYER_NAME = "prayer_name"

    private fun pendingIntent(ctx: Context, prayerName: String? = null): PendingIntent {
        val intent = Intent(ctx, PrayerAlarmReceiver::class.java).apply {
            prayerName?.let { putExtra(EXTRA_PRAYER_NAME, it) }
        }
        return PendingIntent.getBroadcast(
            ctx,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * Finds the next enabled prayer and arms one exact alarm for it.
     *
     * Returns immediately (schedules nothing) when there is no stored
     * location yet, when reminders are turned off, or when the engine
     * cannot determine a next prayer at all (e.g. the midnight-sun window at
     * high latitude) — none of these are errors, they are simply states with
     * nothing to schedule.
     */
    fun scheduleNext(ctx: Context) {
        if (!PrayerConfig.remindersEnabled(ctx)) return
        val coords = PrayerConfig.coords(ctx) ?: return
        val (lat, lng) = coords
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)
        val tz = TimeZone.getDefault()
        val enabled = PrayerConfig.enabledPrayers(ctx)

        // Advance past any prayer the user has disabled, looking ahead one day
        // at a time. nextAfter() itself already rolls from today's Isha to
        // tomorrow's Fajr, so a handful of iterations is always enough to
        // either land on an enabled prayer or exhaust the engine (null).
        var now = Date()
        var next = PrayerTimesEngine.nextAfter(now, lat, lng, method, madhab, tz)
        while (next != null && next.name.name.lowercase() !in enabled) {
            now = Date(next.at.time + 1000L)
            next = PrayerTimesEngine.nextAfter(now, lat, lng, method, madhab, tz)
        }
        if (next == null) return

        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.setExactAndAllowWhileIdle(
            AlarmManager.RTC_WAKEUP,
            next.at.time,
            pendingIntent(ctx, next.name.name.lowercase()),
        )
    }

    /** Cancels whatever prayer alarm is currently pending, if any. */
    fun cancelAll(ctx: Context) {
        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntent(ctx))
    }
}
