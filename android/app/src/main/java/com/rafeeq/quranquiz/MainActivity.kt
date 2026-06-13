package com.rafeeq.quranquiz

import android.os.Build
import android.os.Bundle
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsControllerCompat
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
        enableEdgeToEdge()
    }

    override fun onNewIntent(intent: android.content.Intent?) {
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

    private fun enableEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = android.graphics.Color.TRANSPARENT
        window.navigationBarColor = android.graphics.Color.TRANSPARENT
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.isAppearanceLightStatusBars = false
        controller.isAppearanceLightNavigationBars = false
    }
}
