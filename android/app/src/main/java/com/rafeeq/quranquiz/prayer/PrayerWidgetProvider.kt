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
import java.time.ZoneId
import java.time.chrono.HijrahDate
import java.time.format.DateTimeFormatter
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Home-screen widget: a 4x1 strip with a date column and a swipeable deck of
 * prayer cards, each counting down to its own time.
 *
 * `RemoteViews` are inflated by the launcher process, which has no WebView and
 * cannot run JavaScript. The widget therefore reads [PrayerTimesEngine] and
 * [PrayerConfig] directly, never a cache written by the app — it must be right
 * on a launcher restart, after a reboot, and on a day the app was never opened.
 *
 * Refreshes are pushed, not pulled: `updatePeriodMillis` is 0 in the widget
 * info XML (the system's own cap of 30 minutes would fire pointlessly), and
 * instead [refresh] is called from the prayer alarm chain (each prayer firing,
 * and the midnight roll) and from the plugin whenever the user changes
 * location or calculation settings. The per-second countdown is not a refresh:
 * it is a `Chronometer` ticked by the system in the launcher's own process.
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

        internal const val COLOR_ACCENT = 0xFFD4B48C.toInt()
        private const val COLOR_LIGHT_TEXT = 0xFF000000.toInt()
        private const val COLOR_DARK_TEXT = 0xFFFFFFFF.toInt()

        /**
         * Display order for the deck's cards, highest first: the five
         * obligatory prayers plus sunrise (PrayerTimesEngine's
         * DAILY_TIMETABLE, already in that interleaved order), then the
         * supplementary times in enum declaration order.
         *
         * Built explicitly — rather than relying on PrayerName.values()'
         * declaration order, where DUHA sits ahead of four obligatory
         * prayers — so the deck reads as a timetable rather than as the enum.
         * DAILY_TIMETABLE by construction contains only the five obligatory
         * prayers and sunrise, so nothing in the supplementary tail can ever
         * sort ahead of an obligatory prayer: that guarantee is structural,
         * not a coincidence of list order.
         */
        internal val SLOT_PRIORITY: List<PrayerName> =
            PrayerTimesEngine.DAILY_TIMETABLE +
                PrayerName.values().filter { it !in PrayerTimesEngine.DAILY_TIMETABLE }

        /**
         * Picks which names become cards, in the order the user swipes
         * through them.
         *
         * A name is eligible only if it is both in [visible] (lower-cased
         * prayer names, as stored in PrayerConfig) and has a time
         * ([withTime] — adhan-java returns null inside the midnight-sun
         * window, and a card showing a name with no time must never exist).
         * Eligible names are then ordered by [SLOT_PRIORITY].
         *
         * Nothing is truncated: a deck holds a card per visible time, unlike
         * the fixed six slots this widget had before it became a strip. Pure
         * and Context-free so it is directly unit-testable.
         */
        internal fun selectForDisplay(
            visible: Set<String>,
            withTime: Set<PrayerName>,
        ): List<PrayerName> = SLOT_PRIORITY.filter { name ->
            name.name.lowercase() in visible && name in withTime
        }

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
            // Without this the launcher serves cached cards: yesterday's
            // times, and countdowns whose targets have already passed.
            // updateAppWidget alone does not re-ask the factory.
            //
            // Deprecated in favour of RemoteViews.setRemoteAdapter(int, RemoteCollectionItems),
            // which needs API 31; minSdk here is 26, so this remains the only
            // way to invalidate a collection on the versions this app supports.
            @Suppress("DEPRECATION")
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_deck)
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
            // The StackView consumes horizontal swipes, so the deck cannot
            // also be a plain click target — its cards fill in a template
            // instead (see below), which is how a collection child must
            // receive clicks. The date column keeps an ordinary intent.
            views.setOnClickPendingIntent(R.id.widget_date_column, openApp)
            views.setPendingIntentTemplate(R.id.widget_deck, openApp)

            val tz = TimeZone.getDefault()
            val now = Date()
            val dateFmt = SimpleDateFormat("EEE, d MMM", Locale.US).apply { timeZone = tz }
            views.setTextViewText(R.id.widget_date, dateFmt.format(now))
            views.setTextViewText(R.id.widget_hijri, hijriLabel(now, tz))

            val coords = PrayerConfig.coords(ctx)
            if (coords == null) {
                // Never show times computed from a guessed location: prompt
                // instead, and stop before touching the engine at all.
                views.setViewVisibility(R.id.widget_prompt, android.view.View.VISIBLE)
                views.setViewVisibility(R.id.widget_deck, android.view.View.GONE)
                mgr.updateAppWidget(widgetId, views)
                return
            }

            views.setViewVisibility(R.id.widget_prompt, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_deck, android.view.View.VISIBLE)

            val color = baseTextColor(ctx)
            views.setTextColor(R.id.widget_date, color)
            views.setTextColor(R.id.widget_hijri, color)

            // The adapter intent must be distinguishable per widget id, or the
            // launcher reuses one factory across instances: intents that differ
            // only in extras are treated as equal, so the id goes in the data.
            val deckIntent = Intent(ctx, PrayerDeckService::class.java)
            deckIntent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            deckIntent.data =
                android.net.Uri.parse(deckIntent.toUri(Intent.URI_INTENT_SCHEME))
            // Deprecated in favour of the RemoteCollectionItems overload (API
            // 31), which would inline the cards into the RemoteViews and drop
            // the service entirely. minSdk here is 26, so the service-backed
            // adapter stays until this app's floor rises.
            @Suppress("DEPRECATION")
            views.setRemoteAdapter(R.id.widget_deck, deckIntent)
            views.setEmptyView(R.id.widget_deck, R.id.widget_prompt)

            mgr.updateAppWidget(widgetId, views)

            // Open on the next prayer so the widget answers "how long until
            // the next prayer?" before the user swipes at all.
            val (lat, lng) = coords
            val next = PrayerTimesEngine.nextAfter(
                now,
                lat,
                lng,
                PrayerConfig.method(ctx),
                PrayerConfig.madhab(ctx),
                tz,
            )
            val cards = PrayerDeck.build(ctx, now)
            val initial = PrayerDeck.initialIndex(cards, next)
            if (initial > 0) {
                val scroll = RemoteViews(ctx.packageName, R.layout.widget_prayer_times)
                scroll.setDisplayedChild(R.id.widget_deck, initial)
                mgr.partiallyUpdateAppWidget(widgetId, scroll)
            }
        }

        /**
         * The Hijri date, e.g. "10 Rab. II 1448".
         *
         * java.time's HijrahDate is the tabular Umm al-Qura calendar, which can
         * differ by a day from local sighting — it is a label beside the
         * Gregorian date, never something a prayer time is computed from.
         * Available since API 26, which is this app's minSdk.
         */
        private fun hijriLabel(now: Date, tz: TimeZone): String {
            val zone = runCatching { tz.toZoneId() }.getOrDefault(ZoneId.systemDefault())
            val local = now.toInstant().atZone(zone).toLocalDate()
            val hijri = HijrahDate.from(local)
            return DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US).format(hijri)
        }

        /** Arabic display label for a prayer name, shown in the widget
         *  regardless of the app's own language — the launcher process has
         *  no access to the JS i18n strings. */
        internal fun nameLabel(ctx: Context, name: PrayerName): String {
            val resId = when (name) {
                PrayerName.FAJR -> R.string.prayer_widget_name_fajr
                PrayerName.SUNRISE -> R.string.prayer_widget_name_sunrise
                PrayerName.DUHA -> R.string.prayer_widget_name_duha
                PrayerName.DHUHR -> R.string.prayer_widget_name_dhuhr
                PrayerName.ASR -> R.string.prayer_widget_name_asr
                PrayerName.MAGHRIB -> R.string.prayer_widget_name_maghrib
                PrayerName.ISHA -> R.string.prayer_widget_name_isha
                PrayerName.MIDNIGHT -> R.string.prayer_widget_name_midnight
                PrayerName.LAST_THIRD -> R.string.prayer_widget_name_last_third
            }
            return ctx.getString(resId)
        }

        /**
         * The base text color, matching whichever layout variant the system
         * actually inflated (day vs. night) rather than assuming one — the
         * widget follows the *device's* configuration, since RemoteViews has
         * no access to the app's own in-WebView theme.
         */
        internal fun baseTextColor(ctx: Context): Int {
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
