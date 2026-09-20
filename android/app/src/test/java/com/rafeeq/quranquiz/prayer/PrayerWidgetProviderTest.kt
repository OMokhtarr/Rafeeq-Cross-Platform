package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Covers the one piece of the widget provider that is plain data rather than
 * Android UI calls: the pairing of each [PrayerName] to its name/time view
 * ids. A mismatch here — a missing prayer, or two prayers sharing a view id —
 * is exactly the class of bug the task brief calls out as the most likely way
 * to break the widget (an id present in one layout config but not the other,
 * or set twice and overwritten). No Context or RemoteViews involved, so this
 * runs as a plain JVM test.
 */
class PrayerWidgetProviderTest {

    @Test
    fun `the widget shows the daily timetable, one entry each, in order`() {
        val names = PrayerWidgetProvider.VIEW_IDS.map { it.first }
        // Deliberately the six-entry timetable rather than PrayerName.values():
        // the supplementary times (Duha, Midnight, Last third) are page-only,
        // and a widget slot for them would not fit.
        assertEquals(PrayerTimesEngine.DAILY_TIMETABLE, names)
    }

    @Test
    fun `no two entries share a name or time view id`() {
        val nameIds = PrayerWidgetProvider.VIEW_IDS.map { it.second }
        val timeIds = PrayerWidgetProvider.VIEW_IDS.map { it.third }
        assertEquals("duplicate name-view id", nameIds.size, nameIds.toSet().size)
        assertEquals("duplicate time-view id", timeIds.size, timeIds.toSet().size)
        // A name id and a time id are never expected to collide either —
        // setting one would silently clobber what was meant for the other.
        assertTrue((nameIds + timeIds).toSet().size == nameIds.size + timeIds.size)
    }
}
