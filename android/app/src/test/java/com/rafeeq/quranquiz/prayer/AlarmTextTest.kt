package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlarmTextTest {

    @Test
    fun `offsets read as hours and minutes`() {
        assertEquals("1:30", AlarmText.formatOffset(-90))
        assertEquals("0:15", AlarmText.formatOffset(15))
        assertEquals("3:00", AlarmText.formatOffset(180))
    }

    @Test
    fun `a line names the prayer, the signed offset and the label`() {
        assertEquals("Fajr − 1:30 · Suhoor", AlarmText.ringLine("Fajr", -90, "Suhoor", arabic = false))
        assertEquals("Fajr + 0:15", AlarmText.ringLine("Fajr", 15, "", arabic = false))
    }

    @Test
    fun `an alarm at the prayer time shows the prayer alone`() {
        assertEquals("Isha", AlarmText.ringLine("Isha", 0, "", arabic = false))
    }

    private val cairo = java.time.ZoneId.of("Africa/Cairo")
    private fun at(day: Int, hour: Int) =
        java.time.LocalDateTime.of(2026, 10, day, hour, 0).atZone(cairo).toInstant().toEpochMilli()

    // 2026-10-09 is a Friday.

    @Test
    fun `Dhuhr on a Friday is Jumu'ah`() {
        assertEquals(true, AlarmText.isJumuah(PrayerName.DHUHR, at(9, 12), cairo))
    }

    @Test
    fun `Dhuhr on another day is not Jumu'ah`() {
        assertEquals(false, AlarmText.isJumuah(PrayerName.DHUHR, at(8, 12), cairo))
    }

    @Test
    fun `other prayers on a Friday keep their names`() {
        assertEquals(false, AlarmText.isJumuah(PrayerName.ASR, at(9, 15), cairo))
    }

    @Test
    fun `Arabic lines use Arabic-Indic digits`() {
        assertEquals("الفجر − ١:٣٠ · السحور", AlarmText.ringLine("الفجر", -90, "السحور", arabic = true))
    }
}

class PrayerAlarmRingModeTest {

    private val now = 10_000_000L

    @Test
    fun `an exact alarm on time rings from the service`() {
        assertEquals(RingMode.SERVICE, PrayerAlarmRingReceiver.ringMode(listOf("a"), now - 1_000, now, exactAllowed = true))
    }

    @Test
    fun `without exact alarms it rings as a notification and never starts the service`() {
        // The service's systemExempted type needs the exact-alarm permission
        // on Android 14+; starting it anyway crashes the app when it stops
        // without reaching the foreground.
        assertEquals(RingMode.NOTIFICATION, PrayerAlarmRingReceiver.ringMode(listOf("a"), now, now, exactAllowed = false))
    }

    @Test
    fun `an alarm delivered over half an hour late stays silent`() {
        val late = now - PrayerAlarmRingReceiver.MAX_LATENESS_MS - 1
        assertEquals(RingMode.STALE, PrayerAlarmRingReceiver.ringMode(listOf("a"), late, now, exactAllowed = true))
    }

    @Test
    fun `a ring whose alarms were all deleted or switched off stays silent`() {
        assertEquals(RingMode.SILENT, PrayerAlarmRingReceiver.ringMode(emptyList(), now, now, exactAllowed = true))
    }
}

class MissedAlarmNotificationIdTest {

    @Test
    fun `each alarm has its own missed notification`() {
        assertNotEquals(AlarmRingService.missedNotificationId("suhoor-id"), AlarmRingService.missedNotificationId("fajr-wake-id"))
    }

    @Test
    fun `missing the same alarm again replaces its own notification`() {
        assertEquals(AlarmRingService.missedNotificationId("suhoor-id"), AlarmRingService.missedNotificationId("suhoor-id"))
    }

    @Test
    fun `missed notifications never take the ids of the app's other notifications`() {
        val ids = listOf("a", "b", "suhoor-id", "f47ac10b-58cc-4372-a567-0e02b2c3d479").map { AlarmRingService.missedNotificationId(it) }
        assertTrue(ids.none { it in 4200..4299 })
    }
}
