package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Test
import java.util.Calendar
import java.util.Date
import java.util.TimeZone

class AzkarReminderSchedulerTest {

    private val tz = TimeZone.getTimeZone("Africa/Cairo")

    private fun at(day: Int, hour: Int, minute: Int = 0): Date =
        Calendar.getInstance(tz).apply {
            clear()
            set(2026, Calendar.OCTOBER, day, hour, minute)
        }.time

    private fun prayers(fajr: Date?, asr: Date?) =
        DayTimes(mapOf(PrayerName.FAJR to fajr, PrayerName.ASR to asr))

    @Test
    fun `slots follow Fajr and Asr when prayer times are known`() {
        val slots = AzkarReminderScheduler.slotsOn(at(2, 12), tz, prayers(at(2, 4, 30), at(2, 15, 10)))
        assertEquals(
            listOf(
                AzkarAlarm(AzkarSlot.MORNING, at(2, 5, 0)),
                AzkarAlarm(AzkarSlot.EVENING, at(2, 15, 40)),
            ),
            slots,
        )
    }

    @Test
    fun `slots fall back to fixed hours without a location`() {
        val slots = AzkarReminderScheduler.slotsOn(at(2, 12), tz, null)
        assertEquals(
            listOf(
                AzkarAlarm(AzkarSlot.MORNING, at(2, AzkarReminderScheduler.FALLBACK_MORNING_HOUR)),
                AzkarAlarm(AzkarSlot.EVENING, at(2, AzkarReminderScheduler.FALLBACK_EVENING_HOUR)),
            ),
            slots,
        )
    }

    @Test
    fun `an undefined prayer falls back for that slot alone`() {
        val slots = AzkarReminderScheduler.slotsOn(at(2, 12), tz, prayers(null, at(2, 15, 10)))
        assertEquals(at(2, AzkarReminderScheduler.FALLBACK_MORNING_HOUR), slots[0].at)
        assertEquals(at(2, 15, 40), slots[1].at)
    }

    private val fixed: (Date) -> List<AzkarAlarm> = { day -> AzkarReminderScheduler.slotsOn(day, tz, null) }

    @Test
    fun `before the morning slot the morning slot is next`() {
        assertEquals(
            AzkarAlarm(AzkarSlot.MORNING, at(2, 7)),
            AzkarReminderScheduler.findNext(at(2, 3), tz, fixed),
        )
    }

    @Test
    fun `between the slots the evening slot is next`() {
        assertEquals(
            AzkarAlarm(AzkarSlot.EVENING, at(2, 17)),
            AzkarReminderScheduler.findNext(at(2, 7), tz, fixed),
        )
    }

    @Test
    fun `after the evening slot it rolls to tomorrow morning`() {
        assertEquals(
            AzkarAlarm(AzkarSlot.MORNING, at(3, 7)),
            AzkarReminderScheduler.findNext(at(2, 17), tz, fixed),
        )
    }
}

class PrayerAlarmStalenessTest {

    private val prayerAt = 1_000_000_000L

    @Test
    fun `an on-time or slightly deferred reminder is shown`() {
        assertEquals(false, PrayerAlarmReceiver.isStale(prayerAt, prayerAt))
        assertEquals(false, PrayerAlarmReceiver.isStale(prayerAt, prayerAt + PrayerAlarmReceiver.MAX_LATENESS_MS))
    }

    @Test
    fun `a reminder held for hours is dropped`() {
        // The tester's case: Maghrib released at 23:13.
        assertEquals(true, PrayerAlarmReceiver.isStale(prayerAt, prayerAt + 5 * 60 * 60_000L))
    }

    @Test
    fun `an alarm armed before the time was carried is never dropped`() {
        assertEquals(false, PrayerAlarmReceiver.isStale(0L, prayerAt))
    }
}
