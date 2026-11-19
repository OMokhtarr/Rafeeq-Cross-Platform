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

    // Europe/London springs forward at 01:00 on 2026-03-29 (01:00–02:00 never happens).
    private val london = TimeZone.getTimeZone("Europe/London")
    private val springForward = LocalDate.of(2026, 3, 29)

    private fun inLondon(date: LocalDate, hour: Int, minute: Int = 0): Date =
        Date.from(ZonedDateTime.of(date.atTime(hour, minute), london.toZoneId()).toInstant())

    @Test
    fun `keeps the wall-clock time across a DST change`() {
        assertEquals(
            inLondon(springForward, 21),
            HifzStreakReminderScheduler.nextAt(inLondon(springForward.minusDays(1), 22), london, ninePm),
        )
    }

    @Test
    fun `a time inside the skipped hour moves forward an hour`() {
        assertEquals(
            inLondon(springForward, 2, 30),
            HifzStreakReminderScheduler.nextAt(inLondon(springForward, 0), london, 60 + 30),
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
