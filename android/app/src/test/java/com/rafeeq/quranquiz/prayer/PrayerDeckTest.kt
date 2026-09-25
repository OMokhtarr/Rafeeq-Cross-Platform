package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Covers the deck's arithmetic: what each card's timer shows, and which card
 * the deck opens on.
 *
 * Both are pure functions over their arguments, deliberately split out of
 * PrayerDeckFactory (which needs a bound service and a launcher) so the part
 * that can actually be wrong is reachable from a JVM test.
 *
 * The timer is the thing most worth pinning. A Chronometer cannot render a
 * negative delta — handed one it climbs from a meaningless number — so
 * `timerFor` must always return a positive value plus the direction to read
 * it in, never a signed difference.
 */
class PrayerDeckTest {

    private val minute = 60_000L
    private val hour = 60 * minute

    /** An arbitrary fixed "now"; only the deltas below matter. */
    private val now = Date(1_758_400_000_000L)

    private fun at(offsetMillis: Long) = Date(now.time + offsetMillis)

    private fun day(vararg entries: Pair<PrayerName, Date?>) = DayTimes(entries.toMap())

    // ── counting down ──────────────────────────────────────────────────

    @Test
    fun `a time still ahead today counts down to today`() {
        val today = day(PrayerName.ASR to at(3 * hour))
        val tomorrow = day(PrayerName.ASR to at(27 * hour))

        val timer = PrayerDeck.timerFor(PrayerName.ASR, now, today, tomorrow)

        assertEquals(3 * hour, timer!!.millis)
        assertFalse(timer.toIqama)
    }

    @Test
    fun `a time past its window counts down to tomorrow`() {
        // Five hours after Fajr is well outside its 25-minute window, so the
        // card has rolled over to tomorrow's occurrence.
        val today = day(PrayerName.FAJR to at(-5 * hour))
        val tomorrow = day(PrayerName.FAJR to at(19 * hour))

        val timer = PrayerDeck.timerFor(PrayerName.FAJR, now, today, tomorrow)

        assertEquals(19 * hour, timer!!.millis)
        assertFalse(timer.toIqama)
    }

    @Test
    fun `a countdown is never negative`() {
        val today = day(PrayerName.MAGHRIB to at(-3 * hour))
        val tomorrow = day(PrayerName.MAGHRIB to at(21 * hour))

        val timer = PrayerDeck.timerFor(PrayerName.MAGHRIB, now, today, tomorrow)

        assertTrue("timer must be positive", timer!!.millis > 0)
    }

    // ── counting down to the iqama ─────────────────────────────────────

    @Test
    fun `a prayer just called counts down to its iqama`() {
        // Eight minutes after Dhuhr's adhan, twelve remain of its twenty.
        val today = day(PrayerName.DHUHR to at(-8 * minute))
        val tomorrow = day(PrayerName.DHUHR to at(16 * hour))

        val timer = PrayerDeck.timerFor(PrayerName.DHUHR, now, today, tomorrow)

        assertEquals(12 * minute, timer!!.millis)
        assertTrue(timer.toIqama)
    }

    @Test
    fun `at the adhan the whole iqama gap remains`() {
        val today = day(PrayerName.ASR to now)
        val tomorrow = day(PrayerName.ASR to at(24 * hour))

        val timer = PrayerDeck.timerFor(PrayerName.ASR, now, today, tomorrow)

        assertEquals(20 * minute, timer!!.millis)
        assertTrue(timer.toIqama)
    }

    @Test
    fun `maghrib's window is ten minutes`() {
        assertEquals(10 * minute, PrayerDeck.elapsedWindowMillis(PrayerName.MAGHRIB))
    }

    @Test
    fun `fajr gets twenty-five minutes`() {
        assertEquals(25 * minute, PrayerDeck.elapsedWindowMillis(PrayerName.FAJR))
    }

