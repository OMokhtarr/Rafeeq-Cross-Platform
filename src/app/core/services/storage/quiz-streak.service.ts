/**
 * Quiz streak — the quiz-side counterpart to the Hifz session streak in
 * `features/hifz/hifz.service.ts`.
 *
 * Mirrors that store's rules deliberately, so both streaks behave identically:
 *   - a day counts once a quiz is completed on it (idempotent per day),
 *   - completed-days accumulate for the lifetime of the app and are never
 *     cleared by finishing or retaking quizzes,
 *   - a single missed day can be "bought back" by completing
 *     STREAK_RECOVERY_THRESHOLD quizzes the following day.
 *
 * Kept separate from hifz.service.ts rather than sharing helpers: the Hifz
 * streak is coupled to plan sessions (it merges each session's doneDate),
 * whereas quizzes only have completion dates and a per-day count.
 *
 * Dates throughout are the user's local calendar day — see local-date.util.
 */

import {
  localDateStr,
  todayStr,
  daysAgoStr as isoDaysAgo,
  daysBetween,
} from "../../utils/local-date.util";
import {
  settleFreezes,
  earnFreezes,
  wasFrozen,
} from "./streak-freeze.service";

/** Dates (YYYY-MM-DD) on which at least one quiz was completed. */
const QUIZ_STREAK_KEY = "rafiq_quiz_streak_dates_v1";
/** How many quizzes were completed on each date — drives recovery. */
const QUIZ_COUNTS_KEY = "rafiq_quiz_streak_counts_v1";
/** Missed days bridged by completing extra quizzes the next day. */
const QUIZ_STREAK_FREEZE_KEY = "rafiq_quiz_streak_freeze_v1";

/** Quizzes needed on a recovery day to bridge one missed day. Matches Hifz. */
export const QUIZ_STREAK_RECOVERY_THRESHOLD = 2;


// ─── Storage ──────────────────────────────────────────────────────────────────

function loadDateList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveDateList(key: string, dates: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(dates));
  } catch {}
}

