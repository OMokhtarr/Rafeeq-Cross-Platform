import { useEffect } from "react";
import { Capacitor, SystemBars, SystemBarsStyle } from "@capacitor/core";

import type { Theme } from "../context/ThemeContext";

/**
 * Keep the OS status bar (top) and navigation/gesture bar (bottom) in step
 * with the app's day/night theme.
 *
 * On Android 15+ (this app targets SDK 36) the system enforces edge-to-edge:
 * both bars are permanently transparent and `StatusBar.setBackgroundColor()`
 * is a no-op. The bars therefore show whatever the app paints behind them —
 * which the themed `--color-bg-app` on <body> already handles. What is NOT
 * automatic is the *content* colour: the clock, battery and gesture pill are
 * drawn by the OS, so they must be told to go dark on the white day theme and
 * light on the black night theme. Without this they stay light and become
 * invisible against day mode's white background.
 *
 * `SystemBars` ships inside @capacitor/core 8 (no extra plugin) and is the
 * edge-to-edge-era replacement for @capacitor/status-bar. Passing no `bar`
 * applies the style to the status bar and the navigation bar together.
 *
 * Style semantics are inverted from the theme name, so read carefully:
 *   Dark  = light content, for a dark background → night theme
 *   Light = dark  content, for a light background → day theme
 */
export function useSystemBarsTheme(theme: Theme): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Night = black surfaces behind the bars, so the bars need light icons.
    const style = theme === "night" ? SystemBarsStyle.Dark : SystemBarsStyle.Light;

    // Fire-and-forget: a failure here only affects icon tint, never the app,
    // so it must not surface as an unhandled rejection.
    SystemBars.setStyle({ style }).catch(() => {});
  }, [theme]);
}
