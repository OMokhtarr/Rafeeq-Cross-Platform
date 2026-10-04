/**
 * Wording for the Alarms sheet: when an alarm rings, and on which days.
 * Pure, so the sheet and the editor phrase an alarm the same way.
 */

import type { AppStrings } from "../../core/i18n/strings";
import { toHindiNumbers } from "../../core/utils/arabic.util";
import {
  ALL_DAYS,
  WEEK_FROM_SATURDAY,
  type PrayerAlarm,
} from "../../core/services/prayer/prayer-alarms.types";

type AlarmStrings = AppStrings["prayerAlarms"];

/** Same clock as the timetable, so a ring time reads like a prayer time. */
export function formatClock(date: Date, lang: string): string {
  return date.toLocaleTimeString(lang === "ar" ? "ar-SA" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** "today at 03:02", "tomorrow at 03:02", or "Thu 8 Oct at 03:02". */
export function formatWhen(when: Date, now: Date, lang: string, s: AlarmStrings): string {
  const time = formatClock(when, lang);
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (dayKey(when) === dayKey(now)) return s.todayAt.replace("{time}", time);
  if (dayKey(when) === dayKey(tomorrow)) return s.tomorrowAt.replace("{time}", time);
  const date = when.toLocaleDateString(lang === "ar" ? "ar-EG" : "en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return s.dateAt.replace("{date}", date).replace("{time}", time);
}

const ar = (n: number) => toHindiNumbers(n);

/** Arabic count of a noun: one and two are the word itself, 3–10 the plural. */
function arabicCount(n: number, one: string, two: string, few: string, many: string): string {
  if (n === 1) return one;
  if (n === 2) return two;
  if (n >= 3 && n <= 10) return `${ar(n)} ${few}`;
  return `${ar(n)} ${many}`;
}

/**
 * A length of time in words: "1 h 30 min" / "ساعة و٣٠ دقيقة". The Arabic
 * duals are in the genitive (دقيقتين, ساعتين) because the phrase always
 * follows the preposition بـ ("by").
 */
export function formatDuration(minutes: number, lang: string): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (lang !== "ar") {
    return [h ? `${h} h` : "", m || !h ? `${m} min` : ""].filter(Boolean).join(" ");
  }
  const hours = h ? arabicCount(h, "ساعة", "ساعتين", "ساعات", "ساعة") : "";
  const mins = m || !h ? arabicCount(m, "دقيقة", "دقيقتين", "دقائق", "دقيقة") : "";
  return hours && mins ? `${hours} و${mins}` : hours || mins;
}

/**
 * Where an alarm rings relative to the adhan: "10 min before the adhan",
 * "قبل الأذان بـ١٠ دقائق". The Arabic preposition takes a tatweel before a
 * digit (بـ١٠) and joins a word directly (بساعة).
 */
export function offsetPhrase(offsetMinutes: number, s: AlarmStrings, lang: string): string {
  if (offsetMinutes === 0) return s.atAdhan;
  const d = formatDuration(Math.abs(offsetMinutes), lang);
  const by = lang === "ar" ? (/^[٠-٩]/.test(d) ? `بـ${d}` : `ب${d}`) : d;
  return (offsetMinutes < 0 ? s.beforeAdhan : s.afterAdhan).replace("{d}", by);
}

/** How many alarms a prayer has, for its tab: "None", "1 alarm", "منبّهان". */
export function countLabel(n: number, s: AlarmStrings, lang: string): string {
  const num = lang === "ar" ? ar(n) : String(n);
  if (n === 0) return s.countNone;
  if (n === 1) return s.countOne;
  if (n === 2) return s.countTwo;
  return (n <= 10 ? s.countFew : s.countMany).replace("{n}", num);
}

/** "Every day", "Mon, Thu", "Ramadan", or "Ramadan, Mon, Thu". */
export function repeatSummary(alarm: PrayerAlarm, s: AlarmStrings, lang: string): string {
  const everyDay = ALL_DAYS.every((d) => alarm.days.includes(d));
  // Arabic chips are single letters, too terse for a sentence; the summary
  // uses the full names there.
  const names = lang === "ar" ? s.dayNames : s.dayChips;
  const days = everyDay
    ? []
    : WEEK_FROM_SATURDAY.filter((d) => alarm.days.includes(d)).map((d) => names[d - 1]);
  const sep = lang === "ar" ? "، " : ", ";
  if (alarm.ramadanOnly) return [s.ramadan, ...days].join(sep);
  return everyDay ? s.everyDay : days.join(sep);
}
