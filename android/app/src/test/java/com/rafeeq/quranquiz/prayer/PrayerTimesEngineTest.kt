package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import kotlin.math.abs

/**
 * Reference values are the published Cairo table for 2026-09-19 under the
 * Egyptian General Authority of Survey method (Fajr 19.5°, Isha 17.5°).
 * A one-minute tolerance is allowed: published tables round, and Cairo's own
 * area spans about a minute of true solar time.
 */
class PrayerTimesEngineTest {

    private val cairoLat = 30.0444
    private val cairoLng = 31.2357
    private val cairoTz: TimeZone = TimeZone.getTimeZone("Africa/Cairo")

    private fun dateOf(y: Int, m: Int, d: Int, tz: TimeZone): Date {
        val cal = Calendar.getInstance(tz)
        cal.clear()
        cal.set(y, m - 1, d, 12, 0, 0)
        return cal.time
    }

    private fun hhmm(date: Date, tz: TimeZone): String {
        val fmt = SimpleDateFormat("HH:mm", Locale.US)
        fmt.timeZone = tz
        return fmt.format(date)
    }

    private fun minutesOf(hhmm: String): Int {
        val (h, m) = hhmm.split(":").map { it.toInt() }
        return h * 60 + m
    }

    private fun assertWithinAMinute(expected: String, actual: String, label: String) {
        val diff = abs(minutesOf(expected) - minutesOf(actual))
        assertTrue(
            "$label: expected about $expected but was $actual",
            diff <= 1,
        )
    }

    @Test
    fun `matches the published Cairo table for the Egyptian method`() {
        val times = PrayerTimesEngine.timesFor(
            lat = cairoLat,
            lng = cairoLng,
            date = dateOf(2026, 9, 19, cairoTz),
            method = "egyptian",
            madhab = "shafi",
            tz = cairoTz,
        )

        assertWithinAMinute("05:15", hhmm(times.times[PrayerName.FAJR]!!, cairoTz), "Fajr")
        assertWithinAMinute("06:41", hhmm(times.times[PrayerName.SUNRISE]!!, cairoTz), "Sunrise")
        assertWithinAMinute("12:50", hhmm(times.times[PrayerName.DHUHR]!!, cairoTz), "Dhuhr")
        assertWithinAMinute("16:18", hhmm(times.times[PrayerName.ASR]!!, cairoTz), "Asr")
        assertWithinAMinute("18:57", hhmm(times.times[PrayerName.MAGHRIB]!!, cairoTz), "Maghrib")
        assertWithinAMinute("20:14", hhmm(times.times[PrayerName.ISHA]!!, cairoTz), "Isha")
    }

    @Test
    fun `hanafi asr falls later than shafi asr`() {
        val date = dateOf(2026, 9, 19, cairoTz)
        val shafi = PrayerTimesEngine.timesFor(
            cairoLat, cairoLng, date, "egyptian", "shafi", cairoTz,
        ).times[PrayerName.ASR]!!
        val hanafi = PrayerTimesEngine.timesFor(
            cairoLat, cairoLng, date, "egyptian", "hanafi", cairoTz,
        ).times[PrayerName.ASR]!!

        assertTrue("Hanafi Asr must be later than Shafi Asr", hanafi.after(shafi))
    }

    @Test
    fun `next prayer after a time before fajr is fajr that morning`() {
        val cal = Calendar.getInstance(cairoTz)
        cal.clear()
        cal.set(2026, 8, 19, 3, 0, 0) // 03:00, before Fajr
        val next = PrayerTimesEngine.nextAfter(
            cal.time, cairoLat, cairoLng, "egyptian", "shafi", cairoTz,
        )

        assertTrue("next prayer must exist at normal latitude", next != null)
        assertEquals(PrayerName.FAJR, next!!.name)
        assertWithinAMinute("05:15", hhmm(next.at, cairoTz), "next Fajr")
    }

    @Test
    fun `next prayer after isha rolls to the following fajr`() {
        val cal = Calendar.getInstance(cairoTz)
        cal.clear()
        cal.set(2026, 8, 19, 22, 0, 0) // 22:00, after Isha
        val next = PrayerTimesEngine.nextAfter(
            cal.time, cairoLat, cairoLng, "egyptian", "shafi", cairoTz,
        )

        assertTrue("next prayer must exist at normal latitude", next != null)
        assertEquals(PrayerName.FAJR, next!!.name)
        assertTrue("Next Fajr must be in the future", next.at.after(cal.time))
    }

    @Test
    fun `sunrise is never reported as the next prayer`() {
        val cal = Calendar.getInstance(cairoTz)
        cal.clear()
        cal.set(2026, 8, 19, 6, 0, 0) // between Fajr and sunrise
        val next = PrayerTimesEngine.nextAfter(
            cal.time, cairoLat, cairoLng, "egyptian", "shafi", cairoTz,
        )

        assertTrue("next prayer must exist at normal latitude", next != null)
        assertEquals(PrayerName.DHUHR, next!!.name)
    }

