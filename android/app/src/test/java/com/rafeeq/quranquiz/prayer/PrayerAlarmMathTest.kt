package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId
import java.time.chrono.HijrahDate
import java.util.Date

class PrayerAlarmMathTest {

    private val zone = ZoneId.of("Africa/Cairo")
    private val everyDay = DayOfWeek.values().toSet()

    private fun ms(y: Int, mo: Int, d: Int, h: Int, mi: Int = 0): Long =
        LocalDateTime.of(y, mo, d, h, mi).atZone(zone).toInstant().toEpochMilli()

    /** Fixed times every day: Fajr 04:30, Isha at [ishaHour]:00. */
    private fun fixedTimes(ishaHour: Int = 19): (LocalDate) -> DayTimes? = { date ->
        DayTimes(
            mapOf(
                PrayerName.FAJR to Date(ms(date.year, date.monthValue, date.dayOfMonth, 4, 30)),
                PrayerName.ISHA to Date(ms(date.year, date.monthValue, date.dayOfMonth, ishaHour)),
            ),
        )
    }

    private fun alarm(
        id: String = "a",
        prayer: PrayerName = PrayerName.FAJR,
        offset: Int = 0,
        enabled: Boolean = true,
        days: Set<DayOfWeek> = everyDay,
        ramadanOnly: Boolean = false,
    ) = PrayerAlarm(id, prayer, offset, "", enabled, days, ramadanOnly)

    private fun next(a: PrayerAlarm, now: Long, times: (LocalDate) -> DayTimes? = fixedTimes(), shift: Int = 0) =
        PrayerAlarmMath.nextOccurrence(a, now, zone, shift, times)

    // 2026-10-05 is a Monday.

    @Test
    fun `an alarm before Fajr rings that morning`() {
        val r = next(alarm(offset = -90), now = ms(2026, 10, 5, 1))
        assertEquals(ms(2026, 10, 5, 3), r?.first)
        assertEquals(ms(2026, 10, 5, 4, 30), r?.second)
    }

    @Test
    fun `once today's ring has passed it rolls to tomorrow`() {
        val r = next(alarm(offset = -90), now = ms(2026, 10, 5, 3, 30))
        assertEquals(ms(2026, 10, 6, 3), r?.first)
    }

    @Test
    fun `an alarm after Isha that crosses midnight keeps the Isha's weekday`() {
        // Monday-only Isha +3:00 with Isha at 22:00 rings Tuesday 01:00.
        val a = alarm(prayer = PrayerName.ISHA, offset = 180, days = setOf(DayOfWeek.MONDAY))
        val r = next(a, now = ms(2026, 10, 5, 12), times = fixedTimes(ishaHour = 22))
        assertEquals(ms(2026, 10, 6, 1), r?.first)
    }

    @Test
    fun `just after midnight it still finds last night's late Isha alarm`() {
        val a = alarm(prayer = PrayerName.ISHA, offset = 180, days = setOf(DayOfWeek.MONDAY))
        val r = next(a, now = ms(2026, 10, 6, 0, 30), times = fixedTimes(ishaHour = 22))
        assertEquals(ms(2026, 10, 6, 1), r?.first)
    }

    @Test
    fun `days not chosen are skipped`() {
        val a = alarm(days = setOf(DayOfWeek.THURSDAY))
        val r = next(a, now = ms(2026, 10, 5, 12))
        assertEquals(ms(2026, 10, 8, 4, 30), r?.first)
    }

    @Test
    fun `a day without the prayer time is skipped rather than invented`() {
        val missingTuesday: (LocalDate) -> DayTimes? = { d ->
            if (d == LocalDate.of(2026, 10, 6)) DayTimes(mapOf(PrayerName.FAJR to null)) else fixedTimes()(d)
        }
        val r = next(alarm(), now = ms(2026, 10, 5, 12), times = missingTuesday)
        assertEquals(ms(2026, 10, 7, 4, 30), r?.first)
    }

    @Test
    fun `a disabled alarm never rings`() {
        assertNull(next(alarm(enabled = false), now = ms(2026, 10, 5, 1)))
    }

    @Test
    fun `no alarms means nothing to ring`() {
        assertNull(PrayerAlarmMath.nextRing(emptyList(), ms(2026, 10, 5, 1), zone, 0, fixedTimes()))
    }

    @Test
    fun `the soonest alarm across the list rings next`() {
        val ring = PrayerAlarmMath.nextRing(
            listOf(alarm(id = "late", offset = 15), alarm(id = "early", offset = -30)),
            ms(2026, 10, 5, 1), zone, 0, fixedTimes(),
        )
        assertEquals(ms(2026, 10, 5, 4), ring?.at)
        assertEquals(listOf("early"), ring?.alarmIds)
    }

    @Test
    fun `alarms due in the same minute ring together`() {
        val ring = PrayerAlarmMath.nextRing(
            listOf(alarm(id = "x", offset = -30), alarm(id = "y", offset = -30), alarm(id = "z", offset = 10)),
            ms(2026, 10, 5, 1), zone, 0, fixedTimes(),
        )
        assertEquals(listOf("x", "y"), ring?.alarmIds?.sorted())
        assertEquals(ms(2026, 10, 5, 4, 30), ring?.prayerAt?.get("x"))
    }

    private val firstOfRamadan: LocalDate = LocalDate.from(HijrahDate.of(1448, 9, 1))

    @Test
    fun `the first of Ramadan is in Ramadan and the day before is not`() {
        assertTrue(PrayerAlarmMath.isRamadan(firstOfRamadan, 0))
        assertFalse(PrayerAlarmMath.isRamadan(firstOfRamadan.minusDays(1), 0))
    }

    @Test
    fun `starting Ramadan a day later moves its first day`() {
        assertFalse(PrayerAlarmMath.isRamadan(firstOfRamadan, 1))
        assertTrue(PrayerAlarmMath.isRamadan(firstOfRamadan.plusDays(1), 1))
    }

    @Test
    fun `starting Ramadan a day earlier moves its first day`() {
        assertTrue(PrayerAlarmMath.isRamadan(firstOfRamadan.minusDays(1), -1))
    }

    @Test
    fun `a Ramadan-only alarm waits for the next Ramadan`() {
        val now = firstOfRamadan.minusDays(200).atStartOfDay(zone).toInstant().toEpochMilli()
        val r = next(alarm(ramadanOnly = true), now)
        assertNotNull(r)
        val ringDate = java.time.Instant.ofEpochMilli(r!!.first).atZone(zone).toLocalDate()
        assertEquals(firstOfRamadan, ringDate)
    }
}
