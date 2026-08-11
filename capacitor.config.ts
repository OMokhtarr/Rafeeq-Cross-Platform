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
  },
};

export default config;
