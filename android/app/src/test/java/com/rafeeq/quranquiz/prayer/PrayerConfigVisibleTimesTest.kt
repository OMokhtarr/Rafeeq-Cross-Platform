package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Storage needs a Context a JVM test cannot build, so what is asserted here is
 * the part with no Android dependency: the defaults, and the rule that the
 * obligatory prayers can never be hidden.
 */
class PrayerConfigVisibleTimesTest {

    @Test
    fun `the five obligatory prayers are exactly the ones that cannot be hidden`() {
        assertEquals(
            setOf("fajr", "dhuhr", "asr", "maghrib", "isha"),
            PrayerConfig.OBLIGATORY_TIMES,
        )
    }

    @Test
    fun `sunrise is not obligatory but is visible by default`() {
        // It is displayed with the prayers but is not one, so it may be hidden.
        assertFalse(PrayerConfig.OBLIGATORY_TIMES.contains("sunrise"))
        assertTrue(PrayerConfig.DEFAULT_VISIBLE_TIMES.contains("sunrise"))
    }

    @Test
    fun `the supplementary times are hidden by default`() {
        // Matches what the page showed before this preference existed, so an
        // existing user sees no change until they opt in.
        listOf("duha", "midnight", "last_third").forEach {
            assertFalse("$it must be hidden by default", PrayerConfig.DEFAULT_VISIBLE_TIMES.contains(it))
        }
    }

    @Test
    fun `the default visible set contains every obligatory prayer`() {
        assertTrue(PrayerConfig.DEFAULT_VISIBLE_TIMES.containsAll(PrayerConfig.OBLIGATORY_TIMES))
    }

    @Test
    fun `sanitising a set restores any missing obligatory prayer`() {
        // The guarantee the UI relies on: even a stored set that somehow omits
        // Fajr comes back with it, so no code path can hide an obligatory time.
        val sanitised = PrayerConfig.sanitiseVisibleTimes(setOf("duha"))

        assertTrue(sanitised.containsAll(PrayerConfig.OBLIGATORY_TIMES))
        assertTrue("an explicit choice is kept", sanitised.contains("duha"))
    }

    @Test
    fun `sanitising drops names that are not real times`() {
        val sanitised = PrayerConfig.sanitiseVisibleTimes(setOf("fajr", "not_a_time"))

        assertFalse(sanitised.contains("not_a_time"))
    }

    @Test
    fun `every default visible name is a real prayer name`() {
        val known = PrayerName.values().map { it.name.lowercase() }.toSet()
        assertTrue(known.containsAll(PrayerConfig.DEFAULT_VISIBLE_TIMES))
    }
}
