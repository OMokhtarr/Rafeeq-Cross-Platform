package com.rafeeq.quranquiz.prayer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import java.util.Calendar
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

    // Distinct from REQUEST_CODE above: both PendingIntents target the same
    // receiver class, and a shared request code would let one silently
    // replace the other instead of the two coexisting.
    private const val MIDNIGHT_REQUEST_CODE = 4210
    const val EXTRA_WIDGET_ROLL = "widget_roll"

    /** One minute past midnight: late enough that the day has unambiguously
     *  turned over (no clock-skew ambiguity at exactly 00:00), early enough
     *  that the widget is never stale for long into the new day. */
    private const val MIDNIGHT_ROLL_HOUR = 0
    private const val MIDNIGHT_ROLL_MINUTE = 1

    // A day has five prayers, so walking past that many candidates already covers
    // every legitimate case (skip every disabled prayer across a day boundary)
    // with room to spare. This is a second line of defence behind the emptiness
    // check in scheduleNext(): if some future bug lets us get here with nothing
    // ever matching, we give up rather than loop forever recomputing prayer times
    // on (in the plugin's case) the main thread.
    internal const val MAX_LOOKUPS = 8

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
     * The pure "which prayer do we arm?" decision, kept free of Context so it can
     * be unit-tested directly: repeatedly asks [lookup] for the next prayer after
     * a given instant, skipping any whose lowercase name isn't in [enabled], until
     * it finds one, runs out of prayers (lookup returns null — e.g. midnight sun),
     * or hits [MAX_LOOKUPS] lookups.
     *
     * An empty [enabled] set is handled by the caller (nothing could ever match,
     * so there's no point calling [lookup] at all) — this function still bounds
     * its own loop as a second line of defence in case that guard is ever missed.
     */
    internal fun findNextEnabled(
        start: Date,
        enabled: Set<String>,
        lookup: (Date) -> NextPrayer?,
    ): NextPrayer? {
        var now = start
        repeat(MAX_LOOKUPS) {
            val next = lookup(now) ?: return null
            if (next.name.name.lowercase() in enabled) return next
            now = Date(next.at.time + 1000L)
        }
        // Exhausted the cap without a match — treat as "nothing to schedule"
        // rather than arming an arbitrary/disabled prayer.
        return null
    }

    /**
     * Finds the next enabled prayer and arms one alarm for it (exact when permitted).
     *
     * Returns immediately (schedules nothing) when there is no stored
     * location yet, when reminders are turned off, when no prayer is
     * enabled at all, or when the engine cannot determine a next prayer
     * (e.g. the midnight-sun window at high latitude) — none of these are
     * errors, they are simply states with nothing to schedule.
     */
    fun scheduleNext(ctx: Context) {
        if (!PrayerConfig.remindersEnabled(ctx)) return
        val coords = PrayerConfig.coords(ctx) ?: return
        val (lat, lng) = coords
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)
        val tz = TimeZone.getDefault()
        val enabled = PrayerConfig.enabledPrayers(ctx)
        // Nothing could ever match an empty set — bail before touching the
        // (comparatively expensive) prayer-times engine at all. Without this,
        // findNextEnabled's own cap still protects us, but this is the
        // legitimate, expected case (e.g. the UI briefly sends an empty
        // selection) and deserves its own early return, not a "hit the cap"
        // path.
        if (enabled.isEmpty()) return

        val next = findNextEnabled(Date(), enabled) { at ->
            PrayerTimesEngine.nextAfter(at, lat, lng, method, madhab, tz)
        } ?: return

        setAlarm(ctx, next.at.time, pendingIntent(ctx, next.name.name.lowercase()))
    }

    /** Whether alarms can fire exactly: always below Android 12, otherwise
     *  only once the user has granted SCHEDULE_EXACT_ALARM. */
    fun canScheduleExact(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return alarmManager.canScheduleExactAlarms()
    }

    /**
     * Exact when permitted, otherwise the inexact Doze-safe variant — Doze may
     * defer it by some minutes, but a late reminder beats none, and calling
     * the exact API without the permission throws SecurityException.
     */
    private fun setAlarm(ctx: Context, at: Long, operation: PendingIntent) {
        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (canScheduleExact(ctx)) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
        } else {
            alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
        }
    }

    /** Cancels whatever prayer alarm is currently pending, if any. */
    fun cancelAll(ctx: Context) {
        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntent(ctx))
    }

    private fun midnightRollPendingIntent(ctx: Context): PendingIntent {
        val intent = Intent(ctx, PrayerAlarmReceiver::class.java).apply {
            putExtra(EXTRA_WIDGET_ROLL, true)
        }
        return PendingIntent.getBroadcast(
            ctx,
            MIDNIGHT_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * Arms the widget's own refresh alarm for the next moment its display
     * changes: whichever comes first of 00:01 (the new day) and the next card
     * boundary from [PrayerDeck.nextBoundary] (a prayer arriving, or its
     * elapsed window closing). The receiver refreshes and calls this again,
     * so the chain walks through the day one boundary at a time.
     *
     * It used to target midnight only, leaving the per-prayer refreshes to
     * the reminder alarm — which [scheduleNext] skips entirely when
     * reminders are off. With them off, nothing re-rendered the widget at
     * Maghrib and its countdown ran on through zero into negative numbers
     * until the app was opened.
     *
     * Independent of [scheduleNext] and of whether reminders are enabled at
     * all: the widget reflects today's times whenever a location is stored,
     * regardless of the reminder toggle, so its own refresh chain must not
     * depend on that toggle either. No-ops without a stored location, same as
     * [scheduleNext] — there is nothing to refresh a widget with otherwise.
     */
    fun scheduleMidnightRoll(ctx: Context) {
        if (PrayerConfig.coords(ctx) == null) return

        val tz = TimeZone.getDefault()
        val midnight = Calendar.getInstance(tz).apply {
            set(Calendar.HOUR_OF_DAY, MIDNIGHT_ROLL_HOUR)
            set(Calendar.MINUTE, MIDNIGHT_ROLL_MINUTE)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (!after(Calendar.getInstance(tz))) {
                add(Calendar.DAY_OF_YEAR, 1)
            }
        }.timeInMillis

        val boundary = nextCardBoundary(ctx, tz)
        val at = if (boundary != null && boundary < midnight) boundary else midnight

        setAlarm(ctx, at, midnightRollPendingIntent(ctx))
    }

    /** The next card boundary in epoch millis, or null with no stored location. */
    private fun nextCardBoundary(ctx: Context, tz: TimeZone): Long? {
        val (lat, lng) = PrayerConfig.coords(ctx) ?: return null
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)
        val now = Date()
        val (today, tomorrow) = PrayerDeck.dayPair(lat, lng, now, method, madhab, tz)
        return PrayerDeck.nextBoundary(now, today, tomorrow)?.time
    }

    /** Cancels the pending midnight-roll alarm, if any. */
    fun cancelMidnightRoll(ctx: Context) {
        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(midnightRollPendingIntent(ctx))
    }
}
