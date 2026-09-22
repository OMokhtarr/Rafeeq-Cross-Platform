package com.rafeeq.quranquiz.prayer

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.os.Build
import android.widget.RemoteViews
import com.rafeeq.quranquiz.MainActivity
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The two timetable widgets: every visible prayer on screen at once, with the
 * next one marked.
 *
 * Distinct from [PrayerWidgetProvider], which is a 4x1 *strip* showing one
 * prayer at a time and stepped by arrows. Here every time is already visible,
 * so there is nothing to step through: no arrows, no stored card index, and
 * no auto-revert timer. That also means no `AdapterViewFlipper` and no bound
 * `RemoteViewsService` — the rows are set directly, which is both simpler and
 * cheaper than a collection view.
 *
 * Rows come from [PrayerConfig.visibleTimes] by way of
 * [PrayerWidgetProvider.selectForDisplay], so the app's Shown Times setting
 * governs all three widgets alike rather than each keeping its own idea.
 *
 * Two subclasses rather than one resizable provider: the launcher's picker
 * lists providers, so separate classes are what give the vertical and the
 * wide form their own entries and their own default sizes.
 */
abstract class PrayerTimetableWidgetProvider : AppWidgetProvider() {

    /** The layout this variant inflates. */
    protected abstract val layoutRes: Int

    /**
     * Row slots in the layout, in display order.
     *
     * Fixed ids rather than a generated list because `RemoteViews` cannot
     * inflate children at runtime outside a collection view. The layout
     * declares the maximum number of rows and this hides the surplus, which
     * is why [MAX_ROWS] and the layouts must agree.
     */
    protected abstract val rowIds: List<RowViews>

    /** The three views making up one row of the timetable. */
    data class RowViews(val root: Int, val label: Int, val time: Int)

    override fun onUpdate(
        ctx: Context,
        mgr: AppWidgetManager,
        widgetIds: IntArray,
    ) {
        widgetIds.forEach { id -> render(ctx, mgr, id) }
    }

    private fun render(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(ctx.packageName, layoutRes)
        val look = PrayerWidgetConfig.appearance(ctx, widgetId)

        // The whole widget opens the app. Unlike the strip there are no
        // arrows to mis-hit, so there is no reason to restrict the target to
        // one column.
        views.setOnClickPendingIntent(
            R.id.tt_root,
            PendingIntent.getActivity(
                ctx,
                0,
                Intent(ctx, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            ),
        )

        applyAppearance(ctx, views, look)

        val tz = TimeZone.getDefault()
        val now = Date()
        val dateFmt = SimpleDateFormat("EEE, d MMM", Locale.US).apply { timeZone = tz }
        views.setTextViewText(R.id.tt_date, dateFmt.format(now))
        views.setTextViewText(R.id.tt_hijri, PrayerWidgetProvider.hijriLabel(now, tz))

        // Hidden rather than faked when no name has resolved; the pin goes
        // with it, since an icon labelling nothing is worse than no icon.
        val place = PrayerConfig.placeName(ctx)
        val placeVisibility = if (place.isNullOrBlank()) {
            android.view.View.GONE
        } else {
            views.setTextViewText(R.id.tt_place, place)
            android.view.View.VISIBLE
        }
        views.setViewVisibility(R.id.tt_place, placeVisibility)
        views.setViewVisibility(R.id.tt_icon_place, placeVisibility)

        val coords = PrayerConfig.coords(ctx)
        if (coords == null) {
            // Never show times computed from a guessed location: prompt
            // instead, and stop before touching the engine at all.
            views.setViewVisibility(R.id.tt_prompt, android.view.View.VISIBLE)
            views.setViewVisibility(R.id.tt_rows, android.view.View.GONE)
            mgr.updateAppWidget(widgetId, views)
            return
        }

        views.setViewVisibility(R.id.tt_prompt, android.view.View.GONE)
        views.setViewVisibility(R.id.tt_rows, android.view.View.VISIBLE)

        val (lat, lng) = coords
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)
        val today = PrayerTimesEngine.timesFor(lat, lng, now, method, madhab, tz)
        val next = PrayerTimesEngine.nextAfter(now, lat, lng, method, madhab, tz)

        val withTime = PrayerName.values().filter { today.times[it] != null }.toSet()
        val names = PrayerWidgetProvider
            .selectForDisplay(PrayerConfig.visibleTimes(ctx), withTime)
            .take(rowIds.size)

        val timeFmt = PrayerDeck.clockFormat(ctx, tz)
        val onAccent = PrayerWidgetConfig.contrastOn(look.accentColor)
        val baseText = look.textColor ?: PrayerWidgetProvider.baseTextColor(ctx)

        rowIds.forEachIndexed { index, row ->
            val name = names.getOrNull(index)
            if (name == null) {
                // The layout declares a fixed number of rows and this hides
                // the ones today has no time for — a user who turns Sunrise
                // off must not be left with a blank gap where it sat.
                views.setViewVisibility(row.root, android.view.View.GONE)
                return@forEachIndexed
            }
            views.setViewVisibility(row.root, android.view.View.VISIBLE)
            views.setTextViewText(row.label, PrayerWidgetProvider.nameLabel(ctx, name))
            views.setTextViewText(row.time, timeFmt.format(today.times[name]!!))

            // The next prayer is marked by filling its time in the accent, the
            // same emphasis the strip's card carries — so the three widgets
            // agree on what "next" looks like.
            val isNext = name == next?.name
            views.setTextColor(row.label, if (isNext) look.accentColor else baseText)
            views.setTextColor(row.time, if (isNext) onAccent else baseText)
            tintRow(views, row.time, if (isNext) look.accentColor else TRANSPARENT)
        }

        mgr.updateAppWidget(widgetId, views)
    }

