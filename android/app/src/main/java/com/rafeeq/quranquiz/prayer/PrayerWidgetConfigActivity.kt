package com.rafeeq.quranquiz.prayer

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.Chronometer
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RadioGroup
import android.widget.SeekBar
import android.widget.TextView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The widget's appearance settings.
 *
 * Opened by the launcher when the widget is placed (it is declared with
 * `ACTION_APPWIDGET_CONFIGURE`) and again from the prayer times page, so a
 * widget can be restyled without removing and re-adding it.
 *
 * Settings are stored per widget id: two widgets on the same home screen are
 * independent, and one may be transparent over a photo wallpaper while
 * another sits opaque in a dock.
 *
 * The preview at the top inflates the *real* widget layout and paints it from
 * the same values, so it cannot drift from what the home screen shows. It
 * sits on a checkerboard because a transparent widget over a plain colour
 * would read as that colour rather than as transparent.
 */
class PrayerWidgetConfigActivity : Activity() {

    private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    /** null = follow the device theme. */
    private var background: Int? = null
    private var textColor: Int? = null
    private var accent = PrayerWidgetConfig.DEFAULT_ACCENT

    private lateinit var bgSwatches: LinearLayout
    private lateinit var textSwatches: LinearLayout
    private lateinit var accentSwatches: LinearLayout
    private lateinit var transparency: SeekBar
    private lateinit var transparencyValue: TextView
    private lateinit var font: SeekBar
    private lateinit var fontValue: TextView
    private lateinit var preview: View
    private lateinit var timeFormat: RadioGroup

    /**
     * The widget's own resources, in the device language. The preview shows
     * the widget as it will look on the home screen, so its labels follow the
     * device like the widget does — while the rest of this screen, being part
     * of the app, follows the app's language (see [attachBaseContext]).
     */
    private val widgetRes by lazy {
        val config = android.content.res.Configuration(resources.configuration)
        config.setLocale(PrayerConfig.widgetLocale())
        createConfigurationContext(config).resources
    }

    // This screen is part of the app, so it speaks the app's language rather
    // than the device's. The web layer mirrors that language into
    // PrayerConfig, as it does the theme.
    override fun attachBaseContext(newBase: Context) {
        val config = android.content.res.Configuration(newBase.resources.configuration)
        val locale = PrayerConfig.appLocale(newBase)
        config.setLocale(locale)
        config.setLayoutDirection(locale)
        super.attachBaseContext(newBase.createConfigurationContext(config))
    }

    /**
     * singleTop: repeated double taps on a widget land here instead of
     * stacking copies of the screen. A tap on a different widget swaps the
     * screen over to that widget.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val id = intent.getIntExtra(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        )
        if (id != AppWidgetManager.INVALID_APPWIDGET_ID && id != widgetId) {
            setIntent(intent)
            recreate()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        // Before super.onCreate: the window is created there, and a theme set
        // afterwards does not reach it.
        //
        // Rafeeq's theme is its own stored preference rather than the
        // device's, so this reads the value the web layer mirrors into
        // PrayerConfig instead of using a DayNight parent — which would
        // follow the device and leave this screen white inside a dark app.
        setTheme(
            if (PrayerConfig.appNight(this)) R.style.WidgetConfigTheme_Night
            else R.style.WidgetConfigTheme_Day
        )
        super.onCreate(savedInstanceState)

        // Assume cancelled: the launcher deletes a widget whose configuration
        // activity finishes without RESULT_OK, so backing out of this screen
        // must not leave a half-configured widget on the home screen.
        setResult(RESULT_CANCELED)

        widgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID,
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID

        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }

        setContentView(R.layout.widget_prayer_config)

        // The window is edge to edge, so the screen pads itself clear of the
        // status and navigation bars. Without this the preview sat under the
        // status bar and the Save button under the gesture bar.
        val root = findViewById<View>(R.id.config_root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        bgSwatches = findViewById(R.id.config_bg_swatches)
        textSwatches = findViewById(R.id.config_text_swatches)
        accentSwatches = findViewById(R.id.config_accent_swatches)
        transparency = findViewById(R.id.config_transparency)
        transparencyValue = findViewById(R.id.config_transparency_value)
        font = findViewById(R.id.config_font)
        fontValue = findViewById(R.id.config_font_value)
        // The included layout's own root. There is no id on the <include>
        // itself, because one there would replace this id rather than sit
        // above it — see widget_prayer_config.xml.
        preview = findViewById(R.id.widget_root)

        val look = PrayerWidgetConfig.appearance(this, widgetId)
        background = look.background
        textColor = look.textColor
        accent = look.accentColor

        transparency.progress = look.transparency
        transparency.setOnSeekBarChangeListener(onSeek { refresh() })

        // The SeekBar is 0-based, so the stored sp range is shifted onto it
        // rather than exposing sizes below MIN_FONT_SP as a dead left edge.
        font.max = PrayerWidgetConfig.MAX_FONT_SP - PrayerWidgetConfig.MIN_FONT_SP
        font.progress = look.fontSp - PrayerWidgetConfig.MIN_FONT_SP
        font.setOnSeekBarChangeListener(onSeek { refresh() })

        timeFormat = findViewById(R.id.config_time_format)
        timeFormat.check(
            if (PrayerConfig.use24Hour(this)) R.id.config_time_24 else R.id.config_time_12
        )
        timeFormat.setOnCheckedChangeListener { _, _ -> refresh() }

        findViewById<Button>(R.id.config_save).setOnClickListener { save() }
        findViewById<Button>(R.id.config_reset).setOnClickListener { reset() }

        refresh()
    }

    private fun onSeek(onChange: () -> Unit) = object : SeekBar.OnSeekBarChangeListener {
        override fun onProgressChanged(bar: SeekBar, value: Int, fromUser: Boolean) = onChange()
        override fun onStartTrackingTouch(bar: SeekBar) = Unit
        override fun onStopTrackingTouch(bar: SeekBar) = Unit
    }

    /** The current font size in sp, mapped back off the 0-based SeekBar. */
    private fun currentFontSp() = font.progress + PrayerWidgetConfig.MIN_FONT_SP

