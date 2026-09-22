package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The day and night variants of each widget layout must declare exactly the
 * same view ids.
 *
 * `RemoteViews` sets views by id against whichever variant the system
 * inflated, so an id present in one file and not the other is not a styling
 * bug — it throws in the launcher process, and the launcher's usual response
 * is to drop the widget from the home screen. The comments at the top of all
 * four files state the rule; this asserts it, because the rule is enforced
 * nowhere else and the files are edited separately.
 *
 * Reading the XML as text (rather than inflating it) keeps this a plain JVM
 * test: the ids are all that matter, and they are visible in the source.
 */
class WidgetLayoutParityTest {

    private val resDir = File("src/main/res")

    private val idPattern = Regex("""android:id="@\+?id/([A-Za-z0-9_]+)"""")

    private fun idsIn(relativePath: String): Set<String> {
        val file = File(resDir, relativePath)
        assertTrue("missing layout: $relativePath", file.isFile)
        return idPattern.findAll(file.readText()).map { it.groupValues[1] }.toSet()
    }

    private fun assertParity(layoutName: String) {
        val day = idsIn("layout/$layoutName")
        val night = idsIn("layout-night/$layoutName")
        assertTrue("day layout declares no ids: $layoutName", day.isNotEmpty())
        assertEquals(
            "day and night variants of $layoutName must declare the same view ids",
            day,
            night,
        )
    }

    @Test
    fun `the widget strip layouts agree on ids`() {
        assertParity("widget_prayer_times.xml")
    }

    @Test
    fun `the deck card layouts agree on ids`() {
        assertParity("widget_prayer_card.xml")
    }

    @Test
    fun `the vertical timetable layouts agree on ids`() {
        assertParity("widget_timetable_vertical.xml")
    }

    @Test
    fun `the wide timetable layouts agree on ids`() {
        assertParity("widget_timetable_wide.xml")
    }

    /**
     * Both timetable forms are driven by the same provider code, so they must
     * declare the same ids as each other — not merely each match its own
     * night variant. PrayerTimetableWideWidget reuses the vertical widget's
     * rowIds list outright, which is only safe while this holds.
     */
    @Test
    fun `both timetable forms declare the same ids`() {
        assertEquals(
            "the vertical and wide timetable layouts must declare the same view ids",
            idsIn("layout/widget_timetable_vertical.xml"),
            idsIn("layout/widget_timetable_wide.xml"),
        )
    }

    @Test
    fun `the timetable declares every id the provider sets`() {
        val ids = idsIn("layout/widget_timetable_vertical.xml")
        listOf(
            "tt_root",
            "tt_date",
            "tt_hijri",
            "tt_place",
            "tt_icon_date",
            "tt_icon_place",
            "tt_prompt",
            "tt_rows",
        ).forEach { id ->
            assertTrue("timetable layout is missing $id", id in ids)
        }
        // The six row slots the provider addresses by index. RemoteViews
        // cannot inflate rows at runtime outside a collection view, so every
        // slot the provider names has to exist up front.
        (0 until 6).forEach { i ->
            listOf("tt_row_$i", "tt_label_$i", "tt_time_$i").forEach { id ->
                assertTrue("timetable layout is missing $id", id in ids)
            }
        }
    }

    @Test
    fun `the strip declares every id the provider sets`() {
        // Named rather than derived: these are the ids PrayerWidgetProvider
        // touches in render(). If one is renamed in the layout but not in the
        // provider, the widget crashes on inflation instead of failing here.
        val ids = idsIn("layout/widget_prayer_times.xml")
        listOf(
            "widget_root",
            "widget_date_column",
            "widget_date",
            "widget_place",
            "widget_icon_date",
            "widget_icon_place",
            "widget_timer",
            "widget_prev",
            "widget_next",
            "widget_prompt",
            "widget_deck",
        ).forEach { id ->
            assertTrue("strip layout is missing $id", id in ids)
        }
    }

    @Test
    fun `the card declares every id the deck factory sets`() {
        val ids = idsIn("layout/widget_prayer_card.xml")
        // No countdown id: the timer lives on the strip, not on the card.
        listOf("card_root", "card_name", "card_time").forEach { id ->
            assertTrue("card layout is missing $id", id in ids)
        }
    }

    @Test
    fun `the config screen's include carries no id of its own`() {
        // Regression test for a launch crash. An android:id on <include>
        // *replaces* the root id of the included layout rather than wrapping
        // it, so an id here would delete widget_root from the inflated
        // hierarchy — and PrayerWidgetConfigActivity's
        // findViewById(R.id.widget_root) would return null, throwing an NPE
        // inside onCreate before the screen ever appeared.
        val config = File(resDir, "layout/widget_prayer_config.xml")
        assertTrue("missing layout: widget_prayer_config.xml", config.isFile)

        val includes = Regex("<include[^>]*>").findAll(config.readText()).map { it.value }.toList()
        assertTrue("config screen should include the widget layout", includes.isNotEmpty())
        includes.forEach { tag ->
            assertFalse(
                "an id on <include> replaces widget_root and breaks the preview: $tag",
                tag.contains("android:id"),
            )
        }
    }
}
