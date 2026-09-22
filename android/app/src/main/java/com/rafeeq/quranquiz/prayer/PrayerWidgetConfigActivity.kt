package com.rafeeq.quranquiz.prayer

import android.app.Activity
import android.app.AlertDialog
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.Chronometer
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.SeekBar
import android.widget.TextView
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.time.ZoneId
import java.time.chrono.HijrahDate
import java.time.format.DateTimeFormatter
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

    private lateinit var bgDot: ImageView
    private lateinit var textDot: ImageView
    private lateinit var accentDot: ImageView
    private lateinit var transparency: SeekBar
    private lateinit var transparencyValue: TextView
    private lateinit var font: SeekBar
    private lateinit var fontValue: TextView
    private lateinit var preview: View

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

        bgDot = findViewById(R.id.config_bg_dot)
        textDot = findViewById(R.id.config_text_dot)
        accentDot = findViewById(R.id.config_accent_dot)
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

        findViewById<LinearLayout>(R.id.config_bg_row).setOnClickListener {
            pickColor(R.string.widget_config_background, SURFACES, background, allowAuto = true) {
                background = it
                refresh()
            }
        }
        findViewById<LinearLayout>(R.id.config_text_row).setOnClickListener {
            pickColor(R.string.widget_config_text_color, INKS, textColor, allowAuto = true) {
                textColor = it
                refresh()
            }
        }
        findViewById<LinearLayout>(R.id.config_accent_row).setOnClickListener {
            pickColor(R.string.widget_config_accent, ACCENTS, accent, allowAuto = false) {
                accent = it ?: PrayerWidgetConfig.DEFAULT_ACCENT
                refresh()
            }
        }

        transparency.progress = look.transparency
        transparency.setOnSeekBarChangeListener(onSeek { refresh() })

        // The SeekBar is 0-based, so the stored sp range is shifted onto it
        // rather than exposing sizes below MIN_FONT_SP as a dead left edge.
        font.max = PrayerWidgetConfig.MAX_FONT_SP - PrayerWidgetConfig.MIN_FONT_SP
        font.progress = look.fontSp - PrayerWidgetConfig.MIN_FONT_SP
        font.setOnSeekBarChangeListener(onSeek { refresh() })

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

        bgDot.setImageDrawable(dot(background))
        textDot.setImageDrawable(dot(textColor))
        accentDot.setImageDrawable(dot(accent))

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
        val text = look.textColor ?: PrayerWidgetConfig.contrastOn(
            look.background ?: DEFAULT_SURFACE,
        )

        // preview IS widget_root, so it is painted directly rather than
        // searched for inside itself.
        //
        // Tinted, not `setBackgroundColor`: that replaced the rounded shape
        // drawable with a flat fill and squared the preview's corners, which
        // then disagreed with the widget it is supposed to be previewing.
        // This is an ordinary View rather than RemoteViews, so the tint
        // needs no API guard here.
        preview.backgroundTintList = ColorStateList.valueOf(
            PrayerWidgetConfig.withTransparency(
                look.background ?: DEFAULT_SURFACE,
                look.transparency,
            ),
        )

        val tz = TimeZone.getDefault()
        val now = Date()
        val dateFmt = SimpleDateFormat("EEE, d MMM", Locale.US).apply { timeZone = tz }
        val hijri = DateTimeFormatter.ofPattern("d MMM yyyy", Locale.US)
            .format(HijrahDate.from(now.toInstant().atZone(ZoneId.systemDefault()).toLocalDate()))

        preview.findViewById<TextView>(R.id.widget_date).apply {
            this.text = "${dateFmt.format(now)} • $hijri"
            setTextColor(text)
            textSize = look.fontSp.toFloat()
        }
        preview.findViewById<TextView>(R.id.widget_place).apply {
            this.text = PrayerConfig.placeName(this@PrayerWidgetConfigActivity)
                ?: getString(R.string.widget_config_sample_place)
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
            this.text = getString(R.string.prayer_widget_name_maghrib)
            setTextColor(onAccent)
            textSize = look.fontSp.toFloat()
        }
        card.findViewById<TextView>(R.id.card_time).apply {
            this.text = SAMPLE_TIME
            setTextColor(onAccent)
            textSize = (look.fontSp + 2).toFloat()
        }
        holder.addView(card)
    }

    private fun working() = PrayerWidgetConfig.Appearance(
        background = background,
        transparency = transparency.progress,
        textColor = textColor,
        accentColor = accent,
        fontSp = currentFontSp(),
    )

    /**
     * A circle filled with [color], or hollow when null — "follow the device
     * theme" has no one colour that honestly represents it.
     */
    private fun dot(color: Int?): GradientDrawable = GradientDrawable().apply {
        shape = GradientDrawable.OVAL
        setColor(color ?: Color.TRANSPARENT)
        setStroke((1.5f * resources.displayMetrics.density).toInt(), Color.GRAY)
    }

    /**
     * A dialog of swatches for one setting.
     *
     * A grid of circles rather than a full HSV picker: the widget needs
     * "dark, light, or the app's gold", and a hue wheel is a lot of surface
     * for that.
     */
    private fun pickColor(
        titleRes: Int,
        colors: List<Int>,
        selected: Int?,
        allowAuto: Boolean,
        onPick: (Int?) -> Unit,
    ) {
        val options: List<Int?> = if (allowAuto) listOf(null) + colors else colors

        val density = resources.displayMetrics.density
        val pad = (20 * density).toInt()
        val row = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(pad, pad, pad, pad)
        }

        val dialog = AlertDialog.Builder(this).setTitle(titleRes).setView(row).create()

        val size = (46 * density).toInt()
        val margin = (6 * density).toInt()
        options.forEach { color ->
            val view = ImageView(this)
            view.layoutParams = LinearLayout.LayoutParams(size, size).apply {
                marginEnd = margin
            }
            view.setImageDrawable(
                GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(color ?: Color.TRANSPARENT)
                    setStroke(
                        ((if (color == selected) 3.5f else 1.5f) * density).toInt(),
                        if (color == selected) SELECTED_RING else Color.GRAY,
                    )
                },
            )
            view.contentDescription = if (color == null) {
                getString(R.string.widget_config_auto)
            } else {
                String.format("#%06X", 0xFFFFFF and color)
            }
            view.setOnClickListener {
                onPick(color)
                dialog.dismiss()
            }
            row.addView(view)
        }

        dialog.show()
    }

    private fun save() {
        PrayerWidgetConfig.setAppearance(this, widgetId, working())
        PrayerWidgetProvider.refreshOne(this, widgetId)

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
        val SELECTED_RING = 0xFF3F8F6F.toInt()

        /** What the preview stands on when no background has been chosen. */
        val DEFAULT_SURFACE = 0xFF1A1A1A.toInt()

        /** Stand-in on the preview card. A fixed string rather than a real
         *  time: the preview is about colour and size, and computing a real
         *  prayer here would need a stored location it may not have. */
        const val SAMPLE_TIME = "18:51"

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
