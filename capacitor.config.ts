/**
 * CAPACITOR CONFIG
 *
 * This single config drives all three platforms:
 *   - Web: served from /build
 *   - iOS: ionic cap sync ios
 *   - Android: ionic cap sync android
 */

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rafeeq.quranquiz",
  appName: "Rafeeq",
  webDir: "build",

  server: {
    androidScheme: "https",
    iosScheme: "ionic",
  },

  android: {
    // Same floor as browserslist's `chrome >= 79` in package.json — keep the two
    // in step. 79 is where `max()` lands, which the --safe-inset-* tokens depend
    // on; below it safe-area layout breaks structurally rather than degrading.
    // Capacitor's own default is 60 (hard floor 55), so this raises the bar to
    // what the app actually needs. Below it Capacitor shows a blocking dialog,
    // which beats loading into a broken layout.
    minWebViewVersion: 79,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 0,
      launchAutoHide: true,
      showSpinner: false,
    },

    // System bar icon/pill tint at load, before the WebView can report the
    // user's stored theme. Left at the "DEFAULT" default this would follow the
    // DEVICE theme, so a light-mode phone would draw dark icons over Rafeeq's
    // black night background and they'd vanish. The app's own theme defaults
    // to night, so pin DARK (= light icons) to match; useSystemBarsTheme then
    // corrects to LIGHT for users whose stored theme is day.
    SystemBars: {
      style: "DARK",
    },

    // Only the providers Rafeeq signs in with get bundled. Left unset, the
    // plugin bundles all of them, and the Facebook SDK adds the advertising ID
    // permission (AD_ID) and the Privacy Sandbox ad permissions to the
    // manifest, which Play's Advertising ID declaration then has to admit.
    // Apple stays on for the future iOS app. Takes effect on `npx cap sync`.
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
    },
  },
};

export default config;
