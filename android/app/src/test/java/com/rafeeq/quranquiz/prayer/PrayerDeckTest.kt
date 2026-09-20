package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Date

/**
 * Covers the deck's arithmetic: how long each card counts down for, and which
 * card the deck opens on.
 *
 * Both are pure functions over their arguments, deliberately split out of
 * PrayerDeckFactory (which needs a bound service and a launcher) so the part
 * that can actually be wrong is reachable from a JVM test.
 *
 * The countdown target is the thing most worth pinning: a Chronometer given a
 * base in the past does not stop at zero, it counts upward, so a card for a
 * prayer that already passed today must target tomorrow's occurrence rather
 * than today's.
 */
class PrayerDeckTest {

    private val minute = 60_000L
    private val hour = 60 * minute

    /** An arbitrary fixed "now"; only the deltas below matter. */
    private val now = Date(1_758_400_000_000L)

    private fun at(offsetMillis: Long) = Date(now.time + offsetMillis)

    private fun day(vararg entries: Pair<PrayerName, Date?>) = DayTimes(entries.toMap())

    @Test
    fun `a time still ahead today counts to today`() {
        val today = day(PrayerName.ASR to at(3 * hour))
        val tomorrow = day(PrayerName.ASR to at(27 * hour))

        val result = PrayerDeck.millisUntilNext(PrayerName.ASR, now, today, tomorrow)

        assertEquals(3 * hour, result)
    }

    @Test
    fun `a time already passed today counts to tomorrow`() {
        // The case that makes the countdown meaningful on every card rather
        // than only on the next prayer's.
        val today = day(PrayerName.FAJR to at(-5 * hour))
        val tomorrow = day(PrayerName.FAJR to at(19 * hour))

        val result = PrayerDeck.millisUntilNext(PrayerName.FAJR, now, today, tomorrow)

        assertEquals(19 * hour, result)
    }

    @Test
    fun `a countdown is never negative`() {
        // The invariant behind the previous test, stated directly: whichever
        // branch is taken, a Chronometer must never be handed a past target.
        val today = day(PrayerName.MAGHRIB to at(-minute))
        val tomorrow = day(PrayerName.MAGHRIB to at(23 * hour))

        val result = PrayerDeck.millisUntilNext(PrayerName.MAGHRIB, now, today, tomorrow)

        assertTrue("countdown must be in the future", result != null && result > 0)
    }

    @Test
    fun `a time exactly now counts to tomorrow`() {
        // Boundary: `after(now)` is strict, so a time equal to now has passed.
        // Counting to zero-and-then-upward would be the bug.
        val today = day(PrayerName.DHUHR to now)
        val tomorrow = day(PrayerName.DHUHR to at(24 * hour))

        val result = PrayerDeck.millisUntilNext(PrayerName.DHUHR, now, today, tomorrow)

        assertEquals(24 * hour, result)
    }

    @Test
    fun `a name with no time on either day has no countdown`() {
        // Midnight-sun window: there is nothing to count to, and the caller
        // drops the card rather than inventing a target.
        val today = day(PrayerName.ISHA to null)
        val tomorrow = day(PrayerName.ISHA to null)

        assertNull(PrayerDeck.millisUntilNext(PrayerName.ISHA, now, today, tomorrow))
    }

    @Test
    fun `a name missing today but present tomorrow still counts`() {
        val today = day()
        val tomorrow = day(PrayerName.ISHA to at(20 * hour))

        assertEquals(20 * hour, PrayerDeck.millisUntilNext(PrayerName.ISHA, now, today, tomorrow))
    }

    private fun card(name: PrayerName) =
        PrayerDeck.Card(name = name, label = name.name, clock = "00:00", millisUntil = hour)

    @Test
    fun `the deck opens on the next prayer`() {
        val cards = listOf(
            card(PrayerName.FAJR),
            card(PrayerName.SUNRISE),
            card(PrayerName.DHUHR),
            card(PrayerName.ASR),
        )
        val next = NextPrayer(PrayerName.ASR, at(hour))

        assertEquals(3, PrayerDeck.initialIndex(cards, next))
    }

    @Test
    fun `the deck opens on the first card when there is no next prayer`() {
        // next is null during midnight sun; the deck must still open somewhere.
        val cards = listOf(card(PrayerName.FAJR), card(PrayerName.DHUHR))

        assertEquals(0, PrayerDeck.initialIndex(cards, null))
    }

    @Test
    fun `the deck opens on the first card when the next prayer has no card`() {
        val cards = listOf(card(PrayerName.FAJR), card(PrayerName.DHUHR))
        val next = NextPrayer(PrayerName.MAGHRIB, at(hour))

        assertEquals(0, PrayerDeck.initialIndex(cards, next))
    }

    @Test
    fun `an empty deck has no initial index past zero`() {
        assertEquals(0, PrayerDeck.initialIndex(emptyList(), NextPrayer(PrayerName.FAJR, at(hour))))
    }
}
