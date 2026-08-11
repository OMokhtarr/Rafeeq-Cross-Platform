package com.rafeeq.quranquiz

import android.os.Build
import android.os.Bundle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import com.getcapacitor.BridgeActivity
import com.rafeeq.quranquiz.auto.RafeeqAutoPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        registerPlugin(RafeeqAutoPlugin::class.java)
        // Allow MainActivity to show and run even when the phone is locked/screen-off.
        // Required for Android Auto cold-start: the service wakes this activity so the
        // WebView can initialise and start audio, but the phone screen may be locked.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                android.view.WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                android.view.WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
            )
        }
        super.onCreate(savedInstanceState)
        // Allow the WebView to autoplay audio without a user gesture.
        // Required so Android Auto car controls (which are not user gestures
        // from the WebView's perspective) can trigger el.play() successfully.
        bridge.webView.settings.mediaPlaybackRequiresUserGesture = false
        applyCappedTextZoom()
        enableEdgeToEdge()
    }

    /**
     * Honour the device font-size setting, but cap it.
     *
     * Android applies the system font scale to the WebView as `textZoom`
     * (100 = normal, up to ~200 with accessibility sizes). Every typography
     * token in the app is rem-based, so the whole UI multiplies by this value.
     * Past ~130% the dense Arabic mushaf and quiz layouts stop fitting, so we
     * clamp there: users who enlarged their text still get larger text in
     * Rafeeq, but layouts never reach the point where controls become
     * unreachable.
     *
     * Re-applied in onConfigurationChanged because the user can change the
     * font size while the app is running.
     */
    private fun applyCappedTextZoom() {
        val systemScale = resources.configuration.fontScale
        val cappedScale = systemScale.coerceIn(MIN_FONT_SCALE, MAX_FONT_SCALE)
        bridge.webView.settings.textZoom = (cappedScale * 100).toInt()
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        applyCappedTextZoom()
    }

    companion object {
        /** Never shrink below the designed size, even if the user picked "Small". */
        private const val MIN_FONT_SCALE = 1.0f

        /** Ceiling for text growth — beyond this, dense layouts break. */
        private const val MAX_FONT_SCALE = 1.3f
    }

    // API 36 tightened this signature: the Intent parameter is no longer nullable.
    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        // Re-apply show-when-locked when the activity is re-used (singleTask re-entry).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
    }

    override fun onResume() {
        super.onResume()
        // Keep WebView JS timers and audio running even when the activity goes
        // to background (Android Auto pushes MainActivity behind its UI).
        bridge.webView.resumeTimers()
        bridge.webView.onResume()
    }

    override fun onPause() {
        // Do NOT call webView.onPause() or webView.pauseTimers() — doing so would
        // throttle JS execution and suspend HTML5 audio the moment Android Auto
        // pushes MainActivity to the background.
        super.onPause()
    }

    /**
     * Both system bars are transparent, so their apparent colour is whatever
     * the app paints behind them (themed `--color-bg-app` on <body>).
     *
     * Icon/pill tint is NOT set here. The bars must follow the in-app day/night
     * toggle, which only the WebView knows about, so the JS side owns it via
     * Capacitor's SystemBars API (see useSystemBarsTheme.ts). Hardcoding the
     * light-icon appearance here would fight that hook and leave day mode with
     * white icons on a white background.
     *
     * The pre-WebView tint is handled by the SystemBars `style: "DARK"` entry
     * in capacitor.config.ts, which matches the night default; the hook then
     * corrects it if the user's stored theme is day.
     */
    private fun enableEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = android.graphics.Color.TRANSPARENT
        window.navigationBarColor = android.graphics.Color.TRANSPARENT

        // Android draws a translucent scrim behind a transparent navigation bar
        // to guarantee contrast against arbitrary content. Rafeeq controls the
        // colour underneath (solid black or solid white) and already guarantees
        // it, so the scrim only shows up as a mismatched grey band above the
        // gesture pill. Opt out so the bar truly matches the app background.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }
    }
}
