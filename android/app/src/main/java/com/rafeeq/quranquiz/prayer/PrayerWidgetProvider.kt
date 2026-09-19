package com.rafeeq.quranquiz.prayer

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import com.rafeeq.quranquiz.MainActivity
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Home-screen widget: `RemoteViews` inflated by the launcher process, which
 * has no WebView and cannot run JavaScript. It therefore reads
 * [PrayerTimesEngine] and [PrayerConfig] directly, never a cache written by
 * the app — the widget must be right on a launcher restart, after a reboot,
 * and on a day the app was never opened.
 *
 * Refreshes are pushed, not pulled: `updatePeriodMillis` is 0 in the widget
 * info XML (the system's own cap of 30 minutes would fire pointlessly), and
 * instead [refresh] is called from the prayer alarm chain (each prayer
 * firing, and the midnight roll) and from the plugin whenever the user
 * changes location or calculation settings.
 */
class PrayerWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        appWidgetIds.forEach { id -> render(context, appWidgetManager, id) }
    }

    /**
     * Fires once, when the very first instance of this widget is placed.
     *
     * scheduleMidnightRoll is otherwise armed only from setLocation, the boot
     * receiver, and its own re-arm in PrayerAlarmReceiver. A long-time user
     * (location stored weeks ago, so setLocation never fires again) who adds
     * the widget for the first time with reminders off would never trigger
     * any of those — nothing would ever arm the midnight roll, and the widget
     * would show that day's times and highlight forever. Arming it here is
     * exactly the staleness the native-calculation architecture (no WebView
     * in the launcher process) exists to prevent, so it must not depend on
     * any other entry point having already run.
     */
    override fun onEnabled(context: Context) {
        PrayerAlarmScheduler.scheduleMidnightRoll(context)
    }

    /**
     * Fires once, when the last instance of this widget is removed. Cancels
     * the midnight-roll alarm that onEnabled armed — with no widget left to
     * refresh, there is nothing for it to do, and leaving it pending would
     * wake the device every night for no reason. Reminders (scheduleNext) are
     * independent of the widget and are left alone.
     */
    override fun onDisabled(context: Context) {
        PrayerAlarmScheduler.cancelMidnightRoll(context)
    }

    companion object {

        /** Prayer name view id, time view id, for each of the six displayed
         *  entries, in display order. Kept as plain data so the id-pairing
         *  itself — the thing most likely to drift between the two layout
         *  files — is easy to see and to check for internal consistency. */
        internal val VIEW_IDS: List<Triple<PrayerName, Int, Int>> = listOf(
            Triple(PrayerName.FAJR, R.id.name_fajr, R.id.time_fajr),
            Triple(PrayerName.SUNRISE, R.id.name_sunrise, R.id.time_sunrise),
            Triple(PrayerName.DHUHR, R.id.name_dhuhr, R.id.time_dhuhr),
            Triple(PrayerName.ASR, R.id.name_asr, R.id.time_asr),
            Triple(PrayerName.MAGHRIB, R.id.name_maghrib, R.id.time_maghrib),
            Triple(PrayerName.ISHA, R.id.name_isha, R.id.time_isha),
        )

        private const val COLOR_ACCENT = 0xFFD4B48C.toInt()
        private const val COLOR_LIGHT_TEXT = 0xFF000000.toInt()
        private const val COLOR_DARK_TEXT = 0xFFFFFFFF.toInt()

        /**
         * Looks up every placed instance of this widget and re-renders each.
         * The single entry point every refresh trigger in the app calls —
         * the alarm chain, the midnight roll, and the plugin after a
         * location/config change — so a widget on the home screen is never
         * more than one of those events stale.
         */
        fun refresh(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, PrayerWidgetProvider::class.java))
            ids.forEach { id -> render(ctx, mgr, id) }
        }

        private fun render(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(ctx.packageName, R.layout.widget_prayer_times)

            val openApp = PendingIntent.getActivity(
                ctx,
                0,
                Intent(ctx, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_root, openApp)

            val coords = PrayerConfig.coords(ctx)
            if (coords == null) {
                // Never show times computed from a guessed location: prompt
                // instead, and stop before touching the engine at all.
                views.setViewVisibility(R.id.widget_prompt, android.view.View.VISIBLE)
                views.setViewVisibility(R.id.widget_times_row, android.view.View.GONE)
                mgr.updateAppWidget(widgetId, views)
                return
            }

            views.setViewVisibility(R.id.widget_prompt, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_times_row, android.view.View.VISIBLE)

            val (lat, lng) = coords
            val method = PrayerConfig.method(ctx)
            val madhab = PrayerConfig.madhab(ctx)
            val tz = TimeZone.getDefault()
            val now = Date()

            val timeFmt = SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = tz }
            val dateFmt = SimpleDateFormat("d MMM", Locale.US).apply { timeZone = tz }
            views.setTextViewText(R.id.widget_date, dateFmt.format(now))

            val day = PrayerTimesEngine.timesFor(lat, lng, now, method, madhab, tz)
            // Null if the engine cannot determine one at all (e.g. midnight
            // sun at high latitude) — nothing is highlighted in that case,
            // rather than guessing.
            val next = PrayerTimesEngine.nextAfter(now, lat, lng, method, madhab, tz)

            VIEW_IDS.forEach { (name, nameViewId, timeViewId) ->
                val at = day.times[name]
                // A null individual time (same high-latitude edge case) is
                // left blank rather than crashing the launcher or showing a
                // fabricated value.
                views.setTextViewText(timeViewId, if (at != null) timeFmt.format(at) else "")

                val isHighlighted = next != null && next.name == name
                val color = if (isHighlighted) COLOR_ACCENT else baseTextColor(ctx)
                views.setTextColor(nameViewId, color)
                views.setTextColor(timeViewId, color)
            }

            mgr.updateAppWidget(widgetId, views)
        }

        /**
         * The non-highlighted text color, matching whichever layout variant
         * the system actually inflated (day vs. night) rather than assuming
         * one — the widget follows the *device's* configuration, since
         * RemoteViews has no access to the app's own in-WebView theme.
         */
        private fun baseTextColor(ctx: Context): Int {
            val nightMode = ctx.resources.configuration.uiMode and
                android.content.res.Configuration.UI_MODE_NIGHT_MASK
            return if (nightMode == android.content.res.Configuration.UI_MODE_NIGHT_YES) {
                COLOR_DARK_TEXT
            } else {
                COLOR_LIGHT_TEXT
            }
        }
    }
}
