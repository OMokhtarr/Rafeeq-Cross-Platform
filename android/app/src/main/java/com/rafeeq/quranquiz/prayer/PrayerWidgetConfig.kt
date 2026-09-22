package com.rafeeq.quranquiz.prayer

import android.content.Context

/**
 * Per-widget state: which prayer a widget is currently showing, and how it
 * looks.
 *
 * Keyed by app-widget id rather than stored once, because two widgets on the
 * same home screen are independent — one may sit on Fajr in dark colours
 * while another shows Maghrib over a transparent background. A single global
 * value would make the arrows on one widget move the other.
 *
 * Lives in the same SharedPreferences file as [PrayerConfig] so the widget
 * and the alarm receiver reach it without a WebView, and so removing the app's
 * data clears everything at once.
 */
object PrayerWidgetConfig {

    /** The app's gold, matching the accent the rest of the UI uses. */
    const val DEFAULT_ACCENT = 0xFFD4B48C.toInt()

    /** Matches the text size the unconfigured layouts declare. */
    const val DEFAULT_FONT_SP = 14

    /** Bounds for the font-size control; outside this a 4x1 strip stops
     *  fitting its own content. */
    const val MIN_FONT_SP = 10
    const val MAX_FONT_SP = 22

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(PrayerConfig.PREFS_NAME, Context.MODE_PRIVATE)

    // ── Which card is showing ──────────────────────────────────────────

    private fun indexKey(widgetId: Int) = "widget_index_$widgetId"

    /** The card this widget is showing. Always 0 until an arrow is pressed. */
    fun index(ctx: Context, widgetId: Int): Int =
        prefs(ctx).getInt(indexKey(widgetId), 0)

    fun setIndex(ctx: Context, widgetId: Int, index: Int) {
        prefs(ctx).edit().putInt(indexKey(widgetId), index).apply()
    }

    /**
     * Moves [widgetId] by [delta] cards within a deck of [count], wrapping at
     * both ends.
     *
     * Wrapping rather than clamping: the timetable is a cycle, and a disabled
     * arrow on a 4x1 strip is a dead control the user has to discover. Pure
     * arithmetic in [wrap] so the wrap itself is unit-testable without a
     * Context.
     */
    fun step(ctx: Context, widgetId: Int, delta: Int, count: Int): Int {
        val next = wrap(index(ctx, widgetId) + delta, count)
        setIndex(ctx, widgetId, next)
        return next
    }

    /**
     * [value] brought into `0 until count`, wrapping negatives.
     *
     * Kotlin's `%` keeps the sign of the dividend, so a plain `value % count`
     * yields -1 when stepping back from card 0 — the bug this exists to
     * prevent. Returns 0 for an empty deck rather than dividing by zero.
     */
    fun wrap(value: Int, count: Int): Int {
        if (count <= 0) return 0
        return ((value % count) + count) % count
    }

    /** Forgets everything stored for [widgetId]. Called from onDeleted so a
     *  removed widget leaves no keys behind — ids are recycled by the
     *  launcher, and a new widget must not inherit an old one's colours. */
    fun clear(ctx: Context, widgetId: Int) {
        prefs(ctx).edit()
            .remove(indexKey(widgetId))
            .remove(bgKey(widgetId))
            .remove(alphaKey(widgetId))
            .remove(textKey(widgetId))
            .remove(accentKey(widgetId))
            .remove(fontKey(widgetId))
            .apply()
    }

    // ── Appearance ─────────────────────────────────────────────────────

    private fun bgKey(widgetId: Int) = "widget_bg_$widgetId"
    private fun alphaKey(widgetId: Int) = "widget_alpha_$widgetId"
    private fun textKey(widgetId: Int) = "widget_text_$widgetId"
    private fun accentKey(widgetId: Int) = "widget_accent_$widgetId"
    private fun fontKey(widgetId: Int) = "widget_font_$widgetId"

    /**
     * A widget's appearance. Every colour is nullable and null means "follow
     * the device theme", which is what an unconfigured widget does — adding
     * the widget and never opening its settings must keep working.
     */
    data class Appearance(
        val background: Int?,
        /** 0 = opaque, 100 = fully transparent. */
        val transparency: Int,
        val textColor: Int?,
        val accentColor: Int,
        val fontSp: Int,
    )

