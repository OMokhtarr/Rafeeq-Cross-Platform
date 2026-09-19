/**
 * PRAYER TIMES SERVICE
 * The only module that talks to the native prayer plugin.
 *
 * Calculation is native (PrayerTimesEngine.kt) because the home-screen widget
 * renders in the launcher process with no WebView. This service owns the web
 * side of it: acquiring a location, and turning the plugin's ISO strings into
 * Dates the page can render.
 */

import { registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type {
  PrayerDay,
  PrayerKey,
  PrayerMadhab,
  PrayerMethod,
  RawPrayerDay,
} from "./prayer-times.types";
import { PRAYER_KEYS } from "./prayer-times.types";

interface RafeeqPrayerPlugin {
  getTimes(options?: { date?: string }): Promise<RawPrayerDay>;
  setLocation(options: { lat: number; lng: number }): Promise<void>;
  getConfig(): Promise<{
    method: PrayerMethod;
    madhab: PrayerMadhab;
    hasLocation: boolean;
  }>;
  setConfig(options: {
    method?: PrayerMethod;
    madhab?: PrayerMadhab;
  }): Promise<void>;
}

const RafeeqPrayer = registerPlugin<RafeeqPrayerPlugin>("RafeeqPrayer");

/** Today's times, or a hasLocation:false day when none has been granted. */
export async function loadPrayerDay(date?: string): Promise<PrayerDay> {
  const raw = await RafeeqPrayer.getTimes(date ? { date } : undefined);

  if (!raw.hasLocation || !raw.times) {
    return { hasLocation: false, times: null, next: null };
  }

  // Individual entries may be absent at high latitude during the
  // midnight-sun window (see PrayerTimesEngine); skip rather than construct
  // an Invalid Date for a key that was never returned.
  const times = {} as Record<PrayerKey, Date>;
  PRAYER_KEYS.forEach((key) => {
    const iso = raw.times![key];
    if (iso) {
      times[key] = new Date(iso);
    }
  });

  return {
    hasLocation: true,
    times,
    next: raw.next ? { name: raw.next.name, at: new Date(raw.next.at) } : null,
  };
}

/**
 * Acquire a coarse fix and hand it to the native side.
 *
 * Returns false rather than throwing when the user declines or the fix fails:
 * both are states the page renders as a prompt, not errors to surface.
 */
export async function requestLocation(): Promise<boolean> {
  try {
    let status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      status = await Geolocation.requestPermissions({
        permissions: ["coarseLocation"],
      });
    }
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      return false;
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10_000,
    });
    await RafeeqPrayer.setLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
    return true;
  } catch {
    return false;
  }
}

export async function getPrayerConfig(): Promise<{
  method: PrayerMethod;
  madhab: PrayerMadhab;
  hasLocation: boolean;
}> {
  return RafeeqPrayer.getConfig();
}

export async function setPrayerConfig(patch: {
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
}): Promise<void> {
  await RafeeqPrayer.setConfig(patch);
}
