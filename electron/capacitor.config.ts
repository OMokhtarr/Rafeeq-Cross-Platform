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
  appName: "Rafeeq",
  webDir: "build",

  server: {
    // Required for Capacitor 5 on Android
    androidScheme: "https",
    // Match existing Electron behaviour (file:// URLs)
    iosScheme: "ionic",
    // Allow hot-reload from dev server during development
    // Comment this out for production builds
    // url: "http://192.168.x.x:8100",
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

  // Electron-specific overrides
  // @capacitor-community/electron reads this section
  electron: {
    customUrlScheme: "rafeeq",
    deepLinkingEnabled: false,
    nodeIntegration: false,       // Matches existing preload.js security model
    appendUserAgent: "Rafeeq/1.0",
  },
};

export default config;
