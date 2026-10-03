package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
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

    @Test
    fun `Arabic lines use Arabic-Indic digits`() {
        assertEquals("الفجر − ١:٣٠ · السحور", AlarmText.ringLine("الفجر", -90, "السحور", arabic = true))
    }
}
