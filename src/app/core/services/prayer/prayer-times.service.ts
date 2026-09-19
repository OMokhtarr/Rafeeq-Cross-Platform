/**
 * PRAYER TIMES SERVICE
 * The only module that talks to the native prayer plugin.
 *
 * Calculation is native (PrayerTimesEngine.kt) because the home-screen widget
 * renders in the launcher process with no WebView. This service owns the web
 * side of it: acquiring a location, and turning the plugin's ISO strings into
 * Dates the page can render.
 */

import { Capacitor, registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type {
  PrayerDay,
  PrayerKey,
  PrayerMadhab,
  PrayerMethod,
  RawPrayerDay,
} from "./prayer-times.types";
import { PRAYER_KEYS, PRAYERS_ONLY } from "./prayer-times.types";

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
  getReminders(): Promise<{ enabled: boolean; prayers: PrayerKey[] }>;
  setReminders(options: {
    enabled?: boolean;
    prayers?: PrayerKey[];
  }): Promise<void>;
}

const RafeeqPrayer = registerPlugin<RafeeqPrayerPlugin>("RafeeqPrayer");

/**
 * The plugin is Kotlin-only — calculation lives natively so the home-screen
 * widget can read it without a WebView. In a desktop browser (`npm start`)
 * there is nothing behind the bridge, and every call throws
 * `"RafeeqPrayer" plugin is not implemented on web`.
 *
 * Prayer times are the one feature that genuinely cannot degrade to a web
 * fallback, so the service reports "no location" there instead. The page
 * already renders that as its permission prompt, which is the honest thing
 * to show: on web there is no way to get times, and a fabricated set would
 * be worse than none.
 */
const isNative = Capacitor.isNativePlatform();

/** Today's times, or a hasLocation:false day when none has been granted. */
export async function loadPrayerDay(date?: string): Promise<PrayerDay> {
  if (!isNative) return { hasLocation: false, times: null, next: null };

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
  // Nothing to store a fix into off-device; the catch below would swallow the
  // bridge error anyway, but returning early keeps the browser from prompting
  // for a location it cannot use.
  if (!isNative) return false;

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
  if (!isNative) {
    return { method: "egyptian", madhab: "shafi", hasLocation: false };
  }
  return RafeeqPrayer.getConfig();
}

export async function setPrayerConfig(patch: {
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
}): Promise<void> {
  if (!isNative) return;
  await RafeeqPrayer.setConfig(patch);
}

/** Current reminder state, or a disabled default off-device. */
export async function getReminders(): Promise<{
  enabled: boolean;
  prayers: PrayerKey[];
}> {
  if (!isNative) return { enabled: false, prayers: [...PRAYERS_ONLY] };
  return RafeeqPrayer.getReminders();
}

export async function setReminders(patch: {
  enabled?: boolean;
  prayers?: PrayerKey[];
}): Promise<void> {
  if (!isNative) return;
  await RafeeqPrayer.setReminders(patch);
}

/**
 * Turn reminders on, acquiring a location first if there isn't one.
 *
 * Returns false when no location could be obtained: there is nothing to
 * schedule without coordinates, and a toggle that can never fire is worse
 * than one that refuses to move.
 */
export async function enableReminders(): Promise<boolean> {
  if (!isNative) return false;

  const config = await getPrayerConfig();
  if (!config.hasLocation) {
    const granted = await requestLocation();
    if (!granted) return false;
  }
  await setReminders({ enabled: true });
  return true;
}
