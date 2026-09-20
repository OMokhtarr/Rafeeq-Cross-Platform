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
        // Regression test for the reported bug, kept across the deck rewrite:
        // PrayerName#values() puts DUHA ahead of DHUHR, ASR, MAGHRIB and ISHA,
        // so an enum-order filter dropped ISHA out of the visible six once Duha
        // was added. A deck cannot truncate, so nothing can be displaced now —
        // but Duha must still sort after the obligatory prayers, not into the
        // middle of them.
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
                PrayerName.DHUHR,
                PrayerName.ASR,
                PrayerName.MAGHRIB,
                PrayerName.ISHA,
                PrayerName.DUHA,
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
                PrayerName.DHUHR,
                PrayerName.ASR,
                PrayerName.MAGHRIB,
                PrayerName.ISHA,
                PrayerName.DUHA,
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

    @Test
    fun `slot priority never lets a supplementary time outrank an obligatory prayer`() {
        val obligatory = PrayerConfig.OBLIGATORY_TIMES.map { PrayerName.valueOf(it.uppercase()) }.toSet()
        val supplementary = setOf(PrayerName.DUHA, PrayerName.MIDNIGHT, PrayerName.LAST_THIRD)
        val worstObligatoryRank = PrayerWidgetProvider.SLOT_PRIORITY
            .withIndex()
            .filter { (_, name) -> name in obligatory }
            .maxOf { (index, _) -> index }
        val bestSupplementaryRank = PrayerWidgetProvider.SLOT_PRIORITY
            .withIndex()
            .filter { (_, name) -> name in supplementary }
            .minOf { (index, _) -> index }
        assertTrue(worstObligatoryRank < bestSupplementaryRank)
    }
}
