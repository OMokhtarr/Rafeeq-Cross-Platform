/**
 * CAPACITOR CONFIG
 * Replaces: Electron-only configuration in package.json "build" section
 *
 * This single config drives all four platforms:
 *   - Web: served from /build
 *   - iOS: ionic cap sync ios
 *   - Android: ionic cap sync android
 *   - Electron: ionic cap sync @capacitor-community/electron
 */

import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.rafeeq.quranquiz",
  appName: "Rafeeq رفيق",
  webDir: "build",

  // // ADD THIS SECTION for Android 15+ edge-to-edge support
  // android: {
  //   adjustMarginsForEdgeToEdge: "auto",
  // },

  server: {
    androidScheme: "https",
    iosScheme: "ionic",
  },

  plugins: {
    SplashScreen: {
      // Matches the splash image at public/images/starter_page.png
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#1A7A4A", // Rafeeq emerald green
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },

    // Used by idb.service.ts on native platforms
    CapacitorSQLite: {
      iosDatabaseLocation: "Library/CapacitorDatabase",
      iosIsEncryption: false,
      androidIsEncryption: false,
      electronWindowsLocation: "C:\\ProgramData\\CapacitorDatabases",
      electronMacLocation: "/Users/Shared/CapacitorDatabases",
      electronLinuxLocation: "Databases",
    },
  },
};

export default config;
