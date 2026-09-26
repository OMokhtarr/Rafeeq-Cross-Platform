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
import { ADDITIONAL_KEYS, PRAYER_KEYS, PRAYERS_ONLY } from "./prayer-times.types";

interface RafeeqPrayerPlugin {
  getTimes(options?: { date?: string }): Promise<RawPrayerDay>;
  setLocation(options: { lat: number; lng: number }): Promise<void>;
  getConfig(): Promise<{
    method: PrayerMethod;
    madhab: PrayerMadhab;
    use24Hour: boolean;
    hasLocation: boolean;
  }>;
  setConfig(options: {
    method?: PrayerMethod;
    madhab?: PrayerMadhab;
    use24Hour?: boolean;
    appNight?: boolean;
  }): Promise<void>;
  getReminders(): Promise<{ enabled: boolean; prayers: PrayerKey[] }>;
  setReminders(options: {
    enabled?: boolean;
    prayers?: PrayerKey[];
  }): Promise<void>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  requestExactAlarm(): Promise<{ granted: boolean }>;
  getVisibleTimes(): Promise<{ times: string[] }>;
  setVisibleTimes(options: { times: string[] }): Promise<void>;
  getWidgetInfo(): Promise<{ supported: boolean; placed: number }>;
  requestPinWidget(): Promise<{ requested: boolean; alreadyPlaced: boolean }>;
  openAppSettings(): Promise<{ opened: boolean }>;
  openHomeScreen(): Promise<{ opened: boolean }>;
  openWidgetSettings(): Promise<{ opened: boolean }>;
  getPlace(): Promise<{ name: string | null }>;
  locationServicesEnabled(): Promise<{ enabled: boolean }>;
  promptEnableLocation(): Promise<{ enabled: boolean }>;
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
  // Both lists, so the supplementary times survive the boundary alongside the
  // timetable — iterating PRAYER_KEYS alone would silently drop them.
  const times: Partial<Record<PrayerKey, Date>> = {};
  [...PRAYER_KEYS, ...ADDITIONAL_KEYS].forEach((key) => {
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

/** Whether the device's location services are switched on. */
export async function locationServicesEnabled(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const { enabled } = await RafeeqPrayer.locationServicesEnabled();
    return enabled;
  } catch {
    return false;
  }
}

/**
 * Asks the device to switch location on through its own one-tap dialog.
 * True once location is on; false if the user declined or no dialog exists.
 */
async function promptEnableLocation(): Promise<boolean> {
  try {
    const { enabled } = await RafeeqPrayer.promptEnableLocation();
    return enabled;
  } catch {
    return false;
  }
}

/**
 * Why a location attempt ended. A bare boolean could not distinguish a
 * refused permission from switched-off location services, and those have
 * different remedies — asking a user to grant a permission they already hold
 * is a dead end.
 */
export type LocationOutcome = "granted" | "denied" | "services-off" | "failed";

/**
 * Acquire a coarse fix and hand it to the native side.
 *
 * Never throws: every failure is a state the page renders as a message.
 */
export async function requestLocation(): Promise<LocationOutcome> {
  // Nothing to store a fix into off-device, and no way to tell why — so this
  // is "failed" rather than a more specific claim it cannot support.
  if (!isNative) return "failed";

  // Location off is fixable in place, so offer the system's switch first.
  // It must come before any Geolocation call: the plugin rejects even
  // checkPermissions/requestPermissions while location is off.
  if (!(await locationServicesEnabled()) && !(await promptEnableLocation())) {
    return "services-off";
  }

  try {
    let status = await Geolocation.checkPermissions();
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      status = await Geolocation.requestPermissions({
        permissions: ["coarseLocation"],
      });
    }
    if (status.location !== "granted" && status.coarseLocation !== "granted") {
      return "denied";
    }

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: false,
      timeout: 10_000,
    });
    await RafeeqPrayer.setLocation({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
    });
    return "granted";
  } catch {
    // The permission is held by this point, so a failure here is either the
    // device's location services being off or a fix that did not arrive.
    const on = await locationServicesEnabled();
    return on ? "failed" : "services-off";
  }
}

