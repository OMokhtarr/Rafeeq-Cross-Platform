/**
 * STREAK RESTORE (Rafeeq Pro)
 *
 * Brings back a long streak that freezes and the one-day repair could not
 * save. Modelled on LinkedIn Games' streak restore:
 *
 * - Only a lost streak of RESTORE_MIN_STREAK days or more qualifies.
 * - The offer appears once the break is final — the free one-day repair
 *   (STREAK_RECOVERY_THRESHOLD sessions the day after a miss) has passed.
 * - The first session must come by the end of the day after the offer first
 *   showed (LinkedIn's 48 hours, counted from when the person can know).
 * - Then a session every day, for restoreDaysNeeded(lost) days in a row.
 * - One attempt per break: a missed day or a late start ends it for good.
 *
 * On success the missed days are written to the repaired-days store, so the
 * old run and the new days join up: 45 lost + 3 restore days = 48.
 *
 * This file is pure date logic; hifz.service.ts reads and writes the stores.
 */
import { daysBetween } from "../../core/utils/local-date.util";

export const RESTORE_MIN_STREAK = 14;
/** A break older than this many missed days is not offered. */
export const RESTORE_MAX_GAP_DAYS = 7;
/** How far back to look for the break (gap + restore run, with room). */
const SEARCH_DAYS = 30;

/** Days in a row needed to restore a lost streak of `lost` days. */
export function restoreDaysNeeded(lost: number): number {
  if (lost >= 100) return 7;
  if (lost >= 50) return 5;
  return 3;
}

/** Persisted per device: the break on offer and how it ended. */
export interface RestoreRecord {
  /** Last active day of the lost run. Identifies the break. */
  lostEnd: string;
  lostLength: number;
  /** The day the offer first showed. */
  offeredOn: string;
  outcome?: "restored" | "expired";
}

export type RestoreState =
  | { kind: "none" }
  | {
      /** "available": not started; "inProgress": started, not done yet;
       *  "complete": done, waiting only on Pro to apply. */
      kind: "available" | "inProgress" | "complete";
      lostLength: number;
      needed: number;
      progress: number;
      /** Last day the first session can be done (available only). */
      startBy: string;
    };

export const NO_RESTORE: RestoreState = { kind: "none" };

export interface RestoreEvaluation {
  /** The record to persist (unchanged, new, or with an outcome). */
  record: RestoreRecord | null;
  state: RestoreState;
  /** Missed days to mark repaired — set only when the restore applies now. */
  fill: string[];
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** The most recent final break: the run that ended, and the new run's start. */
function findBreak(
  active: Set<string>,
  today: string,
): { lostEnd: string; lostLength: number; restart: string | null } | null {
  // The latest active day followed by a missed day. A miss yesterday is not
  // final (the one-day repair still applies today), and it supersedes any
  // older break, so stop there too.
  let lostEnd: string | null = null;
  for (let back = 2; back <= SEARCH_DAYS; back++) {
    const d = addDays(today, -back);
    if (active.has(d) && !active.has(addDays(d, 1))) {
      if (back === 2) return null;
      lostEnd = d;
      break;
    }
  }
  if (!lostEnd) return null;

  let lostLength = 0;
  for (let d = lostEnd; active.has(d); d = addDays(d, -1)) lostLength++;

  let restart: string | null = null;
  for (let d = addDays(lostEnd, 1); d <= today; d = addDays(d, 1)) {
    if (active.has(d)) {
      restart = d;
      break;
    }
  }
  return { lostEnd, lostLength, restart };
}

/**
 * Works out the restore offer for `today` from the days that count toward the
 * streak. `allowed` is whether the person has Pro; without it a finished
 * restore waits ("complete") instead of applying.
 */
export function evaluateRestore(
  active: Set<string>,
  saved: RestoreRecord | null,
  today: string,
  allowed: boolean,
): RestoreEvaluation {
  const none = (record: RestoreRecord | null): RestoreEvaluation => ({
    record,
    state: NO_RESTORE,
    fill: [],
  });

  const br = findBreak(active, today);
  if (!br || br.lostLength < RESTORE_MIN_STREAK) return none(saved);

  let record = saved;
  if (!record || record.lostEnd !== br.lostEnd) {
    // A new break: offer it only while it is recent, and not to someone who
    // already carried on for days without knowing (they never saw an offer).
    const missedSoFar = daysBetween(br.lostEnd, br.restart ?? today) - 1;
    const tooLate =
      missedSoFar > RESTORE_MAX_GAP_DAYS ||
      (br.restart !== null && daysBetween(br.restart, today) > 1);
    if (tooLate) return none(saved);
    record = { lostEnd: br.lostEnd, lostLength: br.lostLength, offeredOn: today };
  }
  if (record.outcome) return none(record);

  const needed = restoreDaysNeeded(record.lostLength);
  const startBy = addDays(record.offeredOn, 1);
  const base = { lostLength: record.lostLength, needed, startBy };

  if (br.restart === null) {
    if (today > startBy) return none({ ...record, outcome: "expired" });
    return { record, state: { kind: "available", progress: 0, ...base }, fill: [] };
  }
  if (br.restart > startBy) return none({ ...record, outcome: "expired" });

  // The run from the restart is unbroken up to today or yesterday: a miss
  // inside it would itself be the latest break, and findBreak would have
  // returned that one instead — which is how a missed day ends the attempt.
  let progress = 0;
  for (let d = br.restart; active.has(d) && d <= today; d = addDays(d, 1)) progress++;

  if (progress >= needed) {
    if (!allowed) {
      return { record, state: { kind: "complete", progress: needed, ...base }, fill: [] };
    }
    const fill: string[] = [];
    for (let d = addDays(br.lostEnd, 1); d < br.restart; d = addDays(d, 1)) fill.push(d);
    return { record: { ...record, outcome: "restored" }, state: NO_RESTORE, fill };
  }
  return { record, state: { kind: "inProgress", progress, ...base }, fill: [] };
}
