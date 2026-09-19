package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import java.util.Date
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

/**
 * Covers PrayerAlarmScheduler.findNextEnabled — the one piece of real
 * branching logic in the scheduler — in isolation from Context/AlarmManager.
 * [lookup] here simulates PrayerTimesEngine.nextAfter by walking a fixed,
 * repeating cycle of prayers one "day" at a time, which is enough to exercise
 * skip-forward behaviour without a real calculation engine.
 */
class PrayerAlarmSchedulerFindNextEnabledTest {

    private val cycle = listOf(
        PrayerName.FAJR,
        PrayerName.DHUHR,
        PrayerName.ASR,
        PrayerName.MAGHRIB,
        PrayerName.ISHA,
    )

    /** A lookup that always returns the next prayer in [cycle] after [start],
     *  one hour later each time, cycling forever — so a caller that never
     *  finds a match would spin without PrayerAlarmScheduler's own cap. */
    private fun cyclingLookup(start: Date): (Date) -> NextPrayer? {
        var index = 0
        return { _ ->
            val prayer = cycle[index % cycle.size]
            val at = Date(start.time + (index + 1) * 3_600_000L)
            index++
            NextPrayer(prayer, at)
        }
    }

    @Test
    fun `an empty enabled set yields nothing, not an infinite loop`() {
        val result = PrayerAlarmScheduler.findNextEnabled(
            start = Date(),
            enabled = emptySet(),
            lookup = cyclingLookup(Date()),
        )
        assertNull(result)
    }

    @Test
    fun `a normal enabled set finds the very next prayer immediately`() {
        val result = PrayerAlarmScheduler.findNextEnabled(
            start = Date(),
            enabled = PrayerConfig.DEFAULT_ENABLED_PRAYERS,
            lookup = cyclingLookup(Date()),
        )
        assertEquals(PrayerName.FAJR, result?.name)
    }

    @Test
    fun `a set that skips the first candidate advances to the next match`() {
        // FAJR is the first candidate the cycling lookup offers; excluding it
        // must skip forward to DHUHR rather than stopping or looping.
        val result = PrayerAlarmScheduler.findNextEnabled(
            start = Date(),
            enabled = setOf("dhuhr", "asr", "maghrib", "isha"),
            lookup = cyclingLookup(Date()),
        )
        assertEquals(PrayerName.DHUHR, result?.name)
    }

    @Test
    fun `a lookup that never matches is bounded by MAX_LOOKUPS, not infinite`() {
        var calls = 0
        val result = PrayerAlarmScheduler.findNextEnabled(
            start = Date(),
            enabled = setOf("this_prayer_does_not_exist"),
            lookup = { at ->
                calls++
                NextPrayer(PrayerName.FAJR, Date(at.time + 3_600_000L))
            },
        )
        assertNull(result)
        assertEquals(PrayerAlarmScheduler.MAX_LOOKUPS, calls)
    }
}
