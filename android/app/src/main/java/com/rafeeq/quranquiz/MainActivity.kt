package com.rafeeq.quranquiz

import android.os.Build
import android.os.Bundle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
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
        // Re-assert the safe-area variables: a reload replaces the document and
        // wipes the inline properties set on documentElement. No-op on 15+,
        // where the listener is never registered.
        ViewCompat.requestApplyInsets(window.decorView)
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
        injectSafeAreaInsetsBelowApi35()

        // Android draws a translucent scrim behind a transparent navigation bar
        // to guarantee contrast against arbitrary content. Rafeeq controls the
        // colour underneath (solid black or solid white) and already guarantees
        // it, so the scrim only shows up as a mismatched grey band above the
        // gesture pill. Opt out so the bar truly matches the app background.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isNavigationBarContrastEnforced = false
        }
    }

    /**
     * Supply `--rfq-safe-area-inset-*` on Android 14 and below.
     *
     * Capacitor's SystemBars plugin (bundled in @capacitor/android core, see
     * `com.getcapacitor.plugin.SystemBars`) owns `--safe-area-inset-*`, but only
     * reads real insets on Android 15+. Below VANILLA_ICE_CREAM its listener
     * takes the non-passthrough branch, which explicitly rebuilds the insets as
     * `Insets.of(0, 0, 0, 0)` and then calls `injectSafeAreaCSS` with those
     * zeros. `env(safe-area-inset-top)` does not cover the gap either: on
     * Android WebView that reflects the display cutout only, and only on WebView
     * builds new enough for the passthrough branch. So on ≤14 both halves of the
     * CSS `max(var(...), env(...))` resolve to 0.
     *
     * Most pages absorb that because ion-content still applies its own padding,
     * but the mushaf viewer zeroes it (`.mushaf-ion-content`) and relies on the
     * toolbar padding itself by the inset — so the toolbar rendered underneath
     * the status bar.
     *
     * A SEPARATE VARIABLE NAME IS LOAD-BEARING. Insets dispatch parent → child,
     * so this decor-view listener runs BEFORE Capacitor's (registered on the
     * WebView's parent) and both queue their JS on the main looper in that same
     * order — Capacitor's zeros would land last and overwrite ours on every
     * insets pass. Writing to our own namespace sidesteps the ordering entirely.
     * CSS consumers never read these names directly: `tokens.css` folds all
     * three sources into `--safe-inset-*` with a max(), so on 15+ ours is
     * undefined → 0 and the plugin wins, and on ≤14 the plugin's is 0 and ours
     * wins. Renaming these variables means updating that token block too.
     */
    private fun injectSafeAreaInsetsBelowApi35() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) return

        ViewCompat.setOnApplyWindowInsetsListener(window.decorView) { _, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            // CSS pixels are density-independent; textZoom does not affect this.
            val density = resources.displayMetrics.density
            val top = (bars.top / density).toInt()
            val right = (bars.right / density).toInt()
            val bottom = (bars.bottom / density).toInt()
            val left = (bars.left / density).toInt()

            val script =
                """
                (function () {
                  var s = document.documentElement.style;
                  s.setProperty('--rfq-safe-area-inset-top', '${top}px');
                  s.setProperty('--rfq-safe-area-inset-right', '${right}px');
                  s.setProperty('--rfq-safe-area-inset-bottom', '${bottom}px');
                  s.setProperty('--rfq-safe-area-inset-left', '${left}px');
                })();
                """.trimIndent()

            bridge?.webView?.let { wv -> wv.post { wv.evaluateJavascript(script, null) } }

            // Pass through untouched: consuming here would stop Capacitor and
            // any other listener from ever seeing the insets.
            insets
        }
    }
}
