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
  },
};

export default config;