export async function getPrayerConfig(): Promise<{
  method: PrayerMethod;
  madhab: PrayerMadhab;
  /** Clock the home-screen widget renders its times in. 12-hour by default. */
  use24Hour: boolean;
  hasLocation: boolean;
}> {
  if (!isNative) {
    return {
      method: "egyptian",
      madhab: "shafi",
      use24Hour: false,
      hasLocation: false,
    };
  }
  return RafeeqPrayer.getConfig();
}

export async function setPrayerConfig(patch: {
  method?: PrayerMethod;
  madhab?: PrayerMadhab;
  use24Hour?: boolean;
  appNight?: boolean;
}): Promise<void> {
  if (!isNative) return;
  await RafeeqPrayer.setConfig(patch);
}

/**
 * Mirrors the app's theme into native storage.
 *
 * The widget's appearance screen is a real Activity and cannot read the
 * theme from localStorage, where it lives. Without this it would follow the
 * device instead of the app and render white inside a dark Rafeeq.
 *
 * Called before opening that screen rather than on every theme change: it is
 * the only native surface that needs the value, so one write at the point of
 * use beats a listener that fires on every toggle.
 */
export async function syncAppTheme(isNight: boolean): Promise<void> {
  if (!isNative) return;
  await RafeeqPrayer.setConfig({ appNight: isNight });
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
 * Request POST_NOTIFICATIONS at runtime (Android 13+ only; a no-op resolved
 * true below that, and implicitly granted on older OSes). Off-device there is
 * no notification system to grant anything from, so this reports false.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) return false;

  try {
    const { granted } = await RafeeqPrayer.requestNotificationPermission();
    return granted;
  } catch {
    return false;
  }
}

/**
 * Turn reminders on, acquiring a location first, then the notification
 * permission.
 *
 * Returns false when either step is refused: without coordinates there is
 * nothing to schedule, and without the notification permission the alarm
 * still fires but NotificationManager.notify() is silently discarded on
 * Android 13+ — a toggle whose notifications can never appear is exactly the
 * bug this order exists to prevent, so reminders are not enabled in that case
 * either.
 */
export async function enableReminders(): Promise<boolean> {
  if (!isNative) return false;

  const config = await getPrayerConfig();
  if (!config.hasLocation) {
    const granted = await requestLocation();
    if (!granted) return false;
  }

  const notificationsGranted = await requestNotificationPermission();
  if (!notificationsGranted) return false;

  await setReminders({ enabled: true });

  // Best effort: without exact alarms a reminder can arrive a few minutes
  // late under Doze, but it still arrives, so a refusal does not block.
  try {
    await RafeeqPrayer.requestExactAlarm();
  } catch {
    // Reminders stay inexact.
  }
  return true;
}

export async function getVisibleTimes(): Promise<PrayerKey[]> {
  if (!isNative) return [...PRAYER_KEYS];
  const { times } = await RafeeqPrayer.getVisibleTimes();
  return times as PrayerKey[];
}

export async function setVisibleTimes(times: PrayerKey[]): Promise<void> {
  if (!isNative) return;
  await RafeeqPrayer.setVisibleTimes({ times });
}

/**
 * Whether the home-screen widget can be offered from inside the app, and how
 * many copies are already placed.
 *
 * Pinning is the launcher's decision: not every launcher implements it, and
 * there is no way to force one that doesn't. `supported: false` is the honest
 * answer off-device too — a browser has no home screen — and the page renders
 * that by omitting its button rather than showing a dead control.
 */
export async function getWidgetInfo(): Promise<{
  supported: boolean;
  placed: number;
}> {
  if (!isNative) return { supported: false, placed: 0 };

  try {
    return await RafeeqPrayer.getWidgetInfo();
  } catch {
    // A bridge failure is indistinguishable from an unsupported launcher as
    // far as the page is concerned: either way there is no button to show.
    return { supported: false, placed: 0 };
  }
}

