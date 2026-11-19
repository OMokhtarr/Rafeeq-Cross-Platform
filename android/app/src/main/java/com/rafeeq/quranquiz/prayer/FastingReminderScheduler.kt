package com.rafeeq.quranquiz.prayer

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import java.time.LocalDate
import java.time.ZonedDateTime
import java.util.Date
import java.util.TimeZone

/** The reminder for fasting on [fastDate], shown at [at] on the evening before. */
data class FastingReminder(val occasion: FastingOccasion, val fastDate: LocalDate, val at: Date)

/**
 * Arms the single pending Sunnah-fasting reminder, the evening before each
 * fasting day ([FastingCalendar.reminderFor]) so there is time to plan suhoor
 * and make the intention.
 *
 * Same self-re-arming chain as [AzkarReminderScheduler]: one alarm pending at
 * a time, and FastingReminderReceiver calls [scheduleNext] when it fires.
 * Its own request code keeps it from replacing the other reminders.
 *
 * No location is needed: with one stored the reminder follows Isha, without
 * one it falls back to a fixed evening hour.
 */
object FastingReminderScheduler {

    private const val REQUEST_CODE = 4400
    const val EXTRA_OCCASION = "fasting_occasion"
    const val EXTRA_AT = "fasting_at"
    const val EXTRA_DATE = "fasting_date"

    /** Long enough for Isha itself to be prayed before the reminder. */
    internal const val AFTER_ISHA_MINUTES = 30L
    internal const val FALLBACK_HOUR = 21

    /** Past the ~30 reminder-free days of Ramadan (plus Eid), with margin. */
    private const val LOOKAHEAD_DAYS = 40L

    /** A reminder held this long — by Doze, or a dead phone — is stale. */
    private const val MAX_LATENESS_MS = 3 * 60 * 60_000L

    private fun startOf(date: LocalDate, tz: TimeZone): Date =
        Date.from(date.atStartOfDay(tz.toZoneId()).toInstant())

    /** Midday on [date]: a safe instant for "the prayer times of that day". */
    internal fun noonOf(date: LocalDate, tz: TimeZone): Date =
        Date.from(ZonedDateTime.of(date.atTime(12, 0), tz.toZoneId()).toInstant())

    /**
     * When to remind about fasting on [fastDate]: Isha + 30 min on the eve
     * when [eveBefore] has Isha, otherwise 21:00 on the eve. An Isha so late
     * that the reminder would land on the fasting day itself (high latitudes
     * in summer) falls back too: "tomorrow" must still mean the fasting day.
     */
    internal fun slotFor(fastDate: LocalDate, tz: TimeZone, eveBefore: DayTimes?): Date {
        val midnight = startOf(fastDate, tz)
        val afterIsha = eveBefore?.times?.get(PrayerName.ISHA)
            ?.let { Date(it.time + AFTER_ISHA_MINUTES * 60_000L) }
        if (afterIsha != null && afterIsha.before(midnight)) return afterIsha
        val eve = fastDate.minusDays(1)
        return Date.from(ZonedDateTime.of(eve.atTime(FALLBACK_HOUR, 0), tz.toZoneId()).toInstant())
    }

    /**
     * The earliest reminder strictly after [now]. The calendar is checked
     * before [prayersOn] is asked for the eve's times, so a long gap (Ramadan)
     * costs no prayer-time calculations. Kept free of Context for unit tests.
     */
    internal fun findNext(now: Date, tz: TimeZone, prayersOn: (LocalDate) -> DayTimes?): FastingReminder? {
        val today = now.toInstant().atZone(tz.toZoneId()).toLocalDate()
        // From tomorrow: today's eve was yesterday, so its slot has passed.
        for (offset in 1..LOOKAHEAD_DAYS) {
            val fastDate = today.plusDays(offset)
            val occasion = FastingCalendar.reminderFor(fastDate) ?: continue
            val at = slotFor(fastDate, tz, prayersOn(fastDate.minusDays(1)))
            if (at.after(now)) return FastingReminder(occasion, fastDate, at)
        }
        return null
    }

    /**
     * Whether a reminder due at [at] for [fastDate] is too stale to post at
     * [now]: hours late, or already on the fasting day, where "tomorrow is…"
     * would be wrong.
     */
    internal fun isTooLate(now: Long, at: Long, fastDate: LocalDate, tz: TimeZone): Boolean =
        now - at > MAX_LATENESS_MS || now >= startOf(fastDate, tz).time

    private fun pendingIntent(ctx: Context, reminder: FastingReminder? = null): PendingIntent {
        val intent = Intent(ctx, FastingReminderReceiver::class.java).apply {
            reminder?.let {
                putExtra(EXTRA_OCCASION, it.occasion.name)
                putExtra(EXTRA_AT, it.at.time)
                putExtra(EXTRA_DATE, it.fastDate.toString())
            }
        }
        return PendingIntent.getBroadcast(
            ctx,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    /** Arms the next reminder; no-ops when fasting reminders are off. */
    fun scheduleNext(ctx: Context) {
        if (!PrayerConfig.fastingRemindersEnabled(ctx)) return
        val tz = TimeZone.getDefault()
        val coords = PrayerConfig.coords(ctx)
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)

        val next = findNext(Date(), tz) { eve ->
            coords?.let { (lat, lng) ->
                PrayerTimesEngine.timesFor(lat, lng, noonOf(eve, tz), method, madhab, tz)
            }
        } ?: return

        PrayerAlarmScheduler.setAlarm(ctx, next.at.time, pendingIntent(ctx, next))
    }

    /** Cancels the pending fasting reminder, if any. */
    fun cancel(ctx: Context) {
        val alarmManager = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.cancel(pendingIntent(ctx))
    }
}
