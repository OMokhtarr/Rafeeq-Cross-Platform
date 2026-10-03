/**
 * Wording for the Alarms sheet: when an alarm rings, and on which days.
 * Pure, so the sheet and the editor phrase an alarm the same way.
 */

import type { AppStrings } from "../../core/i18n/strings";
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
