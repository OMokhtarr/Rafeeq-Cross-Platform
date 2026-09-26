/**
 * WORSHIP TRACKER CATALOG
 * The sections and items the tracker offers, and when each one opens.
 * Pure data: the rules that read it live in trackerLogic.ts.
 *
 * `unlock` names the prayer time that opens an item on the current tracking
 * day; "duha" means the duha time (falling back to sunrise + 15 min) and
 * null means always open.
 */
import type { PrayerKey } from "../../core/services/prayer/prayer-times.types";

export type SectionId =
  | "prayers"
  | "azkar"
  | "quran"
  | "daily"
  | "rawatib"
  | "fasting";

export type ItemId =
  | "fajr" | "dhuhr" | "asr" | "maghrib" | "isha"
  | "azkarMorning" | "azkarEvening" | "azkarSleep"
  | "quranDaily"
  | "duha"
  | "sunnahFajr" | "sunnahDhuhrBefore" | "sunnahDhuhrAfter"
  | "sunnahMaghrib" | "sunnahIsha" | "qiyam" | "witr"
  | "fastToday";

export type Unlock = Extract<PrayerKey, "fajr" | "dhuhr" | "asr" | "maghrib" | "isha" | "duha"> | null;

export interface TrackerItem {
  id: ItemId;
  unlock: Unlock;
  /** Route opened on long-press, if any. "quran" resolves at runtime (Al-Kahf on Fridays). */
  longPress?: "azkarMorningEvening" | "azkarSleep" | "quran";
}

export interface TrackerSection {
  id: SectionId;
  items: TrackerItem[];
}

export const SECTIONS: TrackerSection[] = [
  {
    id: "prayers",
    items: [
      { id: "fajr", unlock: "fajr" },
      { id: "dhuhr", unlock: "dhuhr" },
      { id: "asr", unlock: "asr" },
      { id: "maghrib", unlock: "maghrib" },
      { id: "isha", unlock: "isha" },
    ],
  },
  {
    id: "azkar",
    items: [
      { id: "azkarMorning", unlock: "fajr", longPress: "azkarMorningEvening" },
      { id: "azkarEvening", unlock: "asr", longPress: "azkarMorningEvening" },
      { id: "azkarSleep", unlock: "isha", longPress: "azkarSleep" },
    ],
  },
  { id: "quran", items: [{ id: "quranDaily", unlock: null, longPress: "quran" }] },
  { id: "daily", items: [{ id: "duha", unlock: "duha" }] },
  {
    id: "rawatib",
    items: [
      { id: "sunnahFajr", unlock: "fajr" },
      { id: "sunnahDhuhrBefore", unlock: "dhuhr" },
      { id: "sunnahDhuhrAfter", unlock: "dhuhr" },
      { id: "sunnahMaghrib", unlock: "maghrib" },
      { id: "sunnahIsha", unlock: "isha" },
      { id: "qiyam", unlock: "isha" },
      { id: "witr", unlock: "isha" },
    ],
  },
  { id: "fasting", items: [{ id: "fastToday", unlock: null }] },
];

/** Every section the user may switch off; prayers are always counted. */
export const OPTIONAL_SECTIONS: SectionId[] = ["azkar", "quran", "rawatib", "daily", "fasting"];
