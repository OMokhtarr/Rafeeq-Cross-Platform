package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate
import java.time.ZonedDateTime
import java.util.TimeZone

class FastingReminderReceiverTest {

    private val tz = TimeZone.getTimeZone("Africa/Cairo")
    private val monday = LocalDate.of(2026, 12, 7)
    private val slot = ZonedDateTime.of(monday.minusDays(1).atTime(21, 0), tz.toZoneId()).toInstant().toEpochMilli()
    private val onTime = slot + 60_000

    private fun post(
        occasion: String? = "MONDAY",
        date: String? = monday.toString(),
        at: Long = slot,
        now: Long = onTime,
    ) = FastingReminderReceiver.reminderToPost(occasion, date, at, now, tz)

    @Test
    fun `an on-time reminder posts its occasion`() {
        assertEquals(FastingOccasion.MONDAY, post())
    }

    @Test
    fun `a missing or unknown occasion posts nothing`() {
        assertNull(post(occasion = null))
        assertNull(post(occasion = "FRIDAY"))
    }

    @Test
    fun `a missing or malformed date posts nothing`() {
        assertNull(post(date = null))
        assertNull(post(date = "7/12/2026"))
    }

    @Test
    fun `a missing slot time counts as stale`() {
        assertNull(post(at = 0L))
    }

    @Test
    fun `a stale reminder posts nothing`() {
        assertNull(post(now = slot + 4 * 60 * 60_000L))
    }

    @Test
    fun `Ramadan never posts, having no reminder title`() {
        assertNull(FastingReminderReceiver.titleFor(FastingOccasion.RAMADAN))
        assertNull(post(occasion = "RAMADAN"))
    }
}
