package com.rafeeq.quranquiz.prayer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.rafeeq.quranquiz.MainActivity
import java.time.LocalDate
import java.time.ZoneId
import java.util.Date
import java.util.TimeZone

/**
 * Arms the prayer alarms — the ringing ones, not the reminder notifications.
 *
 * Like [PrayerAlarmScheduler] it keeps exactly one pending ring: the soonest
 * next occurrence across every enabled alarm. Each ring (and each stop,
 * snooze or edit) calls [scheduleNext] again, so the chain follows the
 * prayer times as they move day by day. Snoozes have a pending alarm of
 * their own, so snoozing never disturbs the chain.
 *
 * Its request codes differ from the reminder (4200) and widget-roll (4210)
 * alarms: the three would otherwise replace one another.
 */
object PrayerAlarmClockScheduler {

    private const val RING_REQUEST = 4220
    private const val SNOOZE_REQUEST = 4221
    private const val SHOW_REQUEST = 4222

    const val EXTRA_ALARM_IDS = "alarm_ids"
    /** Parallel to [EXTRA_ALARM_IDS]: each alarm's prayer time, epoch millis. */
    const val EXTRA_PRAYER_AT = "alarm_prayer_at"
    /** When the ring was due, epoch millis — it may be delivered later. */
    const val EXTRA_RING_AT = "alarm_ring_at"

    /** Prayer times for a date, or null without a stored location. */
    private fun timesOn(ctx: Context, zone: ZoneId): ((LocalDate) -> DayTimes?)? {
        val (lat, lng) = PrayerConfig.coords(ctx) ?: return null
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)
        val tz = TimeZone.getTimeZone(zone)
        return { date ->
            // Noon, so the engine's calendar day is the date asked for in
            // every zone, whatever the DST transition that day.
            val noon = Date.from(date.atTime(12, 0).atZone(zone).toInstant())
            PrayerTimesEngine.timesFor(lat, lng, noon, method, madhab, tz)
        }
    }

    fun nextRing(ctx: Context, after: Long = System.currentTimeMillis()): AlarmRing? {
        val zone = ZoneId.systemDefault()
        val times = timesOn(ctx, zone) ?: return null
        val shift = PrayerAlarmConfig.settings(ctx).ramadanShiftDays
        return PrayerAlarmMath.nextRing(PrayerAlarmConfig.alarms(ctx), after, zone, shift, times)
    }

    /** When [alarm] would ring next, as if it were switched on; for the editor. */
    fun previewNext(ctx: Context, alarm: PrayerAlarm): Long? {
        val zone = ZoneId.systemDefault()
        val times = timesOn(ctx, zone) ?: return null
        val shift = PrayerAlarmConfig.settings(ctx).ramadanShiftDays
        return PrayerAlarmMath.nextOccurrence(
            PrayerAlarmConfig.sanitise(alarm.copy(enabled = true)),
            System.currentTimeMillis(), zone, shift, times,
        )?.first
    }

    /** When [alarm] rings next as it stands (null when it is off). */
    fun nextFor(ctx: Context, alarm: PrayerAlarm): Long? {
        val zone = ZoneId.systemDefault()
        val times = timesOn(ctx, zone) ?: return null
        val shift = PrayerAlarmConfig.settings(ctx).ramadanShiftDays
        return PrayerAlarmMath.nextOccurrence(alarm, System.currentTimeMillis(), zone, shift, times)?.first
    }

    private fun ringIntent(ctx: Context, requestCode: Int, ids: List<String>, prayerAts: LongArray, ringAt: Long): PendingIntent {
        val intent = Intent(ctx, PrayerAlarmRingReceiver::class.java).apply {
            action = PrayerAlarmRingReceiver.ACTION_RING
            putExtra(EXTRA_ALARM_IDS, ids.toTypedArray())
            putExtra(EXTRA_PRAYER_AT, prayerAts)
            putExtra(EXTRA_RING_AT, ringAt)
        }
        return PendingIntent.getBroadcast(
            ctx, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** A bare intent matching [ringIntent] for [requestCode], for cancelling. */
    private fun cancelIntent(ctx: Context, requestCode: Int): PendingIntent =
        PendingIntent.getBroadcast(
            ctx, requestCode,
            Intent(ctx, PrayerAlarmRingReceiver::class.java).setAction(PrayerAlarmRingReceiver.ACTION_RING),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

    /**
     * setAlarmClock when exact alarms are allowed: exempt from Doze, never
     * deferred, and it shows the alarm icon in the status bar. Without the
     * permission that call throws, so the inexact Doze-safe variant stands
     * in — the Alarms sheet warns that rings may then be late.
     */
    private fun arm(ctx: Context, at: Long, operation: PendingIntent) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        if (PrayerAlarmScheduler.canScheduleExact(ctx)) {
            val show = PendingIntent.getActivity(
                ctx, SHOW_REQUEST,
                Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), operation)
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, operation)
        }
    }

    /**
     * Arms the soonest ring strictly after [after], or cancels the pending
     * one when nothing is left to ring (no location, no enabled alarm).
     */
    fun scheduleNext(ctx: Context, after: Long = System.currentTimeMillis()) {
        val ring = nextRing(ctx, after)
        if (ring == null) {
            val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            am.cancel(cancelIntent(ctx, RING_REQUEST))
            return
        }
        val prayerAts = LongArray(ring.alarmIds.size) { ring.prayerAt[ring.alarmIds[it]] ?: 0L }
        arm(ctx, ring.at, ringIntent(ctx, RING_REQUEST, ring.alarmIds, prayerAts, ring.at))
    }

    /** Rings the same alarms again in the snooze length from now. */
    fun scheduleSnooze(ctx: Context, ids: List<String>, prayerAts: LongArray) {
        val minutes = PrayerAlarmConfig.settings(ctx).snoozeMinutes
        val at = System.currentTimeMillis() + minutes * 60_000L
        arm(ctx, at, ringIntent(ctx, SNOOZE_REQUEST, ids, prayerAts, at))
    }

    fun cancelAll(ctx: Context) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(cancelIntent(ctx, RING_REQUEST))
        am.cancel(cancelIntent(ctx, SNOOZE_REQUEST))
    }
}
