/**
 * RAFEEQ PRAYER PLUGIN
 * The single registration of the "RafeeqPrayer" bridge.
 *
 * Android answers from Kotlin (RafeeqPrayerPlugin.kt). iOS has no native
 * plugin, so Capacitor routes it to the JavaScript implementation in
 * prayer-ios.plugin.ts instead. Registered once here because Capacitor keeps
 * the first registration of a name and ignores the implementations passed to
 * any later one.
 */

import { registerPlugin } from "@capacitor/core";
import type { Lang } from "../../i18n/strings";
import type { PrayerKey, PrayerMadhab, PrayerMethod, RawPrayerDay } from "./prayer-times.types";

export interface RafeeqPrayerPlugin {
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
    appLang?: Lang;
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
  getQibla(): Promise<{
    hasLocation: boolean;
    bearing?: number;
    magneticBearing?: number;
    declination?: number;
  }>;
}

export const RafeeqPrayer = registerPlugin<RafeeqPrayerPlugin>("RafeeqPrayer", {
  ios: () => import("./prayer-ios.plugin").then((m) => new m.PrayerIos()),
});