    fun appearance(ctx: Context, widgetId: Int): Appearance {
        val p = prefs(ctx)
        return Appearance(
            background = if (p.contains(bgKey(widgetId))) p.getInt(bgKey(widgetId), 0) else null,
            transparency = p.getInt(alphaKey(widgetId), 0).coerceIn(0, 100),
            textColor = if (p.contains(textKey(widgetId))) p.getInt(textKey(widgetId), 0) else null,
            accentColor = p.getInt(accentKey(widgetId), DEFAULT_ACCENT),
            fontSp = p.getInt(fontKey(widgetId), DEFAULT_FONT_SP)
                .coerceIn(MIN_FONT_SP, MAX_FONT_SP),
        )
    }

    fun setAppearance(ctx: Context, widgetId: Int, a: Appearance) {
        val e = prefs(ctx).edit()
        if (a.background == null) e.remove(bgKey(widgetId)) else e.putInt(bgKey(widgetId), a.background)
        if (a.textColor == null) e.remove(textKey(widgetId)) else e.putInt(textKey(widgetId), a.textColor)
        e.putInt(alphaKey(widgetId), a.transparency.coerceIn(0, 100))
        e.putInt(accentKey(widgetId), a.accentColor)
        e.putInt(fontKey(widgetId), a.fontSp.coerceIn(MIN_FONT_SP, MAX_FONT_SP))
        e.apply()
    }

    /**
     * [color] with [transparency] (0–100, percent *transparent*) applied to
     * its alpha channel.
     *
     * Applied to the background colour alone, never to the widget's root
     * view: fading the root would fade the text with it, and a transparent
     * widget exists precisely so that opaque text can sit over the wallpaper.
     *
     * 100 is a real value, not "unset" — a fully transparent background is
     * the headline case this whole setting exists for.
     */
    fun withTransparency(color: Int, transparency: Int): Int {
        val pct = transparency.coerceIn(0, 100)
        val alpha = ((100 - pct) * 255 / 100).coerceIn(0, 255)
        // Bit arithmetic rather than Color.argb: android.graphics.Color is a
        // stub under unit tests (returnDefaultValues), so every Color call
        // returns 0 there and this function would be untestable — and would
        // silently produce transparent black if it ever ran on the JVM side.
        return (alpha shl 24) or (color and 0x00FFFFFF)
    }

    /**
     * Black or white, whichever stays readable on [background].
     *
     * The accent colour is user-chosen and can be anything, so the card's text
     * cannot be a fixed colour: white on the default gold is barely legible,
     * black on a dark accent is worse. Uses the WCAG relative-luminance
     * coefficients rather than a plain RGB average, which would call pure blue
     * light and pure green dark.
     */
    fun contrastOn(background: Int): Int {
        // Channels unpacked by hand for the same reason as withTransparency:
        // Color is stubbed to 0 under unit tests, which would make every
        // background look black and this function always answer white.
        val red = (background shr 16) and 0xFF
        val green = (background shr 8) and 0xFF
        val blue = background and 0xFF
        val luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        return if (luminance > 140) BLACK else WHITE
    }

    /**
     * [baseSp] reduced until [text] is expected to fit within [maxChars].
     *
     * The card is sized to its content, but the strip it sits on is not: a
     * long prayer name at a large font pushed the card wider than the space
     * between the arrows, and the launcher clipped it. `maxLines="1"` with
     * `ellipsize` turned that into a truncated name rather than an overflow,
     * which is not better — "المغرب" cut to "المغ…" is no longer the word.
     *
     * A character count rather than a measured width: RemoteViews are built
     * in this process and inflated in the launcher's, so there is no view to
     * measure against and no reliable width to measure to. The count is a
     * proxy, deliberately conservative, and the floor keeps it legible even
     * when the estimate is pessimistic.
     *
     * Scales down only. A short name does not get a bigger font than the one
     * the user chose — that would override the setting rather than rescue it.
     */
    fun fitFontSp(baseSp: Int, text: String, maxChars: Int = FIT_CHARS): Int {
        if (maxChars <= 0 || text.length <= maxChars) return baseSp
        // Width scales roughly with the font size, so the ratio of the
        // overshoot is what the size has to come down by.
        val scaled = (baseSp.toDouble() * maxChars / text.length).toInt()
        return scaled.coerceIn(MIN_FONT_SP, baseSp)
    }

    /**
     * Characters that fit on one card line at the default font size.
     *
     * Derived from the longest name the deck shows — "منتصف الليل" at 12
     * characters — which must render whole at the default, so the threshold
     * sits just above it.
     */
    const val FIT_CHARS = 13

    private const val BLACK = 0xFF000000.toInt()
    private const val WHITE = 0xFFFFFFFF.toInt()
}
