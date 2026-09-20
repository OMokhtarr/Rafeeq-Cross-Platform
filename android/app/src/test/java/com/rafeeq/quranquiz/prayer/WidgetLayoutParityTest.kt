package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
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
    fun `the strip declares every id the provider sets`() {
        // Named rather than derived: these are the ids PrayerWidgetProvider
        // touches in render(). If one is renamed in the layout but not in the
        // provider, the widget crashes on inflation instead of failing here.
        val ids = idsIn("layout/widget_prayer_times.xml")
        listOf(
            "widget_root",
            "widget_date_column",
            "widget_date",
            "widget_hijri",
            "widget_prompt",
            "widget_deck",
        ).forEach { id ->
            assertTrue("strip layout is missing $id", id in ids)
        }
    }

    @Test
    fun `the card declares every id the deck factory sets`() {
        val ids = idsIn("layout/widget_prayer_card.xml")
        listOf("card_root", "card_name", "card_time", "card_countdown").forEach { id ->
            assertTrue("card layout is missing $id", id in ids)
        }
    }
}