    /**
     * Paints the widget from its stored appearance.
     *
     * Kept separate from [PrayerWidgetProvider.applyAppearance] rather than
     * shared: that one addresses the strip's own view ids, and the two
     * layouts have nothing in common but the idea.
     */
    private fun applyAppearance(
        ctx: Context,
        views: RemoteViews,
        look: PrayerWidgetConfig.Appearance,
    ) {
        val background = look.background
        if (background != null || look.transparency > 0) {
            val base = background ?: PrayerWidgetProvider.defaultBackground(ctx)
            val tint = PrayerWidgetConfig.withTransparency(base, look.transparency)
            // Tinted, not `setBackgroundColor`: that replaces the rounded
            // shape drawable with a flat fill and squares the corners. Below
            // API 31 there is no per-widget drawable tint, so a configured
            // widget takes the flat colour and loses them — the same trade
            // the strip makes, and for the same reason: a transparent widget
            // that ignored the setting would look broken.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                views.setColorStateList(
                    R.id.tt_root,
                    "setBackgroundTintList",
                    ColorStateList.valueOf(tint),
                )
            } else {
                views.setInt(R.id.tt_root, "setBackgroundColor", tint)
            }
        }

        val text = look.textColor ?: PrayerWidgetProvider.baseTextColor(ctx)
        listOf(R.id.tt_date, R.id.tt_hijri, R.id.tt_place, R.id.tt_prompt)
            .forEach { id -> views.setTextColor(id, text) }
        listOf(R.id.tt_icon_date, R.id.tt_icon_place)
            .forEach { id -> views.setInt(id, "setColorFilter", text) }

        views.setTextViewTextSize(R.id.tt_date, SP, look.fontSp.toFloat())
        views.setTextViewTextSize(R.id.tt_hijri, SP, look.fontSp.toFloat())
        views.setTextViewTextSize(R.id.tt_place, SP, look.fontSp.toFloat())
        rowIds.forEach { row ->
            views.setTextViewTextSize(row.label, SP, look.fontSp.toFloat())
            views.setTextViewTextSize(row.time, SP, look.fontSp.toFloat())
        }
    }

    /** The next prayer's pill. Transparent elsewhere, so only one row is lit. */
    private fun tintRow(views: RemoteViews, timeId: Int, color: Int) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setColorStateList(
                timeId,
                "setBackgroundTintList",
                ColorStateList.valueOf(color),
            )
        }
        // Below API 31 the pill is left alone: `setBackgroundColor` would
        // square it, and a square block is worse than no highlight when the
        // text colour already distinguishes the row.
    }

    companion object {
        private const val SP = android.util.TypedValue.COMPLEX_UNIT_SP
        private const val TRANSPARENT = 0x00000000

        /**
         * Re-renders every placed timetable widget of both variants.
         *
         * Separate from [PrayerWidgetProvider.refresh] because the providers
         * are different components and `getAppWidgetIds` is per component —
         * but called from the same places, so all three widget types move
         * together.
         */
        fun refresh(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            listOf(
                PrayerTimetableVerticalWidget(),
                PrayerTimetableWideWidget(),
            ).forEach { provider ->
                val ids = mgr.getAppWidgetIds(
                    ComponentName(ctx, provider.javaClass),
                )
                if (ids.isNotEmpty()) provider.onUpdate(ctx, mgr, ids)
            }
        }
    }
}

/** 3x3 portrait form: date block over a vertical list of times. */
class PrayerTimetableVerticalWidget : PrayerTimetableWidgetProvider() {
    override val layoutRes = R.layout.widget_timetable_vertical
    override val rowIds = VERTICAL_ROWS

    companion object {
        val VERTICAL_ROWS = listOf(
            RowViews(R.id.tt_row_0, R.id.tt_label_0, R.id.tt_time_0),
            RowViews(R.id.tt_row_1, R.id.tt_label_1, R.id.tt_time_1),
            RowViews(R.id.tt_row_2, R.id.tt_label_2, R.id.tt_time_2),
            RowViews(R.id.tt_row_3, R.id.tt_label_3, R.id.tt_time_3),
            RowViews(R.id.tt_row_4, R.id.tt_label_4, R.id.tt_time_4),
            RowViews(R.id.tt_row_5, R.id.tt_label_5, R.id.tt_time_5),
        )
    }
}

/** 4x2 landscape form: the same times laid out as columns under the date. */
class PrayerTimetableWideWidget : PrayerTimetableWidgetProvider() {
    override val layoutRes = R.layout.widget_timetable_wide
    override val rowIds = PrayerTimetableVerticalWidget.VERTICAL_ROWS
}
