package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Covers the two pieces of the widget provider that are plain data/logic
 * rather than Android UI calls:
 *
 *  - the table pairing each fixed slot to its name/time view ids
 *  - selectForDisplay, the pure ranking function the render path delegates
 *    to for deciding which names fill those slots
 *
 * The render path itself needs Context and RemoteViews and cannot be unit
 * tested, but the selection logic it depends on is pure and Context-free, so
 * it is exercised directly here. This is also the regression test for the
 * bug where enabling Duha (declared ahead of four obligatory prayers in
 * PrayerName's enum order) silently dropped Isha from the widget: with no
 * priority behind the plain enum-order filter+take, a supplementary time
 * could displace an obligatory one instead of only filling spare capacity.
 */
class PrayerWidgetProviderTest {

    private val allNames = PrayerName.values().toSet()

    @Test
    fun `the widget has six slots`() {
        // Fixed geometry: the layout declares six name/time pairs, and the
        // visible set is truncated to fit rather than the layout growing.
        assertEquals(6, PrayerWidgetProvider.VIEW_IDS.size)
    }

    @Test
    fun `no view id is reused across slots`() {
        // A duplicated id would make two slots overwrite each other — the exact
        // copy-paste error this table invites.
        val ids = PrayerWidgetProvider.VIEW_IDS.flatMap { listOf(it.first, it.second) }
        assertEquals(ids.size, ids.toSet().size)
    }

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
    fun `enabling duha does not drop isha`() {
        // Regression test for the reported bug: PrayerName#values() puts DUHA
        // ahead of DHUHR, ASR, MAGHRIB and ISHA, so a plain enum-order
        // filter+take(6) pushed ISHA out of the visible six once Duha was
        // added to an already-full default set. All nine names are visible
        // and have times here — with priority ranking, the six slots must
        // still be exactly the five obligatory prayers plus sunrise, and
        // Isha in particular must survive.
        val visible = PrayerConfig.DEFAULT_VISIBLE_TIMES + "duha"
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = visible,
            withTime = allNames,
        )
        assertTrue("Isha must never be displaced by a supplementary time", PrayerName.ISHA in result)
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
    fun `hiding sunrise frees the slot duha then fills`() {
        // The spec's own framing: hiding a non-obligatory time frees exactly
        // one slot, and a supplementary time may fill it — never displace an
        // obligatory prayer to get in.
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
    fun `fewer visible entries than slots returns exactly those with no padding`() {
        val visible = setOf("fajr", "maghrib")
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = visible,
            withTime = allNames,
        )
        assertEquals(listOf(PrayerName.FAJR, PrayerName.MAGHRIB), result)
    }

    @Test
    fun `a visible name with no time today is excluded`() {
        // adhan-java can return a null time (midnight-sun window); such a
        // name must never occupy a slot even if it is in the visible set.
        val result = PrayerWidgetProvider.selectForDisplay(
            visible = PrayerConfig.DEFAULT_VISIBLE_TIMES,
            withTime = allNames - PrayerName.ISHA,
        )
        assertTrue(PrayerName.ISHA !in result)
        assertEquals(
            listOf(PrayerName.FAJR, PrayerName.SUNRISE, PrayerName.DHUHR, PrayerName.ASR, PrayerName.MAGHRIB),
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
