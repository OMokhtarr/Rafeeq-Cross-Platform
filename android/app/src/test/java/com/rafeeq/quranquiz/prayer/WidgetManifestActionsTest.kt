package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * Every broadcast the widget sends itself must be declared in the manifest.
 *
 * A manifest-declared receiver is only started for the actions its
 * intent-filter names. The arrows' PendingIntents carry [ACTION_STEP] and the
 * auto-revert timer carries [ACTION_REVERT]; with neither declared, both were
 * delivered only while the process happened to be alive for some other
 * reason. That is exactly the shape of the reported bug — the arrows worked
 * with the app open and did nothing once it was closed — and it is invisible
 * in testing unless the app is force-stopped first.
 *
 * Reading the manifest as text keeps this a plain JVM test. The point is not
 * to parse Android's build output but to catch the constant and the manifest
 * drifting apart, since the action string is written out in full in both
 * places and nothing else ties them together.
 */
class WidgetManifestActionsTest {

    private val manifest = File("src/main/AndroidManifest.xml")

    private val text: String by lazy {
        assertTrue("missing AndroidManifest.xml", manifest.isFile)
        manifest.readText()
    }

    private fun assertDeclared(action: String) {
        assertTrue(
            "AndroidManifest.xml does not declare <action android:name=\"$action\" />, " +
                "so the receiver is not woken for it when the app is closed",
            text.contains("""<action android:name="$action" />"""),
        )
    }

    @Test
    fun `the arrow step broadcast is declared`() {
        assertDeclared(PrayerWidgetProvider.ACTION_STEP)
    }

    @Test
    fun `the auto-revert broadcast is declared`() {
        assertDeclared(PrayerWidgetProvider.ACTION_REVERT)
    }

    /** The widget is useless without its own update action, and losing it
     *  while editing the filter above is an easy mistake to make. */
    @Test
    fun `the widget update broadcast is still declared`() {
        assertDeclared("android.appwidget.action.APPWIDGET_UPDATE")
    }

    /**
     * A widget provider the system cannot reach never appears in the
     * launcher's picker, so the widget can only be added from inside the app.
     * All three were or would have been `exported="false"`; this pins the fix.
     */
    @Test
    fun `every widget provider is exported`() {
        listOf(
            ".prayer.PrayerWidgetProvider",
            ".prayer.PrayerTimetableVerticalWidget",
            ".prayer.PrayerTimetableWideWidget",
        ).forEach { name ->
            val receiver = receiverBlock(name)
            assertTrue(
                "$name must be exported or it will not appear in the widget picker",
                receiver.contains("android:exported=\"true\""),
            )
        }
    }

    /** Without a label the picker falls back to the app name, listing three
     *  indistinguishable entries. */
    @Test
    fun `every widget provider is labelled`() {
        listOf(
            ".prayer.PrayerWidgetProvider",
            ".prayer.PrayerTimetableVerticalWidget",
            ".prayer.PrayerTimetableWideWidget",
        ).forEach { name ->
            assertTrue(
                "$name needs an android:label for the widget picker",
                receiverBlock(name).contains("android:label="),
            )
        }
    }

    /** The receiver declaration for [name], up to the end of its tag. */
    private fun receiverBlock(name: String): String {
        val start = text.indexOf("android:name=\"$name\"")
        assertTrue("no receiver declared for $name", start >= 0)
        val end = text.indexOf("</receiver>", start)
        assertTrue("unterminated receiver for $name", end > start)
        return text.substring(start, end)
    }
}
