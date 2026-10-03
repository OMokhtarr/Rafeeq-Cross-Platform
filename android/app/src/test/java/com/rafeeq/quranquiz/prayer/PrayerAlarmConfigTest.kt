package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.DayOfWeek

class PrayerAlarmConfigTest {

    private val suhoor = PrayerAlarm(
        id = "a1",
        prayer = PrayerName.FAJR,
        offsetMinutes = -90,
        label = "Suhoor",
        enabled = true,
        days = setOf(DayOfWeek.MONDAY, DayOfWeek.THURSDAY),
        ramadanOnly = true,
    )

    @Test
    fun `an alarm survives encoding and decoding unchanged`() {
        val decoded = PrayerAlarmConfig.decodeAlarms(PrayerAlarmConfig.encodeAlarms(listOf(suhoor)))
        assertEquals(listOf(suhoor), decoded)
    }

    @Test
    fun `missing or corrupt stored alarms decode to an empty list`() {
        assertEquals(emptyList<PrayerAlarm>(), PrayerAlarmConfig.decodeAlarms(null))
        assertEquals(emptyList<PrayerAlarm>(), PrayerAlarmConfig.decodeAlarms(""))
        assertEquals(emptyList<PrayerAlarm>(), PrayerAlarmConfig.decodeAlarms("not json"))
    }

    @Test
    fun `invalid entries are dropped and valid ones kept`() {
        val json = """[
            {"id":"ok","prayer":"isha","offsetMinutes":10,"label":"","enabled":true,"days":[1,2,3,4,5,6,7],"ramadanOnly":false},
            {"id":"bad","prayer":"sunrise","offsetMinutes":0,"label":"","enabled":true,"days":[1],"ramadanOnly":false},
            {"prayer":"fajr","offsetMinutes":0,"label":"","enabled":true,"days":[1],"ramadanOnly":false},
            "garbage"
        ]"""
        val decoded = PrayerAlarmConfig.decodeAlarms(json)
        assertEquals(listOf("ok"), decoded.map { it.id })
    }

    @Test
    fun `offsets are clamped to three hours either side`() {
        assertEquals(180, PrayerAlarmConfig.sanitise(suhoor.copy(offsetMinutes = 500)).offsetMinutes)
        assertEquals(-180, PrayerAlarmConfig.sanitise(suhoor.copy(offsetMinutes = -500)).offsetMinutes)
    }

    @Test
    fun `an alarm with no days rings every day`() {
        val days = PrayerAlarmConfig.sanitise(suhoor.copy(days = emptySet())).days
        assertEquals(DayOfWeek.values().toSet(), days)
    }

    @Test
    fun `labels are trimmed and capped at forty characters`() {
        val label = PrayerAlarmConfig.sanitise(suhoor.copy(label = "  " + "x".repeat(60) + "  ")).label
        assertEquals("x".repeat(40), label)
    }

    @Test
    fun `settings default when nothing is stored`() {
        assertEquals(
            AlarmSettings(soundUri = null, soundName = null, snoozeMinutes = 10, vibrate = true, ramadanShiftDays = 0),
            PrayerAlarmConfig.decodeSettings(null),
        )
    }

    @Test
    fun `settings survive encoding and decoding unchanged`() {
        val s = AlarmSettings("content://media/1", "Adhan", 5, false, -1)
        assertEquals(s, PrayerAlarmConfig.decodeSettings(PrayerAlarmConfig.encodeSettings(s)))
    }

    @Test
    fun `an unknown snooze length falls back to ten minutes`() {
        val s = PrayerAlarmConfig.decodeSettings("""{"snoozeMinutes":7}""")
        assertEquals(10, s.snoozeMinutes)
    }

    @Test
    fun `the Ramadan shift is limited to one day either way`() {
        assertEquals(1, PrayerAlarmConfig.decodeSettings("""{"ramadanShiftDays":3}""").ramadanShiftDays)
        assertEquals(-1, PrayerAlarmConfig.decodeSettings("""{"ramadanShiftDays":-3}""").ramadanShiftDays)
    }

    @Test
    fun `only the five prayers can carry alarms`() {
        assertTrue(PrayerName.SUNRISE !in PrayerAlarmConfig.ALARM_PRAYERS)
        assertEquals(5, PrayerAlarmConfig.ALARM_PRAYERS.size)
    }
}
