/**
 * WORSHIP TRACKER LOGIC
 * Pure rules over the catalog: which day is being tracked, what is open,
 * whether today is a recommended fast, and how the day is scored.
 *
 * A tracking day starts at Fajr, not midnight, so Qiyam and Witr prayed
 * after midnight still land on the night they belong to.
 */
import type { PrayerKey } from "../../core/services/prayer/prayer-times.types";
import { SECTIONS, SectionId, ItemId, TrackerItem } from "./trackerCatalog";

const pad = (n: number) => String(n).padStart(2, "0");

export function toDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function trackingDate(now: Date, fajrToday?: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (fajrToday && now < fajrToday) d.setDate(d.getDate() - 1);
  return d;
}

export function trackingDayKey(now: Date, fajrToday?: Date): string {
  return toDayKey(trackingDate(now, fajrToday));
}

/**
 * The page loads times once and stays mounted overnight. After midnight
 * those anchors belong to yesterday, so they are dropped (nothing locks)
 * until a fresh set for the new date arrives.
 */
export function freshTimes(
  times: Partial<Record<PrayerKey, Date>> | null,
  now: Date,
): Partial<Record<PrayerKey, Date>> | null {
  if (!times?.fajr) return times;
  return toDayKey(times.fajr) === toDayKey(now) ? times : null;
}

const DUHA_AFTER_SUNRISE_MS = 15 * 60 * 1000;

export function isUnlocked(
  item: TrackerItem,
  now: Date,
  times: Partial<Record<PrayerKey, Date>> | null,
  isPreviousDay: boolean,
): boolean {
  // Before Fajr every anchor of the tracked (previous) day has already passed.
  if (!item.unlock || !times || isPreviousDay) return true;
  let at = times[item.unlock];
  if (item.unlock === "duha" && !at && times.sunrise) {
    at = new Date(times.sunrise.getTime() + DUHA_AFTER_SUNRISE_MS);
  }
  // A missing time (high latitude, web) must not lock the user out.
  return !at || now >= at;
}

export type FastingOccasion =
  | "ramadan" | "arafah" | "ashura" | "tasua"
  | "shawwal" | "whiteDays" | "monday" | "thursday";

const hijriFormat = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  day: "numeric",
  month: "numeric",
});

export function hijriParts(d: Date): { day: number; month: number } {
  const parts = hijriFormat.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { day: get("day"), month: get("month") };
}

export function fastingOccasion(d: Date): FastingOccasion | null {
  const { day, month } = hijriParts(d);
  // Fasting is prohibited on both Eids and the days of Tashreeq.
  if (month === 10 && day === 1) return null;
  if (month === 12 && day >= 10 && day <= 13) return null;

  if (month === 9) return "ramadan";
  if (month === 12 && day === 9) return "arafah";
  if (month === 1 && day === 10) return "ashura";
  if (month === 1 && day === 9) return "tasua";
  if (month === 10) return "shawwal";
  if (day >= 13 && day <= 15) return "whiteDays";
  if (d.getDay() === 1) return "monday";
  if (d.getDay() === 4) return "thursday";
  return null;
}

export function visibleSections(d: Date, enabled: Record<SectionId, boolean>): SectionId[] {
  return SECTIONS.map((s) => s.id).filter((id) => {
    if (id === "prayers") return true;
    if (!enabled[id]) return false;
    return id !== "fasting" || fastingOccasion(d) !== null;
  });
}

export function sectionShares(visible: SectionId[]): Partial<Record<SectionId, number>> {
  const others = visible.filter((id) => id !== "prayers");
  if (others.length === 0) return { prayers: 1 };
  const shares: Partial<Record<SectionId, number>> = { prayers: 0.5 };
  others.forEach((id) => (shares[id] = 0.5 / others.length));
  return shares;
}

export function dayScore(ticked: ItemId[], visible: SectionId[]): number {
  const shares = sectionShares(visible);
  const done = new Set(ticked);
  const total = SECTIONS.reduce((sum, s) => {
    const share = shares[s.id];
    if (!share) return sum;
    const n = s.items.filter((i) => done.has(i.id)).length;
    return sum + (n / s.items.length) * share;
  }, 0);
  return Math.min(100, Math.round(total * 100));
}

/**
 * A month as calendar cells: leading nulls up to the first day's weekday
 * (counted from `weekStart`, 0 = Sunday), then every day, then trailing
 * nulls to complete the last week.
 */
export function monthGrid(year: number, month: number, weekStart: number): (Date | null)[] {
  const first = new Date(year, month, 1);
  const days = new Date(year, month + 1, 0).getDate();
  const lead = (first.getDay() - weekStart + 7) % 7;
  const cells: (Date | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}
