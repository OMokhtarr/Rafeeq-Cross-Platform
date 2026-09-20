package com.rafeeq.quranquiz.prayer

import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Backs the widget's swipeable card deck.
 *
 * A `StackView` is the only swipeable primitive `RemoteViews` offers — the
 * launcher drives the gesture in its own process and asks this factory for
 * each card. That indirection is why the deck exists as a bound service at
 * all rather than as views the provider sets directly.
 *
 * Like [PrayerWidgetProvider] this reads [PrayerTimesEngine] and
 * [PrayerConfig] directly and never a cache written by the app: the launcher
 * has no WebView, and the deck must be right after a reboot and on a day the
 * app was never opened.
 */
class PrayerDeckService : RemoteViewsService() {

    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        PrayerDeckFactory(applicationContext)
}

/**
 * One card per visible time, in [PrayerWidgetProvider.SLOT_PRIORITY] order.
 *
 * The cards are built once per `onDataSetChanged` — which the provider
 * triggers on every refresh — and held in memory, because `getViewAt` is
 * called by the launcher on a binder thread and must not recompute prayer
 * times per card.
 */
internal class PrayerDeckFactory(private val ctx: Context) :
    RemoteViewsService.RemoteViewsFactory {

    private var cards: List<PrayerDeck.Card> = emptyList()

    override fun onCreate() = Unit

    override fun onDataSetChanged() {
        cards = PrayerDeck.build(ctx, Date())
    }

    override fun onDestroy() {
        cards = emptyList()
    }

    override fun getCount(): Int = cards.size

    override fun getViewAt(position: Int): RemoteViews? {
        // The launcher can ask for a position from a dataset it has not yet
        // been told changed. Returning null is the documented way to decline,
        // and is far better than an index crash that makes it drop the widget.
        val card = cards.getOrNull(position) ?: return null

        val views = RemoteViews(ctx.packageName, R.layout.widget_prayer_card)
        views.setTextViewText(R.id.card_name, card.label)
        views.setTextViewText(R.id.card_time, card.clock)

        // Chronometer in countdown mode is ticked by the system inside the
        // launcher process, so the seconds advance with no app process
        // involvement at all. `base` is on the elapsed-realtime clock, which
        // is why the card carries a wall-clock delta rather than a Date.
        views.setChronometer(
            R.id.card_countdown,
            SystemClock.elapsedRealtime() + card.millisUntil,
            null,
            true,
        )
        views.setChronometerCountDown(R.id.card_countdown, true)

        val color = PrayerWidgetProvider.baseTextColor(ctx)
        views.setTextColor(R.id.card_name, color)
        views.setTextColor(R.id.card_time, color)
        views.setTextColor(R.id.card_countdown, PrayerWidgetProvider.COLOR_ACCENT)

        // A child of a collection cannot carry its own PendingIntent; it fills
        // in the template the provider set on the StackView instead.
        views.setOnClickFillInIntent(R.id.card_root, Intent())

        return views
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = true
}

/**
 * The deck's contents, as plain data computed from plain arguments.
 *
 * Split out of the factory so the part worth testing — which times become
 * cards, in what order, and how long each counts down for — is reachable
 * without a bound service or a launcher.
 */
internal object PrayerDeck {

    /** One card: everything [PrayerDeckFactory] needs to fill a layout, and
     *  nothing Android-specific. */
    data class Card(
        val name: PrayerName,
        val label: String,
        val clock: String,
        val millisUntil: Long,
    )

    /**
     * How long until [name] next occurs, given today's and tomorrow's times.
     *
     * Every card counts down, including cards for times that already passed
     * today — those count to tomorrow's occurrence. A countdown that has gone
     * negative is not a countdown, and `Chronometer` would render it as a
     * meaningless climbing number.
     *
     * Returns null when neither day has a time for the name (the midnight-sun
     * window), so the caller can drop the card rather than invent a target.
     */
    fun millisUntilNext(name: PrayerName, now: Date, today: DayTimes, tomorrow: DayTimes): Long? {
        val todayAt = today.times[name]
        if (todayAt != null && todayAt.after(now)) return todayAt.time - now.time
        val tomorrowAt = tomorrow.times[name] ?: return null
        return tomorrowAt.time - now.time
    }

    /**
     * Which card the deck should open on: the next prayer, so the widget
     * answers "how long until the next prayer?" before any swipe.
     *
     * Falls back to the first card when the next prayer is not itself a card —
     * the user can hide nothing obligatory, but [next] is null during
     * midnight sun, and a deck must still open somewhere.
     */
    fun initialIndex(cards: List<Card>, next: NextPrayer?): Int {
        if (next == null) return 0
        val index = cards.indexOfFirst { it.name == next.name }
        return if (index >= 0) index else 0
    }

    /**
     * Builds the deck for [now] from stored config. Returns an empty list when
     * no location is stored — the provider shows its prompt in that case and
     * the deck is hidden, so there is nothing to build.
     */
    fun build(ctx: Context, now: Date): List<Card> {
        val coords = PrayerConfig.coords(ctx) ?: return emptyList()
        val (lat, lng) = coords
        val method = PrayerConfig.method(ctx)
        val madhab = PrayerConfig.madhab(ctx)
        val tz = TimeZone.getDefault()

        val today = PrayerTimesEngine.timesFor(lat, lng, now, method, madhab, tz)
        val cal = Calendar.getInstance(tz)
        cal.time = now
        cal.add(Calendar.DAY_OF_YEAR, 1)
        val tomorrow = PrayerTimesEngine.timesFor(lat, lng, cal.time, method, madhab, tz)

        val timeFmt = SimpleDateFormat("HH:mm", Locale.US).apply { timeZone = tz }
        val visible = PrayerConfig.visibleTimes(ctx)
        val withTime = PrayerName.values()
            .filter { today.times[it] != null || tomorrow.times[it] != null }
            .toSet()

        // Ordered, but not truncated: a deck has a card per visible time, so
        // unlike the old fixed-slot layout nothing has to be cut. The ordering
        // still matters — it is the order the user swipes through.
        return PrayerWidgetProvider.selectForDisplay(visible, withTime).mapNotNull { name ->
            val millis = millisUntilNext(name, now, today, tomorrow) ?: return@mapNotNull null
            // Prefer today's clock time when it is still ahead, so the card
            // reads as today's timetable entry rather than tomorrow's.
            val at = today.times[name]?.takeIf { it.after(now) }
                ?: tomorrow.times[name]
                ?: return@mapNotNull null
            Card(
                name = name,
                label = PrayerWidgetProvider.nameLabel(ctx, name),
                clock = timeFmt.format(at),
                millisUntil = millis,
            )
        }
    }
}
