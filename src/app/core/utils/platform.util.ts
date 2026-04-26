/**
 * PLATFORM UTILITY
 * Detects the current runtime environment and exposes capability flags.
 * Used by storage, audio, and font services to select the right implementation.
 *
 * New file — no equivalent existed in the original CRA + Electron project.
 * The `window.electron` check mirrors the pattern established in preload.js
 * where contextBridge.exposeInMainWorld("electron", { appVersion }) is set.
 */

// Capacitor is tree-shaken away on web builds that don't use it.
// Use a try/catch so the file works even before `npm install @capacitor/core`.
let capacitorPlatform = "web";
let isNativePlatform = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Capacitor } = require("@capacitor/core");
  capacitorPlatform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
  isNativePlatform = Capacitor.isNativePlatform();
} catch {
  // Capacitor not installed yet — safe defaults above
}

export const platform = {
  // ── Runtime ──────────────────────────────────────────────────────────────
  /** Running inside Capacitor native wrapper (iOS or Android) */
  isNative: isNativePlatform,

  /**
   * Running inside Electron.
   * preload.js exposes window.electron = { appVersion } via contextBridge.
   */
  isElectron: !!(window as Window & { electron?: unknown }).electron,

  /** Plain browser / PWA */
  get isWeb() {
    return !this.isNative && !this.isElectron;
  },

  isIOS: capacitorPlatform === "ios",
  isAndroid: capacitorPlatform === "android",
  get isMobile() {
    return this.isIOS || this.isAndroid;
  },
  get isDesktop() {
    return this.isElectron || (!this.isMobile && this.isWeb);
  },

  // ── Arabic font ───────────────────────────────────────────────────────────
  /**
   * Returns the best Arabic font stack for the current platform.
   * iOS and Android ship excellent system Arabic fonts; no download needed.
   */
  getArabicFont(): string {
    if (this.isIOS) return '"Traditional Arabic", "Geeza Pro", serif';
    if (this.isAndroid) return '"Noto Naskh Arabic", "Noto Serif Arabic", serif';
    if (this.isElectron)
      return '"Traditional Arabic", "Scheherazade New", "Amiri", serif';
    // Web: Amiri loaded via Google Fonts (matches current App.css @import)
    return '"Amiri", "Scheherazade New", serif';
  },

  // ── Workers ───────────────────────────────────────────────────────────────
  /** How many Web Workers to spin up for heavy tasks (search index, quiz gen) */
  getWorkerCount(): number {
    if (this.isMobile) return 1;
    if (this.isElectron)
      return Math.min(navigator.hardwareConcurrency - 1, 4);
    return 2;
  },
} as const;

export type Platform = typeof platform;
