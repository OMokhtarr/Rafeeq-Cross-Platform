/**
 * Streak freezes — a small consumable that absorbs a missed day.
 *
 * Rafeeq already has a *repair*: miss a day, and completing two activities the
 * next day buys it back. That is retroactive and needs the user to notice the
 * break in time. A freeze is the opposite — earned in advance by doing more
 * than the minimum, spent automatically when a day is missed, so a streak
 * survives a lapse the user never had to react to.
 *
 * Two independent pools, one per streak. Each is refilled only by its own
 * activity: extra Hifz sessions fill the Hifz pool, extra quizzes fill the quiz
 * pool. Repair still applies, as the fallback when a pool is empty.
 *
 * A spent freeze writes the covered date into the *existing* bridged-days store
 * (`rafiq_*_streak_freeze_v1` — which, despite the name, holds repaired days).
 * That keeps every streak computation working untouched: a frozen day counts
 * exactly as a repaired one already does. `spentOn` here is what tells the two
 * apart, so the UI never labels an auto-covered day as repaired.
 *
 * There is no server and no background job, so freezes cannot be spent at
 * midnight. `settleFreezes` is the sole consumption point and runs on app open
 * and after each recorded activity; it is idempotent by design.
 */

import { todayStr, daysBetween } from "../../utils/local-date.util";

export type PoolId = "hifz" | "quiz";

/** Freezes a pool can hold. */
export const MAX_FREEZES = 2;

/** Activities in a day beyond this earn freezes. Raised on a repair day. */
const BASE_THRESHOLD = 1;

const TOKEN_KEYS: Record<PoolId, string> = {
  hifz: "rafiq_hifz_freeze_tokens_v1",
  quiz: "rafiq_quiz_freeze_tokens_v1",
};

/**
 * Legacy stores of days bridged by a *repair*. Named "freeze" before freezes
 * existed; kept as-is so existing installs keep their data. Spent freezes are
 * appended here too — see the module comment.
 */
const BRIDGED_KEYS: Record<PoolId, string> = {
  hifz: "rafiq_hifz_streak_freeze_v1",
  quiz: "rafiq_quiz_streak_freeze_v1",
};

export interface FreezePool {
  /** 0..MAX_FREEZES. */
  count: number;
  /** date -> freezes earned that day. Makes earning idempotent. */
  earnedOn: Record<string, number>;
  /** Days covered by a spent freeze, as opposed to a repair. */
  spentOn: string[];
}

/** A pool the user has never touched starts full — the safety net is granted. */
function fullPool(): FreezePool {
  return { count: MAX_FREEZES, earnedOn: {}, spentOn: [] };
}

// ─── Storage ──────────────────────────────────────────────────────────────────

export function loadFreezePool(pool: PoolId): FreezePool {
  try {
    const raw = localStorage.getItem(TOKEN_KEYS[pool]);
    if (!raw) return fullPool();
    const parsed = JSON.parse(raw) as Partial<FreezePool>;
    return {
      count: clampCount(parsed.count),
      earnedOn: parsed.earnedOn ?? {},
      spentOn: parsed.spentOn ?? [],
    };
  } catch {
    return fullPool();
  }
}

function saveFreezePool(pool: PoolId, state: FreezePool): void {
  try {
    localStorage.setItem(TOKEN_KEYS[pool], JSON.stringify(state));
  } catch {}
}

function clampCount(n: unknown): number {
  if (typeof n !== "number" || Number.isNaN(n)) return MAX_FREEZES;
  return Math.max(0, Math.min(MAX_FREEZES, Math.floor(n)));
}

