package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Covers the part of the widget provider that is plain data/logic rather than
 * Android UI calls: selectForDisplay, which decides which times become cards
 * in the swipeable deck and in what order the user swipes through them.
 *
 * The render path itself needs Context and RemoteViews and cannot be unit
 * tested, but this ordering is pure and Context-free, so it is exercised
 * directly here.
 *
 * Since the widget became a 4x1 strip with a deck, there is no truncation to
 * test: a deck holds a card per visible time, where the old layout had six
 * fixed slots and had to cut. The priority order survives that change because
 * it is still the *display* order — a supplementary time must not sort ahead
 * of an obligatory prayer, which is the invariant the last test pins.
 */
class PrayerWidgetProviderTest {

    private val allNames = PrayerName.values().toSet()

    @Test
    fun `default visible set shows the six expected names in order`() {
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = PrayerConfig.DEFAULT_VISIBLE_TIMES,
            withTime = allNames,
        )
        assertEquals(
            listOf(
                PrayerName.FAJR,
                PrayerName.SUNRISE,
                PrayerName.DHUHR,
                PrayerName.ASR,
                PrayerName.MAGHRIB,
                PrayerName.ISHA,
            ),
            result,
        )
    }

    @Test
    fun `enabling duha adds a card without dropping isha`() {
        // Regression test for the original bug, kept across the deck rewrite:
        // an enum-order filter over six physical slots dropped ISHA once Duha
        // was added. A deck cannot truncate, so nothing is displaced now.
        //
        // The expected order was itself corrected later: this used to assert
        // Duha last, which was the four-slot era's priority ordering leaking
        // into a list that is now simply read top to bottom. Duha falls just
        // after sunrise and belongs there.
        val visible = PrayerConfig.DEFAULT_VISIBLE_TIMES + "duha"
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = visible,
            withTime = allNames,
        )
        assertTrue("Isha must never be dropped", PrayerName.ISHA in result)
        assertEquals(
            listOf(
                PrayerName.FAJR,
                PrayerName.SUNRISE,
                PrayerName.DUHA,
                PrayerName.DHUHR,
                PrayerName.ASR,
                PrayerName.MAGHRIB,
                PrayerName.ISHA,
            ),
            result,
        )
    }

    @Test
    fun `every visible time becomes a card with no truncation`() {
        // The behavioural difference the 4x1 deck introduced: all nine names
        // visible used to resolve to six (the physical slot count). A deck has
        // no slot count, so all nine are cards.
        val visible = allNames.map { it.name.lowercase() }.toSet()
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = visible,
            withTime = allNames,
        )
        assertEquals(allNames.size, result.size)
        assertEquals(allNames, result.toSet())
    }

    @Test
    fun `hiding sunrise removes only its card`() {
        val visible = (PrayerConfig.DEFAULT_VISIBLE_TIMES - "sunrise") + "duha"
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = visible,
            withTime = allNames,
        )
        assertEquals(
            listOf(
                PrayerName.FAJR,
                PrayerName.DUHA,
                PrayerName.DHUHR,
                PrayerName.ASR,
                PrayerName.MAGHRIB,
                PrayerName.ISHA,
            ),
            result,
        )
    }

    @Test
    fun `fewer visible entries returns exactly those in order`() {
        val visible = setOf("fajr", "maghrib")
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = visible,
            withTime = allNames,
        )
        assertEquals(listOf(PrayerName.FAJR, PrayerName.MAGHRIB), result)
    }

    @Test
    fun `a visible name with no time is excluded`() {
        // adhan-java can return a null time (midnight-sun window); such a name
        // must never become a card, because a card is a name with a countdown
        // and there is nothing to count to.
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = PrayerConfig.DEFAULT_VISIBLE_TIMES,
            withTime = allNames - PrayerName.ISHA,
        )
        assertTrue(PrayerName.ISHA !in result)
        assertEquals(
            listOf(
                PrayerName.FAJR,
                PrayerName.SUNRISE,
                PrayerName.DHUHR,
                PrayerName.ASR,
                PrayerName.MAGHRIB,
            ),
            result,
        )
    }

    /**
     * Replaces an older test that asserted no supplementary time could
     * outrank an obligatory prayer. That invariant belonged to the widget's
     * four-slot era, when the list decided which times to *drop*; nothing
     * truncates any more, so the list is read as display order and the only
     * correct order is the one the times occur in.
     *
     * Duha is the case that was wrong: it falls shortly after sunrise but was
     * rendered after Isha, because it is absent from DAILY_TIMETABLE and
     * everything absent from that list was appended to the tail.
     */
    @Test
    fun `slot order is chronological through the day`() {
        assertEquals(
            listOf(
                PrayerName.FAJR,
                PrayerName.SUNRISE,
                PrayerName.DUHA,
                PrayerName.DHUHR,
                PrayerName.ASR,
                PrayerName.MAGHRIB,
                PrayerName.ISHA,
                PrayerName.MIDNIGHT,
                PrayerName.LAST_THIRD,
            ),
            PrayerWidgetProvider.SLOT_PRIORITY,
        )
    }

    /** The specific regression: Duha between sunrise and Dhuhr, never last. */
    @Test
    fun `duha is displayed straight after sunrise`() {
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = setOf("fajr", "sunrise", "duha", "dhuhr", "isha"),
            withTime = PrayerName.values().toSet(),
        )
        assertEquals(
            listOf(
                PrayerName.FAJR,
                PrayerName.SUNRISE,
                PrayerName.DUHA,
                PrayerName.DHUHR,
                PrayerName.ISHA,
            ),
            result,
        )
    }

    /** The strip's date line shares its row with both arrows and the card;
     *  the Hijri year was what pushed it into an ellipsis. */
    @Test
    fun `the strip's hijri label has no year`() {
        val tz = java.util.TimeZone.getTimeZone("UTC")
        val date = java.util.Date(1_758_542_400_000L) // 2025-09-22
        val short = PrayerWidgetProvider.hijriLabel(date, tz, withYear = false)
        val full = PrayerWidgetProvider.hijriLabel(date, tz)
        // The full label ends in a four-digit year; the short one is exactly
        // the full one with that last word removed.
        assertTrue(full.substringAfterLast(' ').matches(Regex("[0-9]{4}")))
        assertEquals(full.substringBeforeLast(' '), short)
    }
}
