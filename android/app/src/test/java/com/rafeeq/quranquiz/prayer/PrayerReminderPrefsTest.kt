package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PrayerReminderPrefsTest {

    @Test
    fun `the five prayers are reminder-enabled by default`() {
        assertEquals(
            setOf("fajr", "dhuhr", "asr", "maghrib", "isha"),
            PrayerConfig.DEFAULT_ENABLED_PRAYERS,
        )
    }

    @Test
    fun `sunrise is never reminder-enabled`() {
        // Sunrise is displayed with the prayers but is not one.
        assertFalse(PrayerConfig.DEFAULT_ENABLED_PRAYERS.contains("sunrise"))
    }

    @Test
    fun `every enabled prayer names a real prayer`() {
        val known = PrayerName.values().map { it.name.lowercase() }.toSet()
        assertTrue(known.containsAll(PrayerConfig.DEFAULT_ENABLED_PRAYERS))
    }
}
