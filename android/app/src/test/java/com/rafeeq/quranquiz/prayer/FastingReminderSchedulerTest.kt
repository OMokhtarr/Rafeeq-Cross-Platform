package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZonedDateTime
import java.time.chrono.HijrahDate
import java.util.Date
import java.util.TimeZone

class FastingReminderSchedulerTest {

    private val tz = TimeZone.getTimeZone("Africa/Cairo")

    private fun at(date: LocalDate, hour: Int, minute: Int = 0): Date =
        Date.from(ZonedDateTime.of(date.atTime(hour, minute), tz.toZoneId()).toInstant())

    private fun isha(at: Date) = DayTimes(mapOf(PrayerName.ISHA to at))

    // 2026-12-07 is a plain Monday (no White Day that week); its eve is Sunday the 6th.
    private val monday = LocalDate.of(2026, 12, 7)
    private val sunday = monday.minusDays(1)

    @Test
    fun `fires half an hour after Isha on the eve`() {
        assertEquals(
            at(sunday, 19, 0),
            FastingReminderScheduler.slotFor(monday, tz, isha(at(sunday, 18, 30))),
        )
    }

    @Test
    fun `falls back to 21_00 without prayer times`() {
        assertEquals(at(sunday, 21), FastingReminderScheduler.slotFor(monday, tz, null))
    }

    @Test
    fun `falls back to 21_00 when Isha plus half an hour reaches midnight`() {
        assertEquals(
            at(sunday, 21),
            FastingReminderScheduler.slotFor(monday, tz, isha(at(sunday, 23, 40))),
        )
    }

    @Test
    fun `the next reminder is for the next fasting day whose eve is still ahead`() {
        // Monday 21:30: Monday's eve has passed, Tuesday is ordinary, Thursday is next.
        val next = FastingReminderScheduler.findNext(at(monday, 21, 30), tz) { null }
        assertEquals(FastingReminder(FastingOccasion.THURSDAY, monday.plusDays(3), at(monday.plusDays(2), 21)), next)
    }

    @Test
    fun `from mid-Ramadan the next reminder is the six of Shawwal on Eid evening`() {
        val midRamadan = LocalDate.from(HijrahDate.of(1448, 9, 15))
        val eid = LocalDate.from(HijrahDate.of(1448, 10, 1))
        val next = FastingReminderScheduler.findNext(at(midRamadan, 12), tz) { null }
        assertEquals(FastingReminder(FastingOccasion.SHAWWAL, eid.plusDays(1), at(eid, 21)), next)
    }

    @Test
    fun `prayer times are read for the eve of the fasting day`() {
        val asked = mutableListOf<LocalDate>()
        FastingReminderScheduler.findNext(at(monday, 21, 30), tz) { asked += it; null }
        assertEquals(listOf(monday.plusDays(2)), asked)
    }

    @Test
    fun `a reminder on time is not late`() {
        val slot = at(sunday, 21).time
        assertFalse(FastingReminderScheduler.isTooLate(slot + 60_000, slot, monday, tz))
    }

    @Test
    fun `a reminder more than three hours late is dropped`() {
        val slot = at(sunday, 19).time
        assertTrue(FastingReminderScheduler.isTooLate(at(sunday, 22, 1).time, slot, monday, tz))
    }

    @Test
    fun `a reminder delivered after midnight is dropped`() {
        val slot = at(sunday, 22).time
        assertTrue(FastingReminderScheduler.isTooLate(at(monday, 0, 5).time, slot, monday, tz))
    }
}