    /** Repaints every control and the preview from the working values. */
    private fun refresh() {
        transparencyValue.text = getString(R.string.widget_config_percent, transparency.progress)
        fontValue.text = getString(R.string.widget_config_sp, currentFontSp())

        fillSwatches(bgSwatches, R.string.widget_config_background, SURFACES, background, allowAuto = true) {
            background = it
        }
        fillSwatches(textSwatches, R.string.widget_config_text_color, INKS, textColor, allowAuto = true) {
            textColor = it
        }
        fillSwatches(accentSwatches, R.string.widget_config_accent, ACCENTS, accent, allowAuto = false) {
            accent = it ?: PrayerWidgetConfig.DEFAULT_ACCENT
        }

        renderPreview()
    }

    /**
     * Paints the preview with the values currently on screen.
     *
     * Deliberately mirrors PrayerWidgetProvider.applyAppearance rather than
     * calling it: that one speaks RemoteViews, this one has real Views. The
     * duplication is the price of a preview that updates as the sliders move;
     * the two are kept honest by both reading the same Appearance fields.
     */
    private fun renderPreview() {
        val look = working()
        // The same fallbacks the widget uses: Rafeeq's own day/night theme,
        // not a fixed dark surface, so an unconfigured preview matches the
        // unconfigured widget.
        val surface = look.background ?: PrayerWidgetProvider.defaultBackground(this)
        val text = look.textColor ?: PrayerWidgetProvider.baseTextColor(this)

        // preview IS widget_root, so it is painted directly rather than
        // searched for inside itself.
        //
        // Tinted, not `setBackgroundColor`: that replaced the rounded shape
        // drawable with a flat fill and squared the preview's corners, which
        // then disagreed with the widget it is supposed to be previewing.
        // This is an ordinary View rather than RemoteViews, so the tint
        // needs no API guard here.
        preview.backgroundTintList = ColorStateList.valueOf(
            PrayerWidgetConfig.withTransparency(surface, look.transparency),
        )

        val tz = TimeZone.getDefault()
        val now = Date()
        val dateFmt = SimpleDateFormat("EEE, d MMM", PrayerConfig.widgetLocale()).apply { timeZone = tz }
        // The strip's own formatter, so the preview cannot drift from the
        // widget it previews — it used to format the Hijri date itself, and
        // kept the year after the widget dropped it.
        val hijri = PrayerWidgetProvider.hijriLabel(now, tz, withYear = false)

        preview.findViewById<TextView>(R.id.widget_date).apply {
            this.text = "${dateFmt.format(now)} • $hijri"
            setTextColor(text)
            textSize = look.fontSp.toFloat()
        }
        preview.findViewById<TextView>(R.id.widget_place).apply {
            this.text = PrayerConfig.placeName(this@PrayerWidgetConfigActivity)
                ?: widgetRes.getString(R.string.widget_config_sample_place)
            setTextColor(text)
            textSize = look.fontSp.toFloat()
        }
        preview.findViewById<Chronometer>(R.id.widget_timer).apply {
            setTextColor(text)
            textSize = look.fontSp.toFloat()
        }

        listOf(R.id.widget_icon_date, R.id.widget_icon_place, R.id.widget_prev, R.id.widget_next)
            .forEach { id -> preview.findViewById<ImageView>(id).setColorFilter(text) }

        // The flipper cannot be used here: a collection view needs a bound
        // RemoteViewsService, which an ordinary Activity does not get. So it
        // is hidden and a real card layout is inflated in its place — same
        // XML the deck factory uses, painted the same way, so the accent
        // colour previews truthfully instead of being left to the imagination.
        preview.findViewById<View>(R.id.widget_deck).visibility = View.GONE

        val holder = preview.findViewById<LinearLayout>(R.id.config_preview_card)
        holder.removeAllViews()
        val card = layoutInflater.inflate(R.layout.widget_prayer_card, holder, false)
        card.backgroundTintList = ColorStateList.valueOf(look.accentColor)
        val onAccent = PrayerWidgetConfig.contrastOn(look.accentColor)
        card.findViewById<TextView>(R.id.card_name).apply {
            this.text = widgetRes.getString(R.string.prayer_widget_name_maghrib)
            setTextColor(onAccent)
            textSize = (look.fontSp + 3).toFloat()
        }
        card.findViewById<TextView>(R.id.card_time).apply {
            // In the clock chosen below, and at the card's single text size —
            // both as the real card renders it.
            this.text = SimpleDateFormat(PrayerDeck.clockPattern(use24Hour()), PrayerConfig.widgetLocale())
                .format(SAMPLE_TIME)
            setTextColor(onAccent)
            textSize = (look.fontSp + 3).toFloat()
        }
        holder.addView(card)
    }

