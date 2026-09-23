package com.rafeeq.quranquiz.prayer

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.os.Build
import android.widget.RemoteViews
import android.widget.RemoteViewsService
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Backs the widget's prayer cards.
 *
 * The widget shows one card at a time in an `AdapterViewFlipper`, stepped by
 * the arrows either side of it. A flipper is still a collection view, so its
 * children come from a bound `RemoteViewsFactory` rather than from views the
 * provider sets directly — which is why this service exists.
 *
 * The widget id rides in on the binding intent so each widget's cards can be
 * styled from its own stored appearance; two widgets on the same home screen
 * are independent.
 *
 * Like [PrayerWidgetProvider] this reads [PrayerTimesEngine] and
 * [PrayerConfig] directly and never a cache written by the app: the launcher
 * has no WebView, and the cards must be right after a reboot and on a day the
 * app was never opened.
 */
class PrayerDeckService : RemoteViewsService() {

    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory =
        PrayerDeckFactory(
            applicationContext,
            intent.getIntExtra(
                AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID,
            ),
        )
}

/**
 * One card per visible time, in [PrayerWidgetProvider.SLOT_PRIORITY] order.
 *
 * The cards are built once per `onDataSetChanged` — which the provider
 * triggers on every refresh — and held in memory, because `getViewAt` is
 * called by the launcher on a binder thread and must not recompute prayer
 * times per card.
 */
