import { useEffect } from "react";
import { Capacitor, registerPlugin } from "@capacitor/core";

import type { Theme } from "../context/ThemeContext";

interface RafeeqPrayerThemePlugin {
  setConfig(options: { appNight?: boolean }): Promise<void>;
}

const RafeeqPrayer = registerPlugin<RafeeqPrayerThemePlugin>("RafeeqPrayer");

/**
 * Mirror the app's day/night theme into native storage, for the surfaces
 * that cannot read it themselves.
 *
 * The theme lives in localStorage, which only the WebView can reach. The
 * home-screen widgets run in the launcher's process and the widget's
 * appearance screen is a plain Activity — neither has a WebView, so without
 * this they fall back to the *device's* dark-mode setting. That is a
 * different preference entirely: a phone in light mode showed a white widget
 * beneath a dark Rafeeq.
 *
 * Registered against the plugin directly rather than importing the prayer
 * service, so the app-wide ThemeContext does not take a dependency on a
 * feature module for what is really a one-field write.
 *
 * Fire-and-forget: a failed mirror leaves the widget on its previous colour
 * until the next toggle, which is not worth surfacing to the user or
 * blocking a theme change over.
 */
export function useWidgetTheme(theme: Theme): void {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    RafeeqPrayer.setConfig({ appNight: theme === "night" }).catch(() => {});
  }, [theme]);
}
