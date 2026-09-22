package com.rafeeq.quranquiz.prayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The two pieces of widget configuration that are arithmetic rather than
 * storage: wrapping the card index, and folding a transparency percentage
 * into a colour's alpha.
 *
 * Both are pure and Context-free, which is why they live outside the
 * SharedPreferences accessors — the accessors need a device, these do not,
 * and these are where the bugs would be.
 *
 * android.graphics.Color is a stub under plain unit tests (returnDefaultValues
 * is on, so every method returns 0). Both functions under test therefore do
 * their own bit arithmetic rather than calling Color — which is what makes
 * them reachable from here at all.
 */
class PrayerWidgetConfigTest {

    // ── fitting text to the card ──────────────────────────

    /** Every label the deck can show must render at the chosen size. The
     *  two longest are the abbreviated "م. الليل" (8) and "ث. الاخير" (9) —
     *  they are abbreviated in strings.xml precisely so they fit. If a future
     *  label pushes past the threshold this is the test that says so. */
    @Test
    fun `the longest prayer names keep the chosen font size`() {
        assertEquals(14, PrayerWidgetConfig.fitFontSp(14, "م. الليل"))
        assertEquals(14, PrayerWidgetConfig.fitFontSp(14, "ث. الاخير"))
    }

    /** Clock strings are the other thing on the card; none of them, in either
     *  format, should ever trigger a shrink. */
    @Test
    fun `clock strings keep the chosen font size`() {
        assertEquals(16, PrayerWidgetConfig.fitFontSp(16, "12:47 PM"))
        assertEquals(16, PrayerWidgetConfig.fitFontSp(16, "16:45"))
    }

    @Test
    fun `text past the threshold is scaled down in proportion`() {
        // 26 characters against a 13 threshold: twice too wide, so half size.
        assertEquals(10, PrayerWidgetConfig.fitFontSp(20, "x".repeat(26)))
    }

    @Test
    fun `shrinking never goes below the minimum font size`() {
        val tiny = PrayerWidgetConfig.fitFontSp(14, "x".repeat(400))
        assertEquals(PrayerWidgetConfig.MIN_FONT_SP, tiny)
    }

    /** Scales down only. Enlarging a short name would override the user's
     *  chosen size rather than rescue an overflow. */
    @Test
    fun `short text is never scaled up`() {
        assertEquals(12, PrayerWidgetConfig.fitFontSp(12, "الفجر"))
    }

    // ── index wrapping ─────────────────────────────────────────────────

    @Test
    fun `stepping forward from the last card returns to the first`() {
        // The timetable is a cycle: at Isha, "next" is tomorrow's Fajr, so the
        // arrow must wrap rather than dead-end.
        assertEquals(0, PrayerWidgetConfig.wrap(6, 6))
    }

    @Test
    fun `stepping back from the first card returns to the last`() {
        // The case a plain `%` gets wrong: Kotlin keeps the sign of the
        // dividend, so -1 % 6 is -1 and the launcher would be handed a
        // negative position.
        assertEquals(5, PrayerWidgetConfig.wrap(-1, 6))
    }

    @Test
    fun `an index inside the deck is left alone`() {
        assertEquals(3, PrayerWidgetConfig.wrap(3, 6))
    }

    @Test
    fun `wrapping survives several turns in either direction`() {
        assertEquals(1, PrayerWidgetConfig.wrap(13, 6))
        assertEquals(5, PrayerWidgetConfig.wrap(-13, 6))
    }

    @Test
    fun `an empty deck wraps to zero rather than dividing by zero`() {
        // Reachable during the midnight-sun window, where every time can be
        // absent and the deck is genuinely empty.
        assertEquals(0, PrayerWidgetConfig.wrap(4, 0))
        assertEquals(0, PrayerWidgetConfig.wrap(-4, 0))
    }

    @Test
    fun `a single-card deck always lands on that card`() {
        assertEquals(0, PrayerWidgetConfig.wrap(1, 1))
        assertEquals(0, PrayerWidgetConfig.wrap(-1, 1))
    }

    // ── transparency ───────────────────────────────────────────────────

    private fun alphaOf(argb: Int) = (argb ushr 24) and 0xFF
    private val opaqueRed = 0xFFFF0000.toInt()

    @Test
    fun `zero transparency leaves the colour opaque`() {
        assertEquals(255, alphaOf(PrayerWidgetConfig.withTransparency(opaqueRed, 0)))
    }

    @Test
    fun `full transparency clears the alpha entirely`() {
        // The headline case: a fully transparent background is the reason this
        // setting exists, so 100 must be a real value and never treated as
        // "unset" and quietly ignored.
        assertEquals(0, alphaOf(PrayerWidgetConfig.withTransparency(opaqueRed, 100)))
    }

    @Test
    fun `half transparency lands near half alpha`() {
        val alpha = alphaOf(PrayerWidgetConfig.withTransparency(opaqueRed, 50))
        assertTrue("expected ~127, got $alpha", alpha in 125..130)
    }

    @Test
    fun `the colour channels survive the alpha change`() {
        // Only the alpha may move: a transparency slider that also shifted the
        // hue would be indistinguishable from a broken colour picker.
        val result = PrayerWidgetConfig.withTransparency(opaqueRed, 60)
        assertEquals(opaqueRed and 0x00FFFFFF, result and 0x00FFFFFF)
    }

    @Test
    fun `out of range transparency is clamped rather than wrapping`() {
        assertEquals(255, alphaOf(PrayerWidgetConfig.withTransparency(opaqueRed, -20)))
        assertEquals(0, alphaOf(PrayerWidgetConfig.withTransparency(opaqueRed, 180)))
    }

    // ── contrast ───────────────────────────────────────────────────────

    @Test
    fun `dark accents take white text`() {
        assertEquals(0xFFFFFFFF.toInt(), PrayerWidgetConfig.contrastOn(0xFF1A1A1A.toInt()))
    }

    @Test
    fun `light accents take black text`() {
        assertEquals(0xFF000000.toInt(), PrayerWidgetConfig.contrastOn(0xFFFFFFFF.toInt()))
    }

    @Test
    fun `the default gold accent takes black text`() {
        // The shipped default: white on this gold is barely legible, which is
        // the case that motivated computing contrast at all.
        assertEquals(
            0xFF000000.toInt(),
            PrayerWidgetConfig.contrastOn(PrayerWidgetConfig.DEFAULT_ACCENT),
        )
    }

    @Test
    fun `luminance is weighted rather than a flat channel average`() {
        // Pure blue and pure green have the same flat average but are far
        // apart in perceived brightness; a mean would call both the same.
        assertEquals(0xFFFFFFFF.toInt(), PrayerWidgetConfig.contrastOn(0xFF0000FF.toInt()))
        assertEquals(0xFF000000.toInt(), PrayerWidgetConfig.contrastOn(0xFF00FF00.toInt()))
    }

    // ── font bounds ────────────────────────────────────────────────────

    @Test
    fun `the font range is ordered and contains the default`() {
        // A 4x1 strip stops fitting its own content outside these bounds, and
        // the config screen maps its SeekBar onto exactly this range.
        assertTrue(PrayerWidgetConfig.MIN_FONT_SP < PrayerWidgetConfig.MAX_FONT_SP)
        assertTrue(PrayerWidgetConfig.DEFAULT_FONT_SP >= PrayerWidgetConfig.MIN_FONT_SP)
        assertTrue(PrayerWidgetConfig.DEFAULT_FONT_SP <= PrayerWidgetConfig.MAX_FONT_SP)
    }
}
