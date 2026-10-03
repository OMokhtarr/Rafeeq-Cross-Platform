/**
 * Types for the prayer-alarm side of the RafeeqPrayer plugin.
 *
 * The alarms live natively (PrayerAlarmConfig.kt) because they must re-arm
 * after a reboot with no WebView running; the page only edits them.
 */

/** The five prayers; sunrise and the supplementary times take no alarm. */
export type AlarmPrayer = "fajr" | "dhuhr" | "asr" | "maghrib" | "isha";

export const ALARM_PRAYERS: AlarmPrayer[] = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

/** ISO weekdays, Monday = 1 … Sunday = 7, matching java.time.DayOfWeek. */
export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];

/** Display order of the day chips: the week starts on Saturday. */
export const WEEK_FROM_SATURDAY = [6, 7, 1, 2, 3, 4, 5];

export const MAX_OFFSET = 180;
export const SNOOZE_CHOICES = [5, 10, 15] as const;
export const RAMADAN_SHIFTS = [-1, 0, 1] as const;

export interface PrayerAlarm {
  id: string;
  prayer: AlarmPrayer;
  /** Negative before the prayer, positive after; −180…180. */
  offsetMinutes: number;
  label: string;
  enabled: boolean;
  /** ISO weekdays of the *prayer's* date. */
  days: number[];
  ramadanOnly: boolean;
}

export interface PrayerAlarmWithNext extends PrayerAlarm {
  /** When it next rings; null when it is off or can never ring. */
  nextAt: Date | null;
}

export interface AlarmSettings {
  soundUri: string | null;
  soundName: string | null;
  snoozeMinutes: (typeof SNOOZE_CHOICES)[number];
  vibrate: boolean;
  /** +1: Ramadan starts a day later than the Umm al-Qura calendar says. */
  ramadanShiftDays: (typeof RAMADAN_SHIFTS)[number];
}

export const DEFAULT_ALARM_SETTINGS: AlarmSettings = {
  soundUri: null,
  soundName: null,
  snoozeMinutes: 10,
  vibrate: true,
  ramadanShiftDays: 0,
};

/** What may stop an alarm ringing properly on this device. */
export interface AlarmHealth {
  notifications: boolean;
  exactAlarms: boolean;
  /** Full-screen over the lock screen; false only on Android 14+ when denied. */
  fullScreen: boolean;
  batteryUnrestricted: boolean;
  aggressiveBattery: boolean;
}

type RawAlarm = PrayerAlarm & { nextAt: string | null };

/** The plugin methods behind this feature; RafeeqPrayerPlugin extends it. */
export interface PrayerAlarmPlugin {
  getAlarms(): Promise<{ alarms: RawAlarm[]; settings: AlarmSettings }>;
  saveAlarm(alarm: PrayerAlarm): Promise<{ alarm: RawAlarm }>;
  deleteAlarm(options: { id: string }): Promise<void>;
  setAlarmSettings(patch: Partial<AlarmSettings>): Promise<void>;
  previewAlarm(alarm: PrayerAlarm): Promise<{ nextAt: string | null }>;
  pickAlarmSound(options: {
    source: "system" | "file";
  }): Promise<{ uri: string | null; name: string | null } | { cancelled: true }>;
  getAlarmHealth(): Promise<AlarmHealth>;
  requestFullScreenAlarms(): Promise<{ granted: boolean }>;
}
