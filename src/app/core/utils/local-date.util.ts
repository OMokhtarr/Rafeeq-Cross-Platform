/**
 * Calendar-day helpers for streaks.
 *
 * Streaks are about the user's calendar day, not UTC's. `toISOString()` was
 * used originally and rolls the day over at midnight UTC, so for a user in
 * UTC+3 anything done between 00:00 and 03:00 local was filed under the
 * previous day — a session finished at 1am looked like it belonged to
 * yesterday, and a day genuinely completed could read as missed.
 *
 * These helpers derive the date from the local calendar fields instead, so
 * "today" always means today where the user is standing.
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** A date as YYYY-MM-DD in the device's local timezone. */
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Today, local. */
export function todayStr(): string {
  return localDateStr();
}

/**
 * The local date `n` days before today. Day arithmetic goes through
 * `setDate`, which handles month, year, and DST boundaries correctly.
 */
export function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDateStr(d);
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. Negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
