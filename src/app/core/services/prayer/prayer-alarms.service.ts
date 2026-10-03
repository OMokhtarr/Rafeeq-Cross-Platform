/**
 * PRAYER ALARMS SERVICE
 * The web side of the ringing prayer alarms: reads and edits the list the
 * native scheduler keeps, and turns its ISO strings into Dates.
 *
 * Android only. Ringing needs AlarmManager and a lock-screen activity, which
 * iOS (before AlarmKit) and the browser do not offer, so everything here
 * answers "nothing" elsewhere without touching the bridge, and the page hides
 * the feature.
 */

import { Capacitor } from "@capacitor/core";
import { RafeeqPrayer, requestNotificationPermission } from "./prayer-times.service";
import {
  ALL_DAYS,
  DEFAULT_ALARM_SETTINGS,
  type AlarmHealth,
  type AlarmPrayer,
  type AlarmSettings,
  type PrayerAlarm,
  type PrayerAlarmWithNext,
} from "./prayer-alarms.types";
import { toHindiNumbers } from "../../utils/arabic.util";

export function alarmsSupported(): boolean {
  return Capacitor.getPlatform() === "android";
}

function withNext(raw: PrayerAlarm & { nextAt: string | null }): PrayerAlarmWithNext {
  return { ...raw, nextAt: raw.nextAt ? new Date(raw.nextAt) : null };
}

export async function loadAlarms(): Promise<{
  alarms: PrayerAlarmWithNext[];
  settings: AlarmSettings;
}> {
  if (!alarmsSupported()) return { alarms: [], settings: DEFAULT_ALARM_SETTINGS };
  const { alarms, settings } = await RafeeqPrayer.getAlarms();
  return { alarms: alarms.map(withNext), settings };
}

/** Inserts or replaces by id; resolves the stored copy with its next ring. */
export async function saveAlarm(alarm: PrayerAlarm): Promise<PrayerAlarmWithNext> {
  const { alarm: saved } = await RafeeqPrayer.saveAlarm(alarm);
  return withNext(saved);
}

export async function deleteAlarm(id: string): Promise<void> {
  await RafeeqPrayer.deleteAlarm({ id });
}

export async function setAlarmSettings(patch: Partial<AlarmSettings>): Promise<void> {
  await RafeeqPrayer.setAlarmSettings(patch);
}

/** When [alarm] would next ring if saved switched on. */
export async function previewAlarm(alarm: PrayerAlarm): Promise<Date | null> {
  const { nextAt } = await RafeeqPrayer.previewAlarm(alarm);
  return nextAt ? new Date(nextAt) : null;
}

/**
 * Opens a sound picker and stores the choice natively. Null when the user
 * backed out; a null uri means the device's default alarm sound.
 */
export async function pickAlarmSound(
  source: "system" | "file"
): Promise<{ uri: string | null; name: string | null } | null> {
  const result = await RafeeqPrayer.pickAlarmSound({ source });
  if ("cancelled" in result) return null;
  return { uri: result.uri, name: result.name };
}

export async function getAlarmHealth(): Promise<AlarmHealth | null> {
  if (!alarmsSupported()) return null;
  try {
    return await RafeeqPrayer.getAlarmHealth();
  } catch {
    return null;
  }
}

/** Opens the full-screen permission page; true when already allowed. */
export async function requestFullScreenAlarms(): Promise<boolean> {
  try {
    const { granted } = await RafeeqPrayer.requestFullScreenAlarms();
    return granted;
  } catch {
    return false;
  }
}

/**
 * Asked before the first alarm is switched on. Notifications are required:
 * without them there is no Stop button anywhere, only a sound that runs out
 * by itself. Exact alarms come next, as for reminders: refusing them only
 * risks a late ring, so it does not block. The full-screen permission is
 * left to the sheet's warning row — two settings pages opened back to back
 * would stack, and the second would hide the first.
 */
export async function prepareAlarmPermissions(): Promise<boolean> {
  const notifications = await requestNotificationPermission();
  if (!notifications) return false;
  try {
    await RafeeqPrayer.requestExactAlarm();
  } catch {
    // Alarms stay inexact; the sheet says so.
  }
  return true;
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A fresh alarm for [prayer]: on, at the prayer time, every day. */
export function newAlarm(prayer: AlarmPrayer): PrayerAlarm {
  return {
    id: newId(),
    prayer,
    offsetMinutes: 0,
    label: "",
    enabled: true,
    days: [...ALL_DAYS],
    ramadanOnly: false,
  };
}

/** "−1:30" / "+0:15", in Arabic-Indic digits for Arabic. */
export function formatOffset(minutes: number, lang: string): string {
  const abs = Math.abs(minutes);
  const text = `${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
  const sign = minutes < 0 ? "−" : "+";
  return sign + (lang === "ar" ? toHindiNumbers(text) : text);
}