internal class PrayerDeckFactory(
    private val ctx: Context,
    private val widgetId: Int,
) : RemoteViewsService.RemoteViewsFactory {

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

        // The timer is not on the card: it lives on the strip, set by
        // PrayerWidgetProvider from whichever card is showing. A card is just
        // the prayer's name and its time.
        //
        // Per widget, so two widgets can be styled differently. The card sits
        // on the accent block, so its text takes the accent's own contrast
        // colour rather than the strip's.
        val look = PrayerWidgetConfig.appearance(ctx, widgetId)

        // Tint the card's shape drawable rather than replacing it.
        // `setBackgroundColor` was called here unconditionally, which swapped
        // the 18dp-rounded drawable for a flat fill — so every card rendered
        // with square corners, not only a configured one.
        //
        // Below API 31 there is no per-widget drawable tint, so the card
        // keeps the layout's rounded drawable and forgoes the accent. The
        // rounded block is what the card *is*, and the accent is a
        // preference; losing the shape to honour it is the wrong trade.
        //
        // The text colour follows the same branch. The day and night card
        // drawables are near-opposite (#F2E7D5 against #33302A) and this
        // factory cannot tell which variant the launcher inflated, so where
        // the tint did not land it leaves the layouts' own declared colours
        // alone rather than guessing a contrast.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setColorStateList(
                R.id.card_root,
                "setBackgroundTintList",
                ColorStateList.valueOf(look.accentColor),
            )
            val onAccent = PrayerWidgetConfig.contrastOn(look.accentColor)
            views.setTextColor(R.id.card_name, onAccent)
            views.setTextColor(R.id.card_time, onAccent)
        }

        // The card's text is the same size as the strip's around it: the two
        // sit side by side on one row, and a card set smaller reads as a
        // different, lesser element rather than as part of the same widget.
        // The card is made compact by its padding, not by its type.
        //
        // A step above the strip's own text. Each line is then measured
        // against the card's fixed inner width with the real font and brought
        // down only as far as it must — so a long name at a large font setting
        // shrinks instead of being cut, without dragging the time with it.
        val cardSp = look.fontSp + CARD_SP_BOOST
        val res = ctx.resources
        val innerPx = res.getDimension(R.dimen.widget_card_width) -
            2 * res.getDimension(R.dimen.widget_card_padding_h)
        // Each line may take half the inner height, less half the 2dp gap,
        // so a large font setting cannot push the time out of the box.
        val lineHeightPx = (
            res.getDimension(R.dimen.widget_card_height) -
                2 * res.getDimension(R.dimen.widget_card_padding_v) -
                2 * res.displayMetrics.density
            ) / 2
        views.setTextViewTextSize(
            R.id.card_name,
            android.util.TypedValue.COMPLEX_UNIT_SP,
            fitSp(cardSp, card.label, innerPx, lineHeightPx).toFloat(),
        )
        views.setTextViewTextSize(
            R.id.card_time,
            android.util.TypedValue.COMPLEX_UNIT_SP,
            fitSp(cardSp, card.clock, innerPx, lineHeightPx).toFloat(),
        )

        // No runtime resizing: every card is the same fixed width (fitting
        // the longest label at the default size) and its text's natural
        // height. The flipper sizes its slot from the item's own layout, so a
        // size set here was ignored by the slot and the card was cropped, its
        // rounded corners cut flat. One size for every card leaves nothing
        // for the slot to disagree with.

        // Fills in the deck's template, which opens this widget's appearance
        // screen (see PrayerWidgetProvider.render). The template already
        // carries everything; the card only has to say it is tappable.
        views.setOnClickFillInIntent(R.id.card_root, Intent())

        return views
    }

    /**
     * The largest size, from [maxSp] down, at which [text] fits [widthPx]
     * and one line of it fits [heightPx], in the card's bold face. Measured with the device's own font and font
     * scale, so it holds for Arabic and English alike.
     */
    private fun fitSp(maxSp: Int, text: String, widthPx: Float, heightPx: Float): Int {
        val paint = android.text.TextPaint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
            typeface = android.graphics.Typeface.DEFAULT_BOLD
        }
        val metrics = ctx.resources.displayMetrics
        // A small margin for the launcher's font differing from the app's.
        val limit = widthPx * FIT_SAFETY
        for (sp in maxSp downTo PrayerWidgetConfig.MIN_FONT_SP) {
            paint.textSize = android.util.TypedValue.applyDimension(
                android.util.TypedValue.COMPLEX_UNIT_SP,
                sp.toFloat(),
                metrics,
            )
            // The lines have includeFontPadding off, so one is exactly
            // descent − ascent tall.
            val lineHeight = paint.descent() - paint.ascent()
            if (paint.measureText(text) <= limit && lineHeight <= heightPx) return sp
        }
        return PrayerWidgetConfig.MIN_FONT_SP
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = true

    private companion object {
        /** How far above the strip's text size the card's text is set. */
        const val CARD_SP_BOOST = 3

        /** Share of the card's inner width text may fill, for font drift. */
        const val FIT_SAFETY = 0.94f
    }
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
        /** True while the prayer is inside its elapsed window, so the timer
         *  counts up from its time rather than down to it. */
        val countingUp: Boolean,
    )

    /**
     * How long a prayer stays "current" after its time, counting up instead of
     * counting down to the next one.
     *
     * The window is the period in which the prayer is still being performed,
     * so the widget answers "how long since the adhan?" rather than jumping
     * straight to the next prayer. Maghrib's window is shortest because its
     * time is itself short; Fajr and Duha are given longer.
     */
    fun elapsedWindowMillis(name: PrayerName): Long = when (name) {
        PrayerName.MAGHRIB -> 10L * 60_000L
        PrayerName.FAJR, PrayerName.DUHA -> 25L * 60_000L
        else -> 20L * 60_000L
    }

    /**
     * The next moment any card changes state, strictly after [now].
     *
     * A card changes at two instants per time: when the time itself arrives
     * (the countdown ends and the card starts counting up) and when its
     * elapsed window closes (the card rolls on to tomorrow's entry, and the
     * deck's default card moves to the next prayer). Between those instants
     * the system ticks the Chronometer on its own, so these are the only
     * moments the widget needs re-rendering.
     *
     * Without a refresh at these instants the Chronometer counts straight
     * through zero into negative numbers, which is what a widget did at
     * Maghrib with reminders switched off: the only per-prayer alarm was the
     * reminder, and that one is skipped entirely when reminders are off.
     *
     * Pure over its arguments, like [timerFor], so it is testable on the JVM.
     */
    fun nextBoundary(now: Date, today: DayTimes, tomorrow: DayTimes): Date? =
        listOf(today, tomorrow)
            .flatMap { day ->
                day.times.flatMap { (name, at) ->
                    if (at == null) emptyList()
                    else listOf(at.time, at.time + elapsedWindowMillis(name))
                }
            }
            .filter { it > now.time }
            .minOrNull()
            ?.let { Date(it) }

    /**
     * What a card's timer should show: time remaining until the prayer, or
     * time elapsed since it if it started within its window.
     *
     * [millis] is always positive and [countingUp] says which way to read it,
     * because `Chronometer` cannot render a negative and would otherwise climb
     * from a meaningless number.
     */
    data class Timer(val millis: Long, val countingUp: Boolean)

    /**
     * The timer for [name] given today's and tomorrow's times.
     *
     * Three cases, in order: inside the window just after the prayer, count
     * *up* from it; still ahead today, count down to it; otherwise count down
     * to tomorrow's occurrence. The elapsed case is checked first because a
     * prayer that has just passed is still the one the user cares about.
     *
     * Returns null when neither day has a time for the name (the midnight-sun
     * window), so the caller can drop the card rather than invent a target.
     */
    fun timerFor(name: PrayerName, now: Date, today: DayTimes, tomorrow: DayTimes): Timer? {
        val todayAt = today.times[name]
        if (todayAt != null) {
            val since = now.time - todayAt.time
            if (since in 0 until elapsedWindowMillis(name)) {
                return Timer(since, countingUp = true)
            }
            if (todayAt.after(now)) return Timer(todayAt.time - now.time, countingUp = false)
        }
        val tomorrowAt = tomorrow.times[name] ?: return null
        return Timer(tomorrowAt.time - now.time, countingUp = false)
    }

    /**
     * Which card the deck should open on.
     *
     * A prayer inside its elapsed window wins: it has just been called, so it
     * is the one the user is thinking about, and skipping straight to the next
     * prayer would hide the "how long since the adhan?" the window exists to
     * answer. Only when no card is counting up does this fall back to [next].
     *
     * Falls back to the first card when the next prayer is not itself a card —
     * the user can hide nothing obligatory, but [next] is null during
     * midnight sun, and a deck must still open somewhere.
     */
    fun initialIndex(cards: List<Card>, next: NextPrayer?): Int {
        val elapsed = cards.indexOfFirst { it.countingUp }
        if (elapsed >= 0) return elapsed
        if (next == null) return 0
        val index = cards.indexOfFirst { it.name == next.name }
        return if (index >= 0) index else 0
    }

    /**
     * Builds the deck for [now] from stored config. Returns an empty list when
     * no location is stored — the provider shows its prompt in that case and
     * the deck is hidden, so there is nothing to build.
     */
    /**
     * The clock format the widget renders times in, honouring the user's
     * 12/24-hour choice.
     *
     * The 12-hour form carries no am/pm marker. The card sits between the
     * arrows on a 4x1 strip, and the marker widened it enough to push the
     * date line beside it into an ellipsis. A prayer's name already says
     * which half of the day it falls in, so the marker told the reader
     * nothing the card did not.
     */
    fun clockFormat(ctx: Context, tz: TimeZone): SimpleDateFormat =
        SimpleDateFormat(clockPattern(PrayerConfig.use24Hour(ctx)), PrayerConfig.widgetLocale())
            .apply { timeZone = tz }

    /** Split from [clockFormat] so the pattern itself is reachable from a
     *  JVM test — the format object needs a Context, the choice does not. */
    fun clockPattern(use24Hour: Boolean): String =
        if (use24Hour) "HH:mm" else "h:mm"

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

        val timeFmt = clockFormat(ctx, tz)
        val visible = PrayerConfig.visibleTimes(ctx)
        val withTime = PrayerName.values()
            .filter { today.times[it] != null || tomorrow.times[it] != null }
            .toSet()

        // Ordered, but not truncated: a deck has a card per visible time, so
        // unlike the old fixed-slot layout nothing has to be cut. The ordering
        // still matters — it is the order the user swipes through.
        return PrayerWidgetProvider.selectForDisplay(visible, withTime).mapNotNull { name ->
            val timer = timerFor(name, now, today, tomorrow) ?: return@mapNotNull null
            // Today's clock time while it is still ahead OR inside its elapsed
            // window — in both cases the card is about today's entry, not
            // tomorrow's. Only once the window has closed does it roll over.
            val at = today.times[name]?.takeIf {
                it.after(now) || now.time - it.time < elapsedWindowMillis(name)
            } ?: tomorrow.times[name] ?: return@mapNotNull null
            Card(
                name = name,
                label = PrayerWidgetProvider.nameLabel(ctx, name),
                clock = timeFmt.format(at),
                millisUntil = timer.millis,
                countingUp = timer.countingUp,
            )
        }
    }
}
