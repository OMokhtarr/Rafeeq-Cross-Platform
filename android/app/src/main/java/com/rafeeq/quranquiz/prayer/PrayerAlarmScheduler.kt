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
     * Finds the next enabled prayer and arms one exact alarm for it.
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
