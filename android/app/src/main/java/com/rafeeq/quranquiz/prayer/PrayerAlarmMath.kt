package com.rafeeq.quranquiz.prayer

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.chrono.HijrahDate
import java.time.temporal.ChronoField

/**
 * The next time one or more alarms ring. [prayerAt] maps each alarm id to the
 * prayer time it was measured from, so the ringing screen can name it.
 */
data class AlarmRing(
    val at: Long,
    val alarmIds: List<String>,
    val prayerAt: Map<String, Long>,
)

/**
 * When prayer alarms ring. Pure: prayer times arrive through [timesOn], so the
 * whole calculation runs on the JVM in unit tests.
 */
object PrayerAlarmMath {

    /** Far enough that a Ramadan-only alarm always reaches the next Ramadan. */
    const val HORIZON_DAYS = 400

    private const val RAMADAN = 9
    private const val MINUTE_MS = 60_000L

    /**
     * Whether [date] is a fasting day, by the tabular Umm al-Qura calendar the
     * rest of the app shows. [shiftDays] = +1 means Ramadan starts a day
     * later than calculated, so the calendar is read for the day before.
     */
    fun isRamadan(date: LocalDate, shiftDays: Int): Boolean =
        runCatching {
            HijrahDate.from(date.minusDays(shiftDays.toLong())).get(ChronoField.MONTH_OF_YEAR) == RAMADAN
        }.getOrDefault(false)

    /** Whether [alarm] is meant to ring for the prayer on [date]. */
    fun applies(alarm: PrayerAlarm, date: LocalDate, shiftDays: Int): Boolean =
        alarm.enabled &&
            date.dayOfWeek in alarm.days &&
            (!alarm.ramadanOnly || isRamadan(date, shiftDays))

    /**
     * The next (ringAt, prayerAt) of [alarm] strictly after [now], or null.
     *
     * The walk starts the day *before* today: an "Isha +3:00" from yesterday
     * can still be due after midnight, and the alarm's day is always the
     * prayer's day, never the ring's. Weekday and Ramadan are checked before
     * any prayer time is computed, which keeps a distant Ramadan-only alarm
     * cheap. A day whose prayer time does not exist (midnight sun) is
     * skipped, never invented.
     */
    fun nextOccurrence(
        alarm: PrayerAlarm,
        now: Long,
        zone: ZoneId,
        shiftDays: Int,
        timesOn: (LocalDate) -> DayTimes?,
    ): Pair<Long, Long>? {
        if (!alarm.enabled) return null
        val start = Instant.ofEpochMilli(now).atZone(zone).toLocalDate().minusDays(1)
        for (i in 0..HORIZON_DAYS) {
            val date = start.plusDays(i.toLong())
            if (!applies(alarm, date, shiftDays)) continue
            val prayerAt = timesOn(date)?.times?.get(alarm.prayer)?.time ?: continue
            val ringAt = prayerAt + alarm.offsetMinutes * MINUTE_MS
            if (ringAt > now) return ringAt to prayerAt
        }
        return null
    }

    /**
     * The soonest ring across [alarms]. Alarms due in the same minute ring
     * together, as one ring carrying all their ids.
     */
    fun nextRing(
        alarms: List<PrayerAlarm>,
        now: Long,
        zone: ZoneId,
        shiftDays: Int,
        timesOn: (LocalDate) -> DayTimes?,
    ): AlarmRing? {
        // Several alarms usually share a prayer, so each day is computed once.
        val cache = HashMap<LocalDate, DayTimes?>()
        val cachedTimes: (LocalDate) -> DayTimes? = { d -> cache.getOrPut(d) { timesOn(d) } }

        val upcoming = alarms.mapNotNull { a ->
            nextOccurrence(a, now, zone, shiftDays, cachedTimes)?.let { a.id to it }
        }
        val earliest = upcoming.minOfOrNull { it.second.first } ?: return null
        val minute = earliest / MINUTE_MS
        val due = upcoming.filter { it.second.first / MINUTE_MS == minute }
        return AlarmRing(
            at = earliest,
            alarmIds = due.map { it.first },
            prayerAt = due.associate { it.first to it.second.second },
        )
    }
}
