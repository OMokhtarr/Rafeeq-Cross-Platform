package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZonedDateTime
import java.util.Date
import java.util.TimeZone

class HifzStreakReminderSchedulerTest {

    private val tz = TimeZone.getTimeZone("Africa/Cairo")
    private val day = LocalDate.of(2026, 12, 7)

    private fun at(date: LocalDate, hour: Int, minute: Int = 0): Date =
        Date.from(ZonedDateTime.of(date.atTime(hour, minute), tz.toZoneId()).toInstant())

    private val ninePm = 21 * 60

    @Test
    fun `time later today fires today`() {
        assertEquals(at(day, 21), HifzStreakReminderScheduler.nextAt(at(day, 18), tz, ninePm))
    }

    @Test
    fun `time already passed today goes to tomorrow`() {
        assertEquals(
            at(day.plusDays(1), 21),
            HifzStreakReminderScheduler.nextAt(at(day, 22), tz, ninePm),
        )
    }

    @Test
    fun `exactly now goes to tomorrow`() {
        assertEquals(
            at(day.plusDays(1), 21),
            HifzStreakReminderScheduler.nextAt(at(day, 21), tz, ninePm),
        )
    }

    @Test
    fun `minutes are honoured`() {
        assertEquals(
            at(day, 7, 45),
            HifzStreakReminderScheduler.nextAt(at(day, 6), tz, 7 * 60 + 45),
        )
    }

    @Test
    fun `late delivery is dropped`() {
        val slot = at(day, 21).time
        val twoHours = 2 * 60 * 60_000L
        assertTrue(HifzStreakReminderScheduler.isLate(slot + twoHours + 1, slot))
        assertFalse(HifzStreakReminderScheduler.isLate(slot + twoHours, slot))
        assertFalse(HifzStreakReminderScheduler.isLate(slot + 10 * twoHours, 0L))
    }
}