    @Test
    fun `dhuhr asr and isha get twenty minutes`() {
        listOf(PrayerName.DHUHR, PrayerName.ASR, PrayerName.ISHA).forEach { name ->
            assertEquals("window for $name", 20 * minute, PrayerDeck.elapsedWindowMillis(name))
        }
    }

    @Test
    fun `times without an iqama have no window`() {
        listOf(
            PrayerName.SUNRISE,
            PrayerName.DUHA,
            PrayerName.MIDNIGHT,
            PrayerName.LAST_THIRD,
        ).forEach { name ->
            assertEquals("window for $name", 0L, PrayerDeck.elapsedWindowMillis(name))
        }
    }

    @Test
    fun `maghrib stops awaiting its iqama after ten minutes`() {
        // Just inside, then just outside: the closed end of the window is
        // where an off-by-one would hide.
        val inside = day(PrayerName.MAGHRIB to at(-9 * minute))
        val outside = day(PrayerName.MAGHRIB to at(-11 * minute))
        val tomorrow = day(PrayerName.MAGHRIB to at(21 * hour))

        assertTrue(PrayerDeck.timerFor(PrayerName.MAGHRIB, now, inside, tomorrow)!!.toIqama)
        assertFalse(PrayerDeck.timerFor(PrayerName.MAGHRIB, now, outside, tomorrow)!!.toIqama)
    }

    @Test
    fun `fajr still awaits its iqama where maghrib would have stopped`() {
        // The windows genuinely differ: 15 minutes past is inside Fajr's 25
        // but outside Maghrib's 10.
        val today = day(
            PrayerName.FAJR to at(-15 * minute),
            PrayerName.MAGHRIB to at(-15 * minute),
        )
        val tomorrow = day(
            PrayerName.FAJR to at(9 * hour),
            PrayerName.MAGHRIB to at(21 * hour),
        )

        assertTrue(PrayerDeck.timerFor(PrayerName.FAJR, now, today, tomorrow)!!.toIqama)
        assertFalse(PrayerDeck.timerFor(PrayerName.MAGHRIB, now, today, tomorrow)!!.toIqama)
    }

    // ── absent times ───────────────────────────────────────────────────

    @Test
    fun `a name with no time on either day has no timer`() {
        // Midnight-sun window: there is nothing to count to or from, and the
        // caller drops the card rather than inventing a target.
        val today = day(PrayerName.ISHA to null)
        val tomorrow = day(PrayerName.ISHA to null)

        assertNull(PrayerDeck.timerFor(PrayerName.ISHA, now, today, tomorrow))
    }

    @Test
    fun `a name missing today but present tomorrow still counts down`() {
        val today = day()
        val tomorrow = day(PrayerName.ISHA to at(20 * hour))

        val timer = PrayerDeck.timerFor(PrayerName.ISHA, now, today, tomorrow)

        assertEquals(20 * hour, timer!!.millis)
        assertFalse(timer.toIqama)
    }

    // ── refresh boundaries ────────────────────────────────────────────

    /** The reported bug: with reminders off, nothing re-rendered the widget
     *  when Maghrib arrived, and its countdown ran through zero into negative
     *  numbers. The prayer's own time must be a boundary. */
    @Test
    fun `the next boundary is the upcoming prayer's time`() {
        val today = day(PrayerName.MAGHRIB to at(90 * minute), PrayerName.ISHA to at(3 * hour))
        assertEquals(at(90 * minute), PrayerDeck.nextBoundary(now, today, day()))
    }

    /** Between adhan and iqama the card counts to the iqama; the widget must
     *  re-render when that window closes, or it runs past zero. */
    @Test
    fun `inside an elapsed window the boundary is the window's end`() {
        val maghrib = at(-2 * minute)
        val today = day(PrayerName.MAGHRIB to maghrib, PrayerName.ISHA to at(3 * hour))
        assertEquals(
            Date(maghrib.time + PrayerDeck.elapsedWindowMillis(PrayerName.MAGHRIB)),
            PrayerDeck.nextBoundary(now, today, day()),
        )
    }

