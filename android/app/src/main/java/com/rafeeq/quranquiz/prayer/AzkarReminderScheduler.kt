package com.rafeeq.quranquiz.prayer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.util.Calendar
import java.util.Date
import java.util.TimeZone

enum class AzkarSlot { MORNING, EVENING }

data class AzkarAlarm(val slot: AzkarSlot, val at: Date)

/**
 * Arms the single pending azkar-reminder alarm: the morning azkar after Fajr
 * and the evening azkar after Asr.
 *
 * Same self-re-arming chain as [PrayerAlarmScheduler]: one alarm pending at a
 * time, and AzkarReminderReceiver calls [scheduleNext] when it fires. Its own
 * request code keeps it from replacing the prayer alarm, which targets a
 * different receiver anyway.
 *
 * Unlike prayer reminders these do not need a location. With one stored the
 * slots follow the prayers; without one (or in the midnight-sun window, where
 * Fajr or Asr is undefined) they fall back to fixed clock times — a reminder
 * to read the azkar is still useful at an approximate time, where a prayer
 * reminder at an invented time would not be.
 */
object AzkarReminderScheduler {

    private const val REQUEST_CODE = 4300
    const val EXTRA_SLOT = "azkar_slot"
    const val EXTRA_SLOT_AT = "azkar_slot_at"

    /** Long enough for the prayer itself to be done before the reminder. */
    internal const val AFTER_PRAYER_MINUTES = 30L

    internal const val FALLBACK_MORNING_HOUR = 7
    internal const val FALLBACK_EVENING_HOUR = 17

    private fun pendingIntent(ctx: Context, alarm: AzkarAlarm? = null): PendingIntent {
        val intent = Intent(ctx, AzkarReminderReceiver::class.java).apply {
            alarm?.let {
                putExtra(EXTRA_SLOT, it.slot.name)
                putExtra(EXTRA_SLOT_AT, it.at.time)
            }
        }
        return PendingIntent.getBroadcast(
            ctx,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /**
     * Both slots on the day containing [day]: the prayer-derived time when
     * [prayers] has it, otherwise the fixed fallback hour.
     */
    internal fun slotsOn(day: Date, tz: TimeZone, prayers: DayTimes?): List<AzkarAlarm> {
        fun afterPrayer(name: PrayerName): Date? =
            prayers?.times?.get(name)?.let { Date(it.time + AFTER_PRAYER_MINUTES * 60_000L) }

        fun atHour(hour: Int): Date = Calendar.getInstance(tz).apply {
            time = day
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }.time

        return listOf(
            AzkarAlarm(AzkarSlot.MORNING, afterPrayer(PrayerName.FAJR) ?: atHour(FALLBACK_MORNING_HOUR)),
            AzkarAlarm(AzkarSlot.EVENING, afterPrayer(PrayerName.ASR) ?: atHour(FALLBACK_EVENING_HOUR)),
        )
    }

    /**
     * The earliest slot strictly after [now], looking at today and tomorrow.
     * Kept free of Context so it can be unit-tested directly.
     */
    internal fun findNext(now: Date, tz: TimeZone, slotsFor: (Date) -> List<AzkarAlarm>): AzkarAlarm? {
        val tomorrow = Calendar.getInstance(tz).apply {
            time = now
            add(Calendar.DAY_OF_YEAR, 1)
        }.time
        return (slotsFor(now) + slotsFor(tomorrow))
            .filter { it.at.after(now) }
            .minByOrNull { it.at.time }
    }

    /** Arms the next slot; no-ops when azkar reminders are off. */
    fun scheduleNext(ctx: Context) {
        if (!PrayerConfig.azkarRemindersEnabled(ctx)) return
        val tz = TimeZone.getDefault()
        val coords = PrayerConfig.coords(ctx)
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)

        val next = findNext(Date(), tz) { day ->
            val prayers = coords?.let { (lat, lng) ->
                PrayerTimesEngine.timesFor(lat, lng, day, method, madhab, tz)
            }
            slotsOn(day, tz, prayers)
        } ?: return

        PrayerAlarmScheduler.setAlarm(ctx, next.at.time, pendingIntent(ctx, next))
    }

    /** Cancels the pending azkar alarm, if any. */
    fun cancel(ctx: Context) {
        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntent(ctx))
    }
}