/**
 * The outcome of asking the launcher to pin the widget.
 *
 * `requested` means the system accepted the request — it says nothing about
 * whether a widget appeared, which only the launcher knows.
 *
 * `blocked` means the system itself refused, which is the one failure the app
 * can actually see. Some launchers (MIUI) additionally gate pinning behind a
 * per-app permission and drop the request in their own process, logging
 *
 *   E AddItemActivity-PinShortcutRequestUtils:
 *     add widget failed, <package> has no permission
 *
 * That variety is invisible from here and is deliberately not guessed at: a
 * silent refusal and a pin the user has not answered yet look identical, and
 * claiming the former would put a false warning under a working button.
 */
export interface PinWidgetOutcome {
  requested: boolean;
  blocked: boolean;
  /**
   * A widget is already on the home screen, so nothing was requested. Not a
   * failure: the page takes the user to it instead of adding a second copy
   * of a widget showing the same timetable.
   */
  alreadyPlaced: boolean;
}

/**
 * Ask the launcher to add the prayer widget to the home screen.
 *
 * The outcome cannot be observed from here, and it is important not to
 * pretend otherwise. The launcher's confirmation dialog is asynchronous: the
 * request returns immediately, the dialog goes up, and the user answers it
 * seconds later with this app in the background. Comparing the placed count
 * across the call therefore proves nothing — it is always unchanged at that
 * instant, including on a pin that is about to succeed.
 *
 * So only a refusal the *system* reports is treated as blocked:
 * `requested: false` from requestPinAppWidget, or a bridge error. Everything
 * else is left alone, and the refreshed count on the next
 * `useIonViewWillEnter` is what actually confirms placement.
 */
export async function requestPinWidget(): Promise<PinWidgetOutcome> {
  if (!isNative) return { requested: false, blocked: false, alreadyPlaced: false };

  try {
    const { requested, alreadyPlaced } = await RafeeqPrayer.requestPinWidget();
    // Already placed is neither a request nor a refusal — the page shows the
    // widget rather than warning about something that did not go wrong.
    if (alreadyPlaced) {
      return { requested: false, blocked: false, alreadyPlaced: true };
    }
    return { requested, blocked: !requested, alreadyPlaced: false };
  } catch {
    return { requested: false, blocked: true, alreadyPlaced: false };
  }
}

/**
 * Leave the app for the home screen, so the widget is visible.
 *
 * No Android API can scroll a launcher to a particular widget or highlight
 * one — the launcher owns its pages and exposes nothing for pointing at a
 * placed item. Going home is the whole of what is possible.
 */
export async function openHomeScreen(): Promise<boolean> {
  if (!isNative) return false;

  try {
    const { opened } = await RafeeqPrayer.openHomeScreen();
    return opened;
  } catch {
    return false;
  }
}

/** Open the placed widget's appearance settings. False when none is placed. */
export async function openWidgetSettings(): Promise<boolean> {
  if (!isNative) return false;

  try {
    const { opened } = await RafeeqPrayer.openWidgetSettings();
    return opened;
  } catch {
    return false;
  }
}

/**
 * Open this app's system settings page.
 *
 * The only move available for a launcher-gated permission: it cannot be
 * requested through any API, so the app can do no more than take the user to
 * the screen that holds it.
 */
export async function openAppSettings(): Promise<boolean> {
  if (!isNative) return false;

  try {
    const { opened } = await RafeeqPrayer.openAppSettings();
    return opened;
  } catch {
    return false;
  }
}

/**
 * The cached name for the stored location, or null.
 *
 * Resolved natively when a fix is taken, because Android's Geocoder is a
 * network call — so this is a read from storage, not a lookup, and works
 * offline. Null is a normal outcome (offline fix, no geocoder backend, or
 * coordinates with no named place), which the page renders as its own title.
 */
export async function getPlace(): Promise<string | null> {
  if (!isNative) return null;
  try {
    const { name } = await RafeeqPrayer.getPlace();
    return name ?? null;
  } catch {
    return null;
  }
}