function loadCounts(): Record<string, number> {
  try {
    const raw = localStorage.getItem(QUIZ_COUNTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function saveCounts(counts: Record<string, number>): void {
  try {
    localStorage.setItem(QUIZ_COUNTS_KEY, JSON.stringify(counts));
  } catch {}
}

export function loadQuizStreakDates(): string[] {
  return loadDateList(QUIZ_STREAK_KEY);
}

function loadFreezeDates(): string[] {
  return loadDateList(QUIZ_STREAK_FREEZE_KEY);
}

function addFreezeDate(date: string): void {
  const dates = loadFreezeDates();
  if (!dates.includes(date)) {
    dates.push(date);
    saveDateList(QUIZ_STREAK_FREEZE_KEY, dates);
  }
}

// ─── Recording ────────────────────────────────────────────────────────────────

/** Quizzes completed on a given date (defaults to today). */
export function countQuizzesOnDate(date: string = todayStr()): number {
  return loadCounts()[date] ?? 0;
}

/**
 * Record a completed quiz. Marks the day active (idempotent), increments that
 * day's quiz count, then settles freezes, attempts repair, and awards any
 * freezes earned. Call once per finished quiz. Returns the streak after
 * recording.
 */
export function recordQuizCompletion(date: string = todayStr()): number {
  // Settle first, while the store still shows the gap: recording would make
  // this date the last active day, hiding a missed yesterday from
  // settleFreezes and letting it fall through to repair instead. Settle only
  // up to the date being recorded, so a backdated call cannot spend a freeze
  // on the very day it is about to mark active.
  const frozen = settleQuizFreezes(date);

  const dates = loadQuizStreakDates();
  if (!dates.includes(date)) {
    dates.push(date);
    saveDateList(QUIZ_STREAK_KEY, dates);
  }

  const counts = loadCounts();
  counts[date] = (counts[date] ?? 0) + 1;
  saveCounts(counts);

  const repaired = tryRecoverQuizStreak();

  // A repair spends the day's extra quiz, so it cannot also earn a freeze.
  // A day bridged by a *freeze* is not a repair, hence the wasFrozen check —
  // both mechanisms write the same bridged-days store.
  const repairedToday =
    repaired ||
    (loadFreezeDates().includes(isoDaysAgo(1)) &&
      !wasFrozen("quiz", isoDaysAgo(1)));

  const earned = earnFreezes("quiz", date, counts[date], repairedToday);

  // Let a mounted Account view refresh without waiting on view lifecycle, and
  // carry the freeze changes so a listening view can toast them.
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("quiz-streak-changed", {
        detail: { frozen, earned } satisfies QuizFreezeChange,
      }),
    );
  }

  return computeQuizStreak();
}

/** Freeze changes carried by the `quiz-streak-changed` event. */
export interface QuizFreezeChange {
  /** Days newly covered by a freeze. */
  frozen: string[];
  /** Freezes newly earned. */
  earned: number;
}

/**
 * Spend freezes on any days missed since the last quiz. Safe to call on app
 * open and after each completion. Returns the dates newly covered.
 */
export function settleQuizFreezes(asOf: string = todayStr()): string[] {
  return settleFreezes("quiz", new Set(loadQuizStreakDates()), asOf);
}

// ─── Computation ──────────────────────────────────────────────────────────────

/** All days counting toward the streak: real active days + frozen days. */
function allQuizStreakDates(): Set<string> {
  const dates = new Set(loadQuizStreakDates());
  for (const f of loadFreezeDates()) dates.add(f);
  return dates;
}

/** Longest run of consecutive days ending today (or yesterday). */
function streakFromDateSet(doneDates: Set<string>): number {
  let streak = 0;
  const d = new Date();
  // If nothing done today, start from yesterday so a live streak still shows.
  if (!doneDates.has(localDateStr(d))) {
    d.setDate(d.getDate() - 1);
  }
  while (doneDates.has(localDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/** Current quiz streak in days. */
export function computeQuizStreak(): number {
  return streakFromDateSet(allQuizStreakDates());
}

/** Longest quiz streak ever achieved. */
export function computeLongestQuizStreak(): number {
  const dates = Array.from(allQuizStreakDates()).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;

  for (const ds of dates) {
    run = prev && daysBetween(prev, ds) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = ds;
  }
  return longest;
}

// ─── Recovery ─────────────────────────────────────────────────────────────────

export interface QuizStreakRecoveryInfo {
  /** True when yesterday was missed but a prior streak exists to reconnect. */
  recoverable: boolean;
  /** The streak length that would be restored if recovery completes. */
  restorableStreak: number;
  /** Quizzes completed today so far. */
  quizzesToday: number;
  /** Quizzes still needed today to recover the streak. */
  needed: number;
  /** Whether recovery has already been applied. */
  recovered: boolean;
}

/**
 * Describe whether the streak was broken by exactly one missed day (yesterday)
 * and can still be recovered today. Only a single-day gap is recoverable.
 */
export function quizStreakRecoveryInfo(): QuizStreakRecoveryInfo {
  const dates = allQuizStreakDates();
  const yesterday = isoDaysAgo(1);
  const dayBefore = isoDaysAgo(2);
  const quizzesToday = countQuizzesOnDate();
  const none: QuizStreakRecoveryInfo = {
    recoverable: false,
    restorableStreak: 0,
    quizzesToday,
    needed: 0,
    recovered: false,
  };

  // Already bridged yesterday → recovery has happened.
  if (dates.has(yesterday)) {
    return { ...none, recovered: loadFreezeDates().includes(yesterday) };
  }
  // Recoverable only if the run was alive the day before the miss.
  if (!dates.has(dayBefore)) return none;

  let priorStreak = 0;
  const d = new Date();
  d.setDate(d.getDate() - 2);
  while (dates.has(localDateStr(d))) {
    priorStreak++;
    d.setDate(d.getDate() - 1);
  }

  return {
    recoverable: true,
    restorableStreak: priorStreak + 1 + (quizzesToday > 0 ? 1 : 0),
    quizzesToday,
    needed: Math.max(0, QUIZ_STREAK_RECOVERY_THRESHOLD - quizzesToday),
    recovered: false,
  };
}

/**
 * Bridge yesterday into the freeze store when enough quizzes were completed
 * today. Idempotent. Returns true when it recovers.
 */
export function tryRecoverQuizStreak(): boolean {
  const info = quizStreakRecoveryInfo();
  if (info.recoverable && info.needed === 0) {
    addFreezeDate(isoDaysAgo(1));
    return true;
  }
  return false;
}