    private fun use24Hour() = timeFormat.checkedRadioButtonId == R.id.config_time_24

    private fun working() = PrayerWidgetConfig.Appearance(
        background = background,
        transparency = transparency.progress,
        textColor = textColor,
        accentColor = accent,
        fontSp = currentFontSp(),
    )

    /**
     * Fills [row] with one swatch per option, the [selected] one ringed.
     *
     * The swatches sit on the page itself: a tap applies the colour at once
     * and the preview above follows, with no dialog between the choice and
     * seeing it. Rebuilt on every refresh so the ring always marks the
     * current choice.
     *
     * With [allowAuto], the first swatch is "follow the app theme": hollow,
     * because no single colour honestly stands for it.
     */
    private fun fillSwatches(
        row: LinearLayout,
        labelRes: Int,
        colors: List<Int>,
        selected: Int?,
        allowAuto: Boolean,
        onPick: (Int?) -> Unit,
    ) {
        row.removeAllViews()
        val options: List<Int?> = if (allowAuto) listOf(null) + colors else colors
        val density = resources.displayMetrics.density
        val size = (40 * density).toInt()
        val gap = (10 * density).toInt()

        options.forEach { color ->
            val chosen = color == selected
            val view = ImageView(this)
            view.layoutParams = LinearLayout.LayoutParams(size, size).apply {
                marginEnd = gap
            }
            view.setImageDrawable(
                GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(color ?: Color.TRANSPARENT)
                    setStroke(
                        ((if (chosen) 3.5f else 1.5f) * density).toInt(),
                        if (chosen) SELECTED_RING else Color.GRAY,
                    )
                },
            )
            val name = if (color == null) {
                getString(R.string.widget_config_auto)
            } else {
                String.format("#%06X", 0xFFFFFF and color)
            }
            view.contentDescription = "${getString(labelRes)}: $name"
            view.isSelected = chosen
            view.setOnClickListener {
                onPick(color)
                refresh()
            }
            row.addView(view)
        }
    }

    private fun save() {
        PrayerWidgetConfig.setAppearance(this, widgetId, working())
        val formatChanged = use24Hour() != PrayerConfig.use24Hour(this)
        PrayerConfig.setUse24Hour(this, use24Hour())
        // The clock is global, so a change repaints every widget; otherwise
        // only this one has changed.
        if (formatChanged) PrayerWidgetProvider.refresh(this)
        else PrayerWidgetProvider.refreshOne(this, widgetId)

        setResult(
            RESULT_OK,
            Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId),
        )
        finish()
    }

    /** Back to the unconfigured look: device theme, opaque, app gold. */
    private fun reset() {
        background = null
        textColor = null
        accent = PrayerWidgetConfig.DEFAULT_ACCENT
        transparency.progress = 0
        font.progress = PrayerWidgetConfig.DEFAULT_FONT_SP - PrayerWidgetConfig.MIN_FONT_SP
        refresh()
    }

    private companion object {
        val SELECTED_RING = PrayerWidgetConfig.DEFAULT_ACCENT

        /** Stand-in on the preview card: 18:51. A fixed moment rather than a
         *  real prayer — the preview is about colour, size and clock, and a
         *  real time would need a stored location it may not have. Late
         *  enough in the day that the 12- and 24-hour forms differ. */
        val SAMPLE_TIME: Date = java.util.Calendar.getInstance().apply {
            set(java.util.Calendar.HOUR_OF_DAY, 18)
            set(java.util.Calendar.MINUTE, 51)
        }.time

        /** Backgrounds: the two theme surfaces plus a few neutrals that read
         *  well behind text at partial transparency. */
        val SURFACES = listOf(
            0xFFFFFFFF.toInt(),
            0xFF1A1A1A.toInt(),
            0xFF000000.toInt(),
            0xFF2B3A34.toInt(),
            0xFFF2E7D5.toInt(),
        )

        val INKS = listOf(
            0xFFFFFFFF.toInt(),
            0xFF000000.toInt(),
            0xFFD4B48C.toInt(),
            0xFF9E9E9E.toInt(),
        )

        val ACCENTS = listOf(
            PrayerWidgetConfig.DEFAULT_ACCENT,
            0xFFDCE4FA.toInt(),
            0xFF2B3A34.toInt(),
            0xFFFFFFFF.toInt(),
            0xFF1A1A1A.toInt(),
        )
    }
}
