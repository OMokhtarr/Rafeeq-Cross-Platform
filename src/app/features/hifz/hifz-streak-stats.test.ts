/**
 * The read-only helpers behind the Account streak card: the longest run and
 * the seven-day strip.
 *
 * These read the same merged date set the streak itself uses — persistent
 * active days, the current plan's completed sessions, and bridged days — so
 * the cases below pin down that all three sources reach the card, and that a
 * day covered by a *freeze* is reported differently from one that was earned.
 */
import {
  recordStreakDay,
  computeLongestStreakPersistent,
  last7Days,
  type PlanSession,
} from "./hifz.service";
import { todayStr, daysAgoStr } from "../../core/utils/local-date.util";

/** The plan is irrelevant to most paths; the persistent store drives them. */
const noSessions: PlanSession[] = [];

beforeEach(() => {
  localStorage.clear();
});

/** Mark days as bridged, the store both repair and freezes write to. */
function bridge(...dates: string[]): void {
  localStorage.setItem("rafiq_hifz_streak_freeze_v1", JSON.stringify(dates));
}

/** Record a spent freeze, which is what distinguishes frozen from repaired. */
function spendFreezeOn(...dates: string[]): void {
  localStorage.setItem(
    "rafiq_hifz_freeze_tokens_v1",
    JSON.stringify({ count: 0, earnedOn: {}, spentOn: dates }),
  );
}

describe("longest streak", () => {
  it("is zero with no history", () => {
    expect(computeLongestStreakPersistent(noSessions)).toBe(0);
  });

  it("counts a single day as a streak of one", () => {
    recordStreakDay(todayStr());
    expect(computeLongestStreakPersistent(noSessions)).toBe(1);
  });

  it("measures the longest run, not the current one", () => {
    // A 4-day run that has since ended, then a 2-day run ending today.
    for (const n of [10, 9, 8, 7]) recordStreakDay(daysAgoStr(n));
    recordStreakDay(daysAgoStr(1));
    recordStreakDay(todayStr());
    expect(computeLongestStreakPersistent(noSessions)).toBe(4);
  });

  it("does not join runs separated by a missed day", () => {
    recordStreakDay(daysAgoStr(4));
    recordStreakDay(daysAgoStr(3));
    // day 2 missed
    recordStreakDay(daysAgoStr(1));
    expect(computeLongestStreakPersistent(noSessions)).toBe(2);
  });

  it("counts a bridged day as part of the run", () => {
    recordStreakDay(daysAgoStr(3));
    recordStreakDay(daysAgoStr(1));
    bridge(daysAgoStr(2));
    expect(computeLongestStreakPersistent(noSessions)).toBe(3);
  });

  it("includes days completed in the current plan", () => {
    const sessions = [
      { done: true, doneDate: daysAgoStr(1) },
      { done: true, doneDate: todayStr() },
    ] as PlanSession[];
    expect(computeLongestStreakPersistent(sessions)).toBe(2);
  });
});

describe("week strip", () => {
  it("always returns seven days, oldest first, ending today", () => {
    const days = last7Days(noSessions);
    expect(days).toHaveLength(7);
    expect(days[0].date).toBe(daysAgoStr(6));
    expect(days[6].date).toBe(todayStr());
  });

  it("marks nothing active on an untouched week", () => {
    expect(last7Days(noSessions).every((d) => !d.active)).toBe(true);
  });

  it("marks the days that were earned", () => {
    recordStreakDay(todayStr());
    recordStreakDay(daysAgoStr(2));
    const byDate = Object.fromEntries(
      last7Days(noSessions).map((d) => [d.date, d]),
    );
    expect(byDate[todayStr()].active).toBe(true);
    expect(byDate[daysAgoStr(2)].active).toBe(true);
    expect(byDate[daysAgoStr(1)].active).toBe(false);
  });

  it("reports a frozen day as active but flagged frozen", () => {
    // The card draws these differently: a held day, not an earned one.
    bridge(daysAgoStr(2));
    spendFreezeOn(daysAgoStr(2));
    const day = last7Days(noSessions).find((d) => d.date === daysAgoStr(2))!;
    expect(day.active).toBe(true);
    expect(day.frozen).toBe(true);
  });

  it("does not flag a repaired day as frozen", () => {
    // Repair writes the same bridged store; only spentOn tells them apart.
    bridge(daysAgoStr(2));
    const day = last7Days(noSessions).find((d) => d.date === daysAgoStr(2))!;
    expect(day.active).toBe(true);
    expect(day.frozen).toBe(false);
  });

  it("does not flag an earned day as frozen", () => {
    recordStreakDay(todayStr());
    const day = last7Days(noSessions).find((d) => d.date === todayStr())!;
    expect(day.frozen).toBe(false);
  });

  it("ignores activity older than the window", () => {
    recordStreakDay(daysAgoStr(7));
    expect(last7Days(noSessions).every((d) => !d.active)).toBe(true);
  });
});