    @Test
    fun `after the last time today the boundary comes from tomorrow`() {
        val today = day(PrayerName.ISHA to at(-5 * hour))
        val tomorrow = day(PrayerName.FAJR to at(6 * hour))
        assertEquals(at(6 * hour), PrayerDeck.nextBoundary(now, today, tomorrow))
    }

    /** A boundary exactly at now has already happened; re-arming for it would
     *  spin the alarm chain on the same instant. */
    @Test
    fun `a boundary exactly now is not returned`() {
        val today = day(PrayerName.ASR to now, PrayerName.MAGHRIB to at(hour))
        val next = PrayerDeck.nextBoundary(now, today, day())!!
        assertTrue(next.after(now))
    }

    /** adhan-java returns null inside the midnight-sun window; those names
     *  contribute nothing rather than crashing the scheduler. */
    @Test
    fun `null times are skipped and an empty day yields no boundary`() {
        assertNull(PrayerDeck.nextBoundary(now, day(PrayerName.ISHA to null), day()))
    }

    // ── clock format ───────────────────────────────────────────────────

    @Test
    fun `the 12-hour pattern has no am-pm marker`() {
        val fmt = SimpleDateFormat(PrayerDeck.clockPattern(use24Hour = false), Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        // 16:45 UTC — unambiguous in either clock, so the assertion is about
        // the format rather than the hour.
        assertEquals("4:45", fmt.format(Date(1_758_386_700_000L)))
    }

    @Test
    fun `the 24-hour pattern is zero-padded and has no marker`() {
        val fmt = SimpleDateFormat(PrayerDeck.clockPattern(use24Hour = true), Locale.US)
        fmt.timeZone = TimeZone.getTimeZone("UTC")
        assertEquals("16:45", fmt.format(Date(1_758_386_700_000L)))
    }

    /** The default is the product decision most likely to be undone by
     *  accident, so it is pinned rather than left to the config object. */
    @Test
    fun `the widget clock defaults to 12-hour`() {
        assertFalse(PrayerConfig.DEFAULT_USE_24_HOUR)
    }

    // ── which card opens ───────────────────────────────────────────────

    private fun card(name: PrayerName, millisUntil: Long = hour, toIqama: Boolean = false) =
        PrayerDeck.Card(
            name = name,
            label = name.name,
            clock = "00:00",
            millisUntil = millisUntil,
            toIqama = toIqama,
        )

    @Test
    fun `the deck opens on the soonest card`() {
        val cards = listOf(
            card(PrayerName.FAJR, millisUntil = 20 * hour),
            card(PrayerName.DHUHR, millisUntil = 5 * hour),
            card(PrayerName.ASR, millisUntil = 2 * hour),
        )

        assertEquals(2, PrayerDeck.initialIndex(cards))
    }

    @Test
    fun `after isha a chosen last third comes before fajr`() {
        // The reported bug: the deck skipped straight to tomorrow's Fajr.
        val cards = listOf(
            card(PrayerName.FAJR, millisUntil = 6 * hour),
            card(PrayerName.ISHA, millisUntil = 22 * hour),
            card(PrayerName.LAST_THIRD, millisUntil = 3 * hour),
        )

        assertEquals(2, PrayerDeck.initialIndex(cards))
    }

    @Test
    fun `a prayer awaiting its iqama outranks the soonest card`() {
        val cards = listOf(
            card(PrayerName.FAJR, millisUntil = 10 * hour),
            card(PrayerName.MAGHRIB, millisUntil = 5 * minute, toIqama = true),
            card(PrayerName.ISHA, millisUntil = 2 * minute),
        )

        assertEquals(1, PrayerDeck.initialIndex(cards))
    }

    @Test
    fun `an empty deck opens at zero`() {
        assertEquals(0, PrayerDeck.initialIndex(emptyList()))
    }
}
