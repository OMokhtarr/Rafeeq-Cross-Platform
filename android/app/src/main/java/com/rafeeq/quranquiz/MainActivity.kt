package com.rafeeq.quranquiz

import android.os.Build
import android.os.Bundle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.getcapacitor.BridgeActivity
import com.getcapacitor.WebViewListener
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
        keepSafeAreaInsetsAcrossDocuments()
    }

    /**
     * Keep the safe-area variables alive across document swaps.
     *
     * The variables live as inline styles on `documentElement`, so they die with
     * the document they were set on. Insets only dispatch when they actually
     * change — never merely because a page loaded — so the first document (the
     * app itself) can come up with the variables missing and nothing to restore
     * them. That is the state where the mushaf toolbar renders under the status
     * bar even though the native side measured the inset correctly.
     *
     * Two parts:
     * - `addDocumentStartJavaScript` seeds the properties at 0px before any page
     *   script runs, so they always exist. Requires DOCUMENT_START_SCRIPT
     *   (Android WebView 83+); the feature check makes it a no-op elsewhere.
     *   Strictly an invariant — CSS reads `var(--rfq-…, 0px)` and so already
     *   tolerates the properties being absent.
     * - `onPageLoaded` pushes the REAL measured values in after each document is
     *   up. This is the part that actually fixes the bug.
     */
    private fun keepSafeAreaInsetsAcrossDocuments() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) return

        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            // Seed the variables at 0px before any page CSS is evaluated, so the
            // custom properties always exist; the real values follow immediately.
            WebViewCompat.addDocumentStartJavaScript(
                bridge.webView,
                """
                (function () {
                  var s = document.documentElement.style;
                  if (!s.getPropertyValue('--rfq-safe-area-inset-top')) {
                    s.setProperty('--rfq-safe-area-inset-top', '0px');
                    s.setProperty('--rfq-safe-area-inset-right', '0px');
                    s.setProperty('--rfq-safe-area-inset-bottom', '0px');
                    s.setProperty('--rfq-safe-area-inset-left', '0px');
                  }
                })();
                """.trimIndent(),
                setOf("*")
            )
        }

        // The real values still have to be re-pushed after each document swap:
        // the seed above only guarantees the properties exist. Capacitor owns
        // the WebViewClient, so hook its own listener API rather than replacing
        // the client — onPageLoaded fires on first load and every navigation
        // that replaces the document.
        bridge.addWebViewListener(
            object : WebViewListener() {
                override fun onPageLoaded(webView: android.webkit.WebView) {
                    reapplySafeAreaInsets()
                }
            }
        )
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

        /** `adb logcat -s RafeeqInsets` to trace safe-area injection on device. */
        private const val INSETS_LOG_TAG = "RafeeqInsets"
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
        reapplySafeAreaInsets()
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
            applySafeAreaInsets(insets)

            // Pass through untouched: consuming here would stop Capacitor and
            // any other listener from ever seeing the insets.
            insets
        }
    }

    /**
     * Push the current insets into the WebView as `--rfq-safe-area-inset-*`.
     *
     * Split out of the listener so it can also be called directly: the listener
     * alone is not enough to guarantee the variables are ever set.
     *
     * - The decor view may have already dispatched its insets before this
     *   activity registered a listener, and a dispatch only repeats when
     *   something invalidates it. `lastInsets` + the explicit re-apply in
     *   `reapplySafeAreaInsets` cover that.
     * - Values are written as inline styles on `documentElement`, which a
     *   document replacement (initial load, reload, in-app navigation that
     *   swaps the document) wipes. Nothing re-dispatches insets afterwards, so
     *   the variables would stay missing until an unrelated inset change.
     *
     * Cached rather than re-read because `getRootWindowInsets` can return null
     * before the view is attached.
     */
    private var lastInsets: WindowInsetsCompat? = null

    private fun applySafeAreaInsets(insets: WindowInsetsCompat) {
        lastInsets = insets

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

        // Diagnostic: `adb logcat -s RafeeqInsets` while launching shows whether
        // this build contains the injection and what it measured. Silence means
        // the installed APK predates this code — check that the NATIVE build was
        // rebuilt, not just the web assets.
        android.util.Log.d(
            INSETS_LOG_TAG,
            "inject top=$top right=$right bottom=$bottom left=$left density=$density sdk=${Build.VERSION.SDK_INT}"
        )

        bridge?.webView?.let { wv -> wv.post { wv.evaluateJavascript(script, null) } }
    }

    /**
     * Re-assert the variables from the cached insets, or read them fresh if no
     * dispatch has happened yet. Safe to call at any point after the WebView
     * exists; a no-op on Android 15+, where Capacitor owns the variables.
     */
    private fun reapplySafeAreaInsets() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) return

        val cached = lastInsets
        if (cached != null) {
            applySafeAreaInsets(cached)
            return
        }

        // No dispatch has reached the listener yet. Reading the root insets
        // directly is what makes this robust: if the decor-view listener never
        // fires at all, this path still supplies real values.
        val fresh = ViewCompat.getRootWindowInsets(window.decorView)
        if (fresh == null) {
            android.util.Log.d(INSETS_LOG_TAG, "reapply: no cached insets and getRootWindowInsets() == null")
            return
        }
        android.util.Log.d(INSETS_LOG_TAG, "reapply: using getRootWindowInsets() fallback (listener had not fired)")
        applySafeAreaInsets(fresh)
    }
}