    @Test
    fun `high latitude midnight sun reports unavailable rather than crashing`() {
        val tromsoTz = TimeZone.getTimeZone("Europe/Oslo")

        // During midnight sun (June 21 at Tromsø), adhan-java cannot compute valid times.
        // The engine must report this cleanly without throwing.
        val midnightSunTimes = PrayerTimesEngine.timesFor(
            lat = 69.6496,
            lng = 18.9560,
            date = dateOf(2026, 6, 21, tromsoTz),
            method = "muslim_world_league",
            madhab = "shafi",
            tz = tromsoTz,
        )
        // Times are null at midnight sun; this is unavailable, not an error
        PrayerName.values().forEach { name ->
            assertTrue(
                "High latitude midnight sun should allow null times without crashing",
                midnightSunTimes.times[name] == null,
            )
        }

        // nextAfter must also handle midnight sun gracefully without NPE
        val midnightSunNow = Calendar.getInstance(tromsoTz)
        midnightSunNow.clear()
        midnightSunNow.set(2026, 5, 21, 12, 0, 0) // June 21, noon
        val nextAtMidnightSun = PrayerTimesEngine.nextAfter(
            midnightSunNow.time, 69.6496, 18.9560, "muslim_world_league", "shafi", tromsoTz,
        )
        assertNull(
            "nextAfter at midnight sun must return null, not throw NPE when times cannot be computed",
            nextAtMidnightSun,
        )

        // Same coordinates on a normal date (spring equinox) should compute all times.
        val normalTimes = PrayerTimesEngine.timesFor(
            lat = 69.6496,
            lng = 18.9560,
            date = dateOf(2026, 3, 15, tromsoTz),
            method = "muslim_world_league",
            madhab = "shafi",
            tz = tromsoTz,
        )
        // All times should be present on a normal date
        PrayerName.values().forEach { name ->
            assertTrue(
                "$name must be present at high latitude on normal dates",
                normalTimes.times[name] != null,
            )
        }

        // nextAfter must work on normal dates at high latitude
        val normalNow = Calendar.getInstance(tromsoTz)
        normalNow.clear()
        normalNow.set(2026, 2, 15, 3, 0, 0) // March 15, 03:00 (before Fajr)
        val nextAtNormal = PrayerTimesEngine.nextAfter(
            normalNow.time, 69.6496, 18.9560, "muslim_world_league", "shafi", tromsoTz,
        )
        assertTrue(
            "nextAfter at normal date/high latitude must return non-null prayer, proving null is specific to midnight sun",
            nextAtNormal != null,
        )
        assertTrue(
            "nextAfter result must be in the future",
            nextAtNormal!!.at.after(normalNow.time),
        )
    }
    @Test
    fun `duha falls a fixed offset after sunrise`() {
        val times = PrayerTimesEngine.timesFor(
            cairoLat, cairoLng, dateOf(2026, 9, 19, cairoTz), "egyptian", "shafi", cairoTz,
        ).times

        val sunrise = times[PrayerName.SUNRISE]!!
        val duha = times[PrayerName.DUHA]!!

        // 24 minutes is the convention the reference timetable states explicitly.
        // There is no single agreed value (other apps use 20), so this test
        // pins ours rather than asserting a universal truth.
        val gapMinutes = (duha.time - sunrise.time) / 60000L
        assertEquals(PrayerTimesEngine.DUHA_AFTER_SUNRISE_MINUTES.toLong(), gapMinutes)
    }

    @Test
    fun `midnight and last third fall between maghrib and the following fajr`() {
        val times = PrayerTimesEngine.timesFor(
            cairoLat, cairoLng, dateOf(2026, 9, 19, cairoTz), "egyptian", "shafi", cairoTz,
        ).times

        val maghrib = times[PrayerName.MAGHRIB]!!
        val midnight = times[PrayerName.MIDNIGHT]!!
        val lastThird = times[PrayerName.LAST_THIRD]!!

        // Both are night-portion divisions, so they sit after sunset and before
        // dawn, and the last third is always the later of the two.
        assertTrue("midnight must follow maghrib", midnight.after(maghrib))
        assertTrue("last third must follow midnight", lastThird.after(midnight))
    }

    @Test
    fun `the additional times are absent when the engine has no times at all`() {
        // Midnight sun: adhan-java returns nothing, so the derived times must
        // be absent too rather than computed from a null sunrise.
        val tromsoTz = TimeZone.getTimeZone("Europe/Oslo")
        val times = PrayerTimesEngine.timesFor(
            69.6496, 18.9560, dateOf(2026, 6, 21, tromsoTz),
            "muslim_world_league", "shafi", tromsoTz,
        ).times

        assertTrue("Duha must be absent", times[PrayerName.DUHA] == null)
        assertTrue("Midnight must be absent", times[PrayerName.MIDNIGHT] == null)
        assertTrue("Last third must be absent", times[PrayerName.LAST_THIRD] == null)
    }

}
