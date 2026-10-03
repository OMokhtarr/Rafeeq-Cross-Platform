package com.rafeeq.quranquiz.prayer

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Context
import android.content.res.ColorStateList
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.activity.addCallback
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.rafeeq.quranquiz.R
import java.text.SimpleDateFormat
import java.util.Date

/**
 * The full-screen ringing view, shown over the lock screen by the alarm
 * notification's full-screen intent.
 *
 * Native rather than a route in the WebView: it has to appear the instant a
 * locked phone wakes, with no app to load. It follows the app's own theme
 * and language, mirrored into [PrayerConfig], like the widget screens do.
 * Green (the brand's primary) marks the actions and the pulsing ring; gold
 * names the prayer, as gold does across the app.
 *
 * It only reflects [AlarmRingService]: it closes as soon as the service
 * stops ringing, however that happened.
 */
class AlarmRingActivity : AppCompatActivity() {

    private val handler = Handler(Looper.getMainLooper())
    private var pulse: AnimatorSet? = null
    private lateinit var timeView: TextView
    private lateinit var linesView: TextView

    private val onServiceChange: () -> Unit = {
        runOnUiThread { if (AlarmRingService.current == null) finish() else render() }
    }

    private val clockTick = object : Runnable {
        override fun run() {
            renderClock()
            handler.postDelayed(this, 1_000L)
        }
    }

    override fun attachBaseContext(newBase: Context) {
        val config = android.content.res.Configuration(newBase.resources.configuration)
        val locale = PrayerConfig.appLocale(newBase)
        config.setLocale(locale)
        config.setLayoutDirection(locale)
        super.attachBaseContext(newBase.createConfigurationContext(config))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        if (AlarmRingService.current == null) {
            finish()
            return
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        setContentView(R.layout.activity_alarm_ring)
        timeView = findViewById(R.id.alarm_time)
        linesView = findViewById(R.id.alarm_lines)
        paint()

        val root = findViewById<View>(R.id.alarm_root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        findViewById<Button>(R.id.alarm_stop).setOnClickListener {
            startService(AlarmRingService.commandIntent(this, AlarmRingService.ACTION_STOP))
        }
        findViewById<Button>(R.id.alarm_snooze).setOnClickListener {
            startService(AlarmRingService.commandIntent(this, AlarmRingService.ACTION_SNOOZE))
        }
        // Back does not dismiss a ringing alarm: Stop and Snooze are the only
        // ways out, as on a clock app, so a pocket press cannot silence it.
        onBackPressedDispatcher.addCallback(this) { }

        render()
        startPulse()
    }

    override fun onStart() {
        super.onStart()
        AlarmRingService.addListener(onServiceChange)
        handler.post(clockTick)
        // Stopped from the notification while this screen was hidden.
        if (AlarmRingService.current == null) finish()
    }

    override fun onStop() {
        AlarmRingService.removeListener(onServiceChange)
        handler.removeCallbacks(clockTick)
        super.onStop()
    }

    override fun onDestroy() {
        pulse?.cancel()
        super.onDestroy()
    }

    private val night get() = PrayerConfig.appNight(this)

    private fun paint() {
        val green = ContextCompat.getColor(this, R.color.colorPrimary)
        val bg = if (night) 0xFF111111.toInt() else 0xFFFFFFFF.toInt()
        val text = if (night) 0xFFE8E8E8.toInt() else 0xFF111111.toInt()
        val gold = if (night) 0xFFD4B48C.toInt() else 0xFFB8860B.toInt()
        val density = resources.displayMetrics.density

        findViewById<View>(R.id.alarm_root).setBackgroundColor(bg)
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = !night
            isAppearanceLightNavigationBars = !night
        }

        timeView.setTextColor(text)
        linesView.setTextColor(gold)

        findViewById<View>(R.id.alarm_pulse).background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor((green and 0x00FFFFFF) or 0x33000000)
            setStroke((3 * density).toInt(), green)
        }
        findViewById<View>(R.id.alarm_logo_ring).background = GradientDrawable().apply {
            shape = GradientDrawable.OVAL
            setColor(bg)
            setStroke((3 * density).toInt(), green)
        }

        findViewById<Button>(R.id.alarm_stop).apply {
            background = GradientDrawable().apply {
                cornerRadius = 28 * density
                setColor(green)
            }
            backgroundTintList = null
            setTextColor(0xFFFFFFFF.toInt())
        }
        findViewById<Button>(R.id.alarm_snooze).apply {
            background = GradientDrawable().apply {
                cornerRadius = 28 * density
                setColor(android.graphics.Color.TRANSPARENT)
                setStroke((2 * density).toInt(), green)
            }
            backgroundTintList = null
            setTextColor(ColorStateList.valueOf(text))
            val minutes = PrayerAlarmConfig.settings(this@AlarmRingActivity).snoozeMinutes
            this.text = getString(R.string.alarm_snooze_for, minutes)
        }
    }

    private fun render() {
        val ringing = AlarmRingService.current ?: return
        linesView.text = AlarmText.ringLines(this, ringing.ids, ringing.prayerAts).joinToString("\n")
        renderClock()
    }

    private fun renderClock() {
        val pattern = if (PrayerConfig.use24Hour(this)) "H:mm" else "h:mm"
        timeView.text = SimpleDateFormat(pattern, PrayerConfig.appLocale(this)).format(Date())
    }

    /** A slow green ring breathing out from the logo. Animator durations
     *  follow the system's animation scale, so "remove animations" stills it. */
    private fun startPulse() {
        val ring = findViewById<View>(R.id.alarm_pulse)
        fun loop(prop: String, from: Float, to: Float) =
            ObjectAnimator.ofFloat(ring, prop, from, to).apply {
                repeatCount = ValueAnimator.INFINITE
                duration = 1_600L
            }
        pulse = AnimatorSet().apply {
            playTogether(loop("scaleX", 1f, 1.35f), loop("scaleY", 1f, 1.35f), loop("alpha", 0.9f, 0f))
            start()
        }
    }
}
