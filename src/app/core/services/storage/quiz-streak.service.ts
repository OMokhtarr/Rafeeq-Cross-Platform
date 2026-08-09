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
 */

/** Dates (YYYY-MM-DD) on which at least one quiz was completed. */
const QUIZ_STREAK_KEY = "rafiq_quiz_streak_dates_v1";
/** How many quizzes were completed on each date — drives recovery. */
const QUIZ_COUNTS_KEY = "rafiq_quiz_streak_counts_v1";
/** Missed days bridged by completing extra quizzes the next day. */
const QUIZ_STREAK_FREEZE_KEY = "rafiq_quiz_streak_freeze_v1";

/** Quizzes needed on a recovery day to bridge one missed day. Matches Hifz. */
export const QUIZ_STREAK_RECOVERY_THRESHOLD = 2;

// ─── Date helpers ─────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

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
 * Record a completed quiz. Marks the day active (idempotent) and increments
 * that day's quiz count, then attempts streak recovery. Call once per finished
 * quiz. Returns the streak after recording.
 */
export function recordQuizCompletion(date: string = todayStr()): number {
  const dates = loadQuizStreakDates();
  if (!dates.includes(date)) {
    dates.push(date);
    saveDateList(QUIZ_STREAK_KEY, dates);
  }

  const counts = loadCounts();
  counts[date] = (counts[date] ?? 0) + 1;
  saveCounts(counts);

  tryRecoverQuizStreak();

  // Let a mounted Account view refresh without waiting on view lifecycle.
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("quiz-streak-changed"));
  }

  return computeQuizStreak();
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
  if (!doneDates.has(d.toISOString().slice(0, 10))) {
    d.setDate(d.getDate() - 1);
  }
  while (doneDates.has(d.toISOString().slice(0, 10))) {
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
  let prev: Date | null = null;

  for (const ds of dates) {
    const current = new Date(ds);
    if (prev) {
      const gapDays = Math.round(
        (current.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24),
      );
      run = gapDays === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
    prev = current;
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
  while (dates.has(d.toISOString().slice(0, 10))) {
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
