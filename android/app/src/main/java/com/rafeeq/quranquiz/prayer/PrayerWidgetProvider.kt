package com.rafeeq.quranquiz.prayer

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.os.Build
import android.os.SystemClock
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
 * Home-screen widget: a 4x1 strip with a date column and one prayer card,
 * stepped through with a button either side of it, counting down to its time.
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
 *
 * Only the date column opens the app. The arrows carry their own broadcasts
 * back to this receiver and the card carries no intent at all, so a press
 * meant for "next" can never launch Rafeeq.
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
     * Handles the arrow presses alongside the system's own widget broadcasts.
     *
     * A collection view cannot be stepped from the launcher without code, so
     * each arrow is a PendingIntent back here; this moves the stored index and
     * re-renders that one widget. Everything else is delegated to
     * AppWidgetProvider, which dispatches onUpdate/onDeleted/onEnabled.
     */
    override fun onReceive(context: Context, intent: Intent) {
        val widgetId = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        )

        if (intent.action == ACTION_STEP) {
            val delta = intent.getIntExtra(EXTRA_DELTA, 0)
            if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID && delta != 0) {
                val count = PrayerDeck.build(context, Date()).size
                PrayerWidgetConfig.step(context, widgetId, delta, count)
                render(context, AppWidgetManager.getInstance(context), widgetId)
                // Pushed out by every press, so the 30s runs from the last one
                // and holding the arrow through several prayers does not fire
                // a revert mid-browse.
                armRevert(context, widgetId)
            }
            return
        }

        if (intent.action == ACTION_REVERT) {
            if (widgetId != AppWidgetManager.INVALID_APPWIDGET_ID) {
                // -1 is the "no stored card" sentinel render() already honours:
                // it falls back to the next prayer and stores that index.
                PrayerWidgetConfig.setIndex(context, widgetId, -1)
                render(context, AppWidgetManager.getInstance(context), widgetId)
            }
            return
        }

        super.onReceive(context, intent)
    }

    /**
     * Fires when specific widgets are removed. Their stored index and colours
     * go with them: the launcher recycles widget ids, so leaving keys behind
     * would hand a newly placed widget the previous one's appearance — and a
     * pending revert would fire against an id that is no longer this widget.
     */
    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        appWidgetIds.forEach { id ->
            cancelRevert(context, id)
            PrayerWidgetConfig.clear(context, id)
        }
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
         * Display order for the deck's cards: chronological, which is the
         * enum's own declaration order.
         *
         * This used to be a *priority* order — DAILY_TIMETABLE first, then
         * the supplementary times appended — from when the widget had four
         * fixed slots and had to decide which times to drop. It no longer
         * truncates: the deck holds a card per visible time and the
         * timetable widgets show them all. So the only question left is what
         * order to read them in, and the answer is the order they occur.
         *
         * The old form put Duha after Isha, because DAILY_TIMETABLE omits it
         * and everything missing from that list was appended to the tail.
         * Duha falls shortly after sunrise, so that was simply wrong once
         * nothing was being dropped.
         */
        internal val SLOT_PRIORITY: List<PrayerName> = PrayerName.values().toList()

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
         * Re-renders every placed widget of every type — the strip here and
         * both timetable forms, which are separate components.
         *
         * The single entry point every refresh trigger in the app calls: the
         * alarm chain, the boot receiver, the midnight roll, and the plugin
         * after a location or config change. So a widget on the home screen
         * is never more than one of those events stale, whichever type it is.
         */
        /**
         * Re-renders one widget, leaving every other instance alone.
         *
         * Used by the configuration screen, where only the widget being
         * configured has changed — and where [refresh]'s index reset would be
         * wrong, since the user has not moved to a new day, they have just
         * picked a colour.
         */
        fun refreshOne(ctx: Context, widgetId: Int) {
            render(ctx, AppWidgetManager.getInstance(ctx), widgetId)
        }

        fun refresh(ctx: Context) {
            val mgr = AppWidgetManager.getInstance(ctx)
            val ids = mgr.getAppWidgetIds(ComponentName(ctx, PrayerWidgetProvider::class.java))
            // Every refresh means the day or the timetable moved, so a widget
            // parked on "Asr" by the arrows must not still be there: it would
            // be yesterday's Asr. Clearing the index sends render() back to
            // the next prayer, which is where the widget is most useful.
            ids.forEach { id -> PrayerWidgetConfig.setIndex(ctx, id, -1) }
            ids.forEach { id -> render(ctx, mgr, id) }
            // render() already invalidates each widget's collection, but it
            // does so per id; this catches any the loop above did not reach.
            @Suppress("DEPRECATION")
            mgr.notifyAppWidgetViewDataChanged(ids, R.id.widget_deck)

            // The timetable widgets are separate components, so their ids do
            // not come back from the query above. Fanning out from here keeps
            // this the one entry point every refresh trigger calls — the
            // alarm chain, the boot receiver, the midnight roll and the
            // plugin all already do, and a new trigger gets all three widget
            // types without having to know they exist.
            PrayerTimetableWidgetProvider.refresh(ctx)
        }

        /** The broadcast an arrow sends back to this receiver. */
        internal const val ACTION_STEP = "com.rafeeq.quranquiz.prayer.WIDGET_STEP"

        /** +1 for the next prayer, -1 for the previous one. */
        internal const val EXTRA_DELTA = "delta"

        /** The broadcast that puts a browsed widget back on the next prayer. */
        internal const val ACTION_REVERT = "com.rafeeq.quranquiz.prayer.WIDGET_REVERT"

        /**
         * How long a widget stays where the arrows left it.
         *
         * Browsing the timetable is a momentary thing; the widget's job the
         * rest of the time is to show the next prayer. Without this, a single
         * stray press would leave a home-screen widget stuck on Duha until the
         * next refresh hours later.
         */
        internal const val REVERT_AFTER_MS = 30_000L

        private fun revertIntent(ctx: Context, widgetId: Int): PendingIntent {
            val intent = Intent(ctx, PrayerWidgetProvider::class.java).apply {
                action = ACTION_REVERT
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
            }
            // Request code keyed on the widget so two widgets can each have
            // their own revert pending without overwriting one another. The
            // +1 offset keeps it clear of stepIntent's codes, which use
            // widgetId * 2 and widgetId * 2 + 1.
            return PendingIntent.getBroadcast(
                ctx,
                widgetId * 2 + 2,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        /**
         * (Re)arms the revert for [widgetId], [REVERT_AFTER_MS] from now.
         *
         * Re-arming replaces the pending alarm rather than adding one, so
         * holding the arrow through several prayers keeps pushing the deadline
         * out and the revert lands 30s after the *last* press.
         *
         * Inexact and non-wakeup on purpose: this is cosmetic, and a widget
         * nobody is looking at does not justify waking the device. The system
         * may delay it, which only means the widget stays browsable slightly
         * longer.
         */
        private fun armRevert(ctx: Context, widgetId: Int) {
            val mgr = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            mgr.set(
                AlarmManager.ELAPSED_REALTIME,
                SystemClock.elapsedRealtime() + REVERT_AFTER_MS,
                revertIntent(ctx, widgetId),
            )
        }

        /** Drops any pending revert for [widgetId] — used when the widget is
         *  removed, so nothing fires against an id the launcher has recycled. */
        private fun cancelRevert(ctx: Context, widgetId: Int) {
            val mgr = ctx.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
            mgr.cancel(revertIntent(ctx, widgetId))
        }

        /**
         * A PendingIntent that moves [widgetId] by [delta] cards.
         *
         * The request code folds in both the widget id and the direction:
         * PendingIntents that differ only in extras are considered equal and
         * the system hands back the first one, which would make every arrow on
         * every widget step the same way.
         */
        private fun stepIntent(ctx: Context, widgetId: Int, delta: Int): PendingIntent {
            val intent = Intent(ctx, PrayerWidgetProvider::class.java).apply {
                action = ACTION_STEP
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                putExtra(EXTRA_DELTA, delta)
            }
            return PendingIntent.getBroadcast(
                ctx,
                widgetId * 2 + if (delta > 0) 1 else 0,
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }

        private fun render(ctx: Context, mgr: AppWidgetManager, widgetId: Int) {
            val views = RemoteViews(ctx.packageName, R.layout.widget_prayer_times)
            val look = PrayerWidgetConfig.appearance(ctx, widgetId)

            // Only the date column opens the app. The card deliberately has no
            // PendingIntent of any kind — with the arrows beside it, a card
            // that also launched the app would make a mis-aimed press costly.
            val openApp = PendingIntent.getActivity(
                ctx,
                0,
                Intent(ctx, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
            views.setOnClickPendingIntent(R.id.widget_date_column, openApp)
            views.setOnClickPendingIntent(R.id.widget_prev, stepIntent(ctx, widgetId, -1))
            views.setOnClickPendingIntent(R.id.widget_next, stepIntent(ctx, widgetId, +1))

            applyAppearance(ctx, views, look)

            val tz = TimeZone.getDefault()
            val now = Date()
            // Both calendars on one line: the strip has two lines and the
            // second belongs to the place and the timer.
            val dateFmt = SimpleDateFormat("EEE, d MMM", Locale.US).apply { timeZone = tz }
            views.setTextViewText(
                R.id.widget_date,
                "${dateFmt.format(now)} • ${hijriLabel(now, tz)}",
            )

            // Decoration on the coordinates: shown when a name has resolved,
            // hidden rather than faked when it has not. The pin goes with it,
            // since an icon labelling nothing is worse than no icon.
            val place = PrayerConfig.placeName(ctx)
            val placeVisibility = if (place.isNullOrBlank()) {
                android.view.View.GONE
            } else {
                views.setTextViewText(R.id.widget_place, place)
                android.view.View.VISIBLE
            }
            views.setViewVisibility(R.id.widget_place, placeVisibility)
            views.setViewVisibility(R.id.widget_icon_place, placeVisibility)

            val coords = PrayerConfig.coords(ctx)
            if (coords == null) {
                // Never show times computed from a guessed location: prompt
                // instead, and stop before touching the engine at all.
                views.setViewVisibility(R.id.widget_prompt, android.view.View.VISIBLE)
                views.setViewVisibility(R.id.widget_deck, android.view.View.GONE)
                views.setViewVisibility(R.id.widget_prev, android.view.View.GONE)
                views.setViewVisibility(R.id.widget_next, android.view.View.GONE)
                mgr.updateAppWidget(widgetId, views)
                return
            }

            views.setViewVisibility(R.id.widget_prompt, android.view.View.GONE)
            views.setViewVisibility(R.id.widget_deck, android.view.View.VISIBLE)

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

            // Which card to show. A stored index survives only while it still
            // addresses a card: the visible-times preference can shrink the
            // deck, and a day change moves which prayer is next, so an index
            // left over from yesterday would point at the wrong prayer.
            val cards = PrayerDeck.build(ctx, now)
            val (lat, lng) = coords
            val next = PrayerTimesEngine.nextAfter(
                now,
                lat,
                lng,
                PrayerConfig.method(ctx),
                PrayerConfig.madhab(ctx),
                tz,
            )
            val stored = PrayerWidgetConfig.index(ctx, widgetId)
            val shown = if (stored in cards.indices) {
                stored
            } else {
                PrayerDeck.initialIndex(cards, next).also {
                    PrayerWidgetConfig.setIndex(ctx, widgetId, it)
                }
            }

            // The timer belongs to whichever card is showing, but lives on
            // the strip rather than inside the card — the card is just the
            // name and the time. Counting up puts the base in the past and
            // counts away from it; counting down puts it in the future. Both
            // deltas are positive, because a Chronometer handed a negative
            // target climbs from a meaningless number.
            val card = cards.getOrNull(shown)
            if (card == null) {
                views.setViewVisibility(R.id.widget_timer, android.view.View.GONE)
            } else {
                views.setViewVisibility(R.id.widget_timer, android.view.View.VISIBLE)
                val base = if (card.countingUp) {
                    SystemClock.elapsedRealtime() - card.millisUntil
                } else {
                    SystemClock.elapsedRealtime() + card.millisUntil
                }
                views.setChronometer(R.id.widget_timer, base, null, true)
                views.setChronometerCountDown(R.id.widget_timer, !card.countingUp)
            }

            // Only one arrow pair is meaningful with a single card, and two
            // dead controls on a 4x1 strip is worse than none.
            val arrows = if (cards.size > 1) android.view.View.VISIBLE else android.view.View.GONE
            views.setViewVisibility(R.id.widget_prev, arrows)
            views.setViewVisibility(R.id.widget_next, arrows)

            mgr.updateAppWidget(widgetId, views)

            // setDisplayedChild must follow updateAppWidget: the adapter is
            // bound by that call, and a position set before it is discarded.
            val position = RemoteViews(ctx.packageName, R.layout.widget_prayer_times)
            position.setDisplayedChild(R.id.widget_deck, shown)
            mgr.partiallyUpdateAppWidget(widgetId, position)
            @Suppress("DEPRECATION")
            mgr.notifyAppWidgetViewDataChanged(intArrayOf(widgetId), R.id.widget_deck)
        }

        /**
         * Paints the strip from a widget's stored appearance.
         *
         * Transparency is applied to the background colour's alpha, never to
         * the root view: fading the root would fade the text with it, and a
         * transparent widget exists precisely so opaque text can sit over the
         * wallpaper. A null colour means "follow the device theme", which is
         * what an unconfigured widget does.
         */
        private fun applyAppearance(
            ctx: Context,
            views: RemoteViews,
            look: PrayerWidgetConfig.Appearance,
        ) {
            // Painted on every render, not only when the user configured a
            // colour. Left unpainted, the surface is whichever layout the
            // launcher inflated — layout/ or layout-night/ — and that follows
            // the DEVICE's dark mode, which is independent of Rafeeq's own
            // theme. A device in light mode therefore showed a white widget
            // under a dark app, and a reinstall made it obvious because the
            // launcher re-inflates the layout then.
            val base = look.background ?: defaultBackground(ctx)
            val tint = PrayerWidgetConfig.withTransparency(base, look.transparency)

            // Tint the shape drawable rather than replacing it.
                // `setBackgroundColor` alone used to be called here, which
                // swapped the drawable for a flat colour and left a
                // configured widget with square corners — the rounded card
                // is part of the design, not a default to trade away.
            //
            // From API 31 a background tint list recolours the shape
            // drawable without discarding it; older releases keep the
            // old flat-colour behaviour.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                // Tints the shape drawable in place, so its 16dp corners
                // and the alpha carried in the colour both survive.
                views.setColorStateList(
                    R.id.widget_root,
                    "setBackgroundTintList",
                    ColorStateList.valueOf(tint),
                )
            } else {
                // No per-widget drawable tint before API 31, so the strip
                // takes a flat colour and loses its corners there. That is
                // the trade this release makes for having the right colour
                // at all: the deck card, which has no transparency to honour,
                // makes the opposite one and keeps its shape.
                views.setInt(R.id.widget_root, "setBackgroundColor", tint)
            }

            val text = look.textColor ?: baseTextColor(ctx)
            listOf(
                R.id.widget_date,
                R.id.widget_place,
                R.id.widget_timer,
                R.id.widget_prompt,
            ).forEach { id -> views.setTextColor(id, text) }

            // The icons and chevrons are white vectors; tinting them with the
            // text colour keeps them visible over whatever the background
            // became — including a fully transparent one over any wallpaper.
            listOf(
                R.id.widget_prev,
                R.id.widget_next,
                R.id.widget_icon_date,
                R.id.widget_icon_place,
            ).forEach { id -> views.setInt(id, "setColorFilter", text) }

            // One size across the strip: the reference sets the date, place
            // and timer in the same weight, and a smaller secondary line made
            // the place name hard to read at the lower font sizes.
            listOf(
                R.id.widget_date,
                R.id.widget_place,
                R.id.widget_timer,
            ).forEach { id ->
                views.setTextViewTextSize(
                    id,
                    android.util.TypedValue.COMPLEX_UNIT_SP,
                    look.fontSp.toFloat(),
                )
            }
            views.setTextViewTextSize(
                R.id.widget_prompt,
                android.util.TypedValue.COMPLEX_UNIT_SP,
                (look.fontSp - 2).coerceAtLeast(PrayerWidgetConfig.MIN_FONT_SP).toFloat(),
            )
        }

        /**
         * The widget's own surface when the user has not picked a colour.
         *
         * Follows Rafeeq's stored theme, not the device's dark mode. The two
         * are independent — the app's theme is its own preference — and
         * reading the device instead is what left a white widget sitting
         * under a dark app. [PrayerConfig.appNight] is mirrored out of
         * localStorage for exactly this, and defaults to night, which is the
         * app's own default theme.
         */
        internal fun defaultBackground(ctx: Context): Int =
            if (PrayerConfig.appNight(ctx)) 0xFF1A1A1A.toInt() else 0xFFFFFFFF.toInt()

        /**
         * The Hijri date, e.g. "10 Rab. II 1448".
         *
         * java.time's HijrahDate is the tabular Umm al-Qura calendar, which can
         * differ by a day from local sighting — it is a label beside the
         * Gregorian date, never something a prayer time is computed from.
         * Available since API 26, which is this app's minSdk.
         */
        internal fun hijriLabel(now: Date, tz: TimeZone): String {
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
         * The base text colour, matching [defaultBackground] — so it follows
         * Rafeeq's theme too. It used to read the device's night mode and
         * assume the layout variant agreed; since the background is now
         * painted explicitly, the text has to be painted from the same
         * source or the two can disagree and leave white on white.
         */
        internal fun baseTextColor(ctx: Context): Int =
            if (PrayerConfig.appNight(ctx)) COLOR_DARK_TEXT else COLOR_LIGHT_TEXT
    }
}
