/**
 * Types for the prayer-times plugin boundary.
 *
 * Calculation itself is native (see PrayerTimesEngine.kt) because the home
 * screen widget has no WebView; the web layer only ever reads results.
 */

export type PrayerKey =
  | "fajr"
  | "sunrise"
  | "duha"
  | "dhuhr"
  | "asr"
  | "maghrib"
  | "isha"
  | "midnight"
  | "last_third";

/**
 * The daily timetable, in display order. Sunrise sits between Fajr and Dhuhr
 * but is not a prayer.
 */
export const PRAYER_KEYS: PrayerKey[] = [
  "fajr",
  "sunrise",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

/**
 * Supplementary times, shown in their own collapsible section below the
 * timetable. Not prayers: none carries a reminder, and none is ever the
 * "next prayer" in the countdown.
 */
export const ADDITIONAL_KEYS: PrayerKey[] = ["duha", "midnight", "last_third"];

/** Sunrise never gets a reminder and is never the "next prayer". */
export const PRAYERS_ONLY: PrayerKey[] = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

export type PrayerMethod =
  | "egyptian"
  | "umm_al_qura"
  | "muslim_world_league"
  | "karachi"
  | "north_america"
  | "dubai"
  | "qatar"
  | "kuwait"
  | "singapore"
  | "moon_sighting_committee";

export const PRAYER_METHODS: PrayerMethod[] = [
  "egyptian",
  "umm_al_qura",
  "muslim_world_league",
  "karachi",
  "north_america",
  "dubai",
  "qatar",
  "kuwait",
  "singapore",
  "moon_sighting_committee",
];

export type PrayerMadhab = "shafi" | "hanafi";

export interface PrayerDay {
  /** False until a location has been granted and stored at least once. */
  hasLocation: boolean;
  times: Record<PrayerKey, Date> | null;
  next: { name: PrayerKey; at: Date } | null;
}

/** The raw plugin shape, before ISO strings are parsed into Dates. */
export interface RawPrayerDay {
  hasLocation: boolean;
  times?: Record<PrayerKey, string>;
  next?: { name: PrayerKey; at: string };
}