function loadBridgedDates(pool: PoolId): string[] {
  try {
    const raw = localStorage.getItem(BRIDGED_KEYS[pool]);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function addBridgedDate(pool: PoolId, date: string): void {
  const dates = loadBridgedDates(pool);
  if (!dates.includes(date)) {
    dates.push(date);
    try {
      localStorage.setItem(BRIDGED_KEYS[pool], JSON.stringify(dates));
    } catch {}
  }
}

// ─── Reading ──────────────────────────────────────────────────────────────────

/** Freezes currently available in a pool. */
export function freezeCount(pool: PoolId): number {
  return loadFreezePool(pool).count;
}

/** True when `date` was covered by a spent freeze rather than a repair. */
export function wasFrozen(pool: PoolId, date: string): boolean {
  return loadFreezePool(pool).spentOn.includes(date);
}

/** The most recent day a freeze covered, or null. Drives the card's notice. */
export function lastFrozenDate(pool: PoolId): string | null {
  const spent = loadFreezePool(pool).spentOn;
  if (spent.length === 0) return null;
  return spent.slice().sort().pop() ?? null;
}

// ─── Earning ──────────────────────────────────────────────────────────────────

/**
 * Award freezes for the activity just recorded.
 *
 * The first activity of a day keeps the streak alive and earns nothing; each
 * one beyond that earns a freeze, capped at MAX_FREEZES. On a day where a
 * repair was performed the threshold rises to the repair cost, so the same two
 * activities cannot both buy back the streak and earn a freeze.
 *
 * Idempotent per (pool, date): it recomputes from that day's activity count
 * rather than incrementing, so repeated calls converge on the same total.
 *
 * Returns the freezes newly earned by this call, for the caller to surface.
 */
export function earnFreezes(
  pool: PoolId,
  date: string,
  activityCount: number,
  repairedToday: boolean,
): number {
  const state = loadFreezePool(pool);
  const threshold = repairedToday ? BASE_THRESHOLD + 1 : BASE_THRESHOLD;

  const alreadyEarned = state.earnedOn[date] ?? 0;
  // What the day's activity has earned in total, before the pool cap.
  const deserved = Math.max(0, activityCount - threshold);
  // Never revoke what a day already granted: a rising repair threshold must not
  // claw back a freeze the user was already shown.
  const target = Math.max(alreadyEarned, deserved);

  const room = MAX_FREEZES - state.count;
  const gained = Math.min(target - alreadyEarned, room);
  if (gained <= 0) {
    // Record the day's entitlement even when the pool is full, so topping up
    // later does not re-grant freezes for activity already accounted for.
    if (target !== alreadyEarned) {
      state.earnedOn[date] = target;
      saveFreezePool(pool, state);
    }
    return 0;
  }

  state.count += gained;
  state.earnedOn[date] = alreadyEarned + gained;
  saveFreezePool(pool, state);
  return gained;
}

// ─── Spending ─────────────────────────────────────────────────────────────────

/**
 * Cover missed days with available freezes.
 *
 * Scans from the last active day forward to yesterday, spending one freeze per
 * uncovered day, oldest first, and stops at the first day it cannot cover — a
 * gap wider than the pool breaks the streak, and covering later days after an
 * uncoverable one would strand an unreachable run.
 *
 * Today is never covered: the day is not over, and the user may yet act.
 *
 * Idempotent — days already bridged are skipped, so calling on every app open
 * and after every activity is safe.
 *
 * Returns the dates newly covered, for the caller to surface.
 */
export function settleFreezes(pool: PoolId, activeDates: Set<string>): string[] {
  if (activeDates.size === 0) return [];

  const today = todayStr();
  const bridged = new Set(loadBridgedDates(pool));
  const covered = new Set([...activeDates, ...bridged]);

  // Newest day the streak is currently alive on. Anything after it is a gap.
  const lastActive = Array.from(covered)
    .filter((d) => daysBetween(d, today) >= 0)
    .sort()
    .pop();
  if (!lastActive) return [];

  const gapDays = daysBetween(lastActive, today);
  if (gapDays <= 1) return []; // active today or yesterday — nothing missed yet

  const state = loadFreezePool(pool);
  if (state.count === 0) return [];

  const newlyCovered: string[] = [];
  // Days strictly between lastActive and today, oldest first.
  for (let offset = 1; offset < gapDays; offset++) {
    const day = addDays(lastActive, offset);
    if (covered.has(day)) continue;
    if (state.count === 0) break; // out of freezes — the streak breaks here
    state.count--;
    state.spentOn.push(day);
    addBridgedDate(pool, day);
    newlyCovered.push(day);
  }

  if (newlyCovered.length > 0) saveFreezePool(pool, state);
  return newlyCovered;
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + n);
  const pad = (x: number) => (x < 10 ? `0${x}` : String(x));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ─── Reset ────────────────────────────────────────────────────────────────────

/** Clear a pool back to full. Used by tests and by a data reset. */
export function resetFreezePool(pool: PoolId): void {
  saveFreezePool(pool, fullPool());
}
