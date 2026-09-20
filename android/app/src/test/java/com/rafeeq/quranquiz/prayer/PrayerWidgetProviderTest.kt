package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Covers the one piece of the widget provider that is plain data rather than
 * Android UI calls: the table pairing each fixed slot to its name/time view
 * ids. The slots are generic positions now — which prayer lands in slot *i*
 * follows the user's visible-times preference, computed at render time — so
 * this no longer asserts a mapping onto a fixed timetable. What still matters
 * is the layout's fixed geometry (six slots) and that no view id is reused
 * across slots, which is exactly the class of bug the task brief calls out as
 * the most likely way to break the widget (an id present in one layout config
 * but not the other, or set twice and overwritten). No Context or RemoteViews
 * involved, so this runs as a plain JVM test.
 */
class PrayerWidgetProviderTest {

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
}
