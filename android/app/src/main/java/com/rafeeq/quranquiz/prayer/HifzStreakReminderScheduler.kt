package com.rafeeq.quranquiz.prayer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.util.Calendar
import java.util.Date
import java.util.TimeZone

/**
 * Arms the single pending hifz-streak reminder: once a day at the clock time
 * the user picked on the Hifz page (or in Settings).
 *
 * Same self-re-arming chain as [AzkarReminderScheduler]: one alarm pending at
 * a time, and HifzStreakReminderReceiver calls [scheduleNext] when it fires.
 * Re-arming with the same request code replaces the pending alarm, so a
 * changed time never leaves the old one behind.
 *
 * It is a fixed clock time, so location and calculation-method changes do not
 * move it.
 */
object HifzStreakReminderScheduler {

    private const val REQUEST_CODE = 4600
    const val EXTRA_SLOT_AT = "streak_slot_at"

    /** A reminder held back hours (phone off all evening) is dropped. */
    private const val MAX_LATENESS_MS = 2 * 60 * 60_000L

    private fun pendingIntent(ctx: Context, at: Long? = null): PendingIntent {
        val intent = Intent(ctx, HifzStreakReminderReceiver::class.java).apply {
            at?.let { putExtra(EXTRA_SLOT_AT, it) }
        }
        return PendingIntent.getBroadcast(
            ctx,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** The next [minuteOfDay] strictly after [now], in [tz]. */
    internal fun nextAt(now: Date, tz: TimeZone, minuteOfDay: Int): Date {
        val cal = Calendar.getInstance(tz).apply {
            time = now
            set(Calendar.HOUR_OF_DAY, minuteOfDay / 60)
            set(Calendar.MINUTE, minuteOfDay % 60)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        if (!cal.time.after(now)) cal.add(Calendar.DAY_OF_YEAR, 1)
        return cal.time
    }

    /** Whether a delivery at [firedAt] is too late for the slot at [slotAt] (0 = unknown). */
    internal fun isLate(firedAt: Long, slotAt: Long): Boolean =
        slotAt > 0 && firedAt - slotAt > MAX_LATENESS_MS

    /** Arms the next reminder; no-ops when the streak reminder is off. */
    fun scheduleNext(ctx: Context) {
        if (!PrayerConfig.streakReminderEnabled(ctx)) return
        val at = nextAt(Date(), TimeZone.getDefault(), PrayerConfig.streakReminderMinute(ctx)).time
        PrayerAlarmScheduler.setAlarm(ctx, at, pendingIntent(ctx, at))
    }

    /** Cancels the pending streak reminder, if any. */
    fun cancel(ctx: Context) {
        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntent(ctx))
    }
}
