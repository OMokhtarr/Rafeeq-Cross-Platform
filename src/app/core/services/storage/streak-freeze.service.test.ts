import {
  MAX_FREEZES,
  freezeCount,
  loadFreezePool,
  earnFreezes,
  settleFreezes,
  wasFrozen,
  lastFrozenDate,
  resetFreezePool,
} from "./streak-freeze.service";
import {
  recordQuizCompletion,
  computeQuizStreak,
  quizStreakRecoveryInfo,
} from "./quiz-streak.service";
import { todayStr, daysAgoStr } from "../../utils/local-date.util";

beforeEach(() => {
  localStorage.clear();
});

describe("starting state", () => {
  it("starts full so existing users get the safety net immediately", () => {
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
    expect(freezeCount("quiz")).toBe(MAX_FREEZES);
  });

  it("treats a corrupt store as full rather than losing the net", () => {
    localStorage.setItem("rafiq_hifz_freeze_tokens_v1", "{not json");
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });

  it("clamps an out-of-range stored count", () => {
    localStorage.setItem(
      "rafiq_hifz_freeze_tokens_v1",
      JSON.stringify({ count: 99, earnedOn: {}, spentOn: [] }),
    );
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });
});

describe("earning", () => {
  beforeEach(() => {
    // Start empty so earning is observable.
    localStorage.setItem(
      "rafiq_hifz_freeze_tokens_v1",
      JSON.stringify({ count: 0, earnedOn: {}, spentOn: [] }),
    );
  });

  it("earns nothing for the first activity of the day", () => {
    expect(earnFreezes("hifz", todayStr(), 1, false)).toBe(0);
    expect(freezeCount("hifz")).toBe(0);
  });

  it("earns one for the second activity", () => {
    earnFreezes("hifz", todayStr(), 1, false);
    expect(earnFreezes("hifz", todayStr(), 2, false)).toBe(1);
    expect(freezeCount("hifz")).toBe(1);
  });

  it("caps at MAX_FREEZES no matter how much is done", () => {
    earnFreezes("hifz", todayStr(), 10, false);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });

  it("is idempotent for a given day", () => {
    earnFreezes("hifz", todayStr(), 2, false);
    earnFreezes("hifz", todayStr(), 2, false);
    earnFreezes("hifz", todayStr(), 2, false);
    expect(freezeCount("hifz")).toBe(1);
  });

  it("blocks the repair double-dip: the 2nd activity is spent on the repair", () => {
    expect(earnFreezes("hifz", todayStr(), 2, true)).toBe(0);
    expect(freezeCount("hifz")).toBe(0);
    // The 3rd does earn.
    expect(earnFreezes("hifz", todayStr(), 3, true)).toBe(1);
    expect(freezeCount("hifz")).toBe(1);
  });

  it("does not revoke a freeze already granted if a repair happens later", () => {
    earnFreezes("hifz", todayStr(), 2, false); // earned 1
    expect(freezeCount("hifz")).toBe(1);
    earnFreezes("hifz", todayStr(), 2, true); // repair raises the threshold
    expect(freezeCount("hifz")).toBe(1); // still 1, not clawed back
  });

  it("does not re-grant for the same activity after the pool drains", () => {
    earnFreezes("hifz", todayStr(), 3, false); // fills to 2
    expect(freezeCount("hifz")).toBe(2);
    // Drain the pool, then replay the same day's activity.
    const state = loadFreezePool("hifz");
    state.count = 0;
    localStorage.setItem("rafiq_hifz_freeze_tokens_v1", JSON.stringify(state));
    expect(earnFreezes("hifz", todayStr(), 3, false)).toBe(0);
    expect(freezeCount("hifz")).toBe(0);
  });

  it("keeps the two pools independent", () => {
    earnFreezes("hifz", todayStr(), 3, false);
    expect(freezeCount("hifz")).toBe(2);
    // quiz pool untouched at its default full value
    expect(freezeCount("quiz")).toBe(MAX_FREEZES);
  });
});

describe("spending", () => {
  it("does nothing when the streak is alive today", () => {
    const active = new Set([daysAgoStr(1), todayStr()]);
    expect(settleFreezes("hifz", active)).toEqual([]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });

  it("does nothing when the last activity was yesterday", () => {
    // The day is not over; the user may still act.
    const active = new Set([daysAgoStr(1)]);
    expect(settleFreezes("hifz", active)).toEqual([]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });

  it("covers one missed day with one freeze", () => {
    const active = new Set([daysAgoStr(2)]);
    const covered = settleFreezes("hifz", active);
    expect(covered).toEqual([daysAgoStr(1)]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES - 1);
    expect(wasFrozen("hifz", daysAgoStr(1))).toBe(true);
  });

  it("covers two consecutive missed days with both freezes", () => {
    const active = new Set([daysAgoStr(3)]);
    const covered = settleFreezes("hifz", active);
    expect(covered).toEqual([daysAgoStr(2), daysAgoStr(1)]);
    expect(freezeCount("hifz")).toBe(0);
  });

  it("declines a three-day gap rather than partially bridging it", () => {
    const active = new Set([daysAgoStr(4)]);
    const covered = settleFreezes("hifz", active);
    // A partial spend would leave yesterday uncovered but make the day before
    // active — the exact state repair looks for — letting a 3-day gap survive.
    expect(covered).toEqual([]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });

  it("keeps freezes for the new streak when the user returns after a long lapse", () => {
    const covered = settleFreezes("hifz", new Set([daysAgoStr(30)]));
    expect(covered).toEqual([]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
    expect(lastFrozenDate("hifz")).toBeNull();
  });

  it("declines a two-day gap when only one freeze is left", () => {
    localStorage.setItem(
      "rafiq_hifz_freeze_tokens_v1",
      JSON.stringify({ count: 1, earnedOn: {}, spentOn: [] }),
    );
    expect(settleFreezes("hifz", new Set([daysAgoStr(3)]))).toEqual([]);
    expect(freezeCount("hifz")).toBe(1);
  });

  it("spends nothing when the pool is empty", () => {
    localStorage.setItem(
      "rafiq_hifz_freeze_tokens_v1",
      JSON.stringify({ count: 0, earnedOn: {}, spentOn: [] }),
    );
    expect(settleFreezes("hifz", new Set([daysAgoStr(2)]))).toEqual([]);
  });

  it("is idempotent across repeated calls", () => {
    const active = new Set([daysAgoStr(2)]);
    const first = settleFreezes("hifz", active);
    const second = settleFreezes("hifz", active);
    const third = settleFreezes("hifz", active);
    expect(first).toEqual([daysAgoStr(1)]);
    expect(second).toEqual([]);
    expect(third).toEqual([]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES - 1);
  });

  it("writes the covered day where streak maths already looks", () => {
    settleFreezes("quiz", new Set([daysAgoStr(2)]));
    const bridged = JSON.parse(
      localStorage.getItem("rafiq_quiz_streak_freeze_v1") ?? "[]",
    );
    expect(bridged).toContain(daysAgoStr(1));
  });

  it("does nothing when there is no history at all", () => {
    expect(settleFreezes("hifz", new Set())).toEqual([]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });

  it("never spends a freeze on or after the day being settled up to", () => {
    // Regression: settling before recording a backdated activity used to treat
    // the day about to be recorded as missed and burn a freeze on it.
    const covered = settleFreezes(
      "hifz",
      new Set([daysAgoStr(3)]),
      daysAgoStr(2),
    );
    expect(covered).toEqual([]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });

  it("settles only up to an explicit asOf date", () => {
    // 5-ago active, settling up to 3-ago → only 4-ago is missed.
    const covered = settleFreezes(
      "hifz",
      new Set([daysAgoStr(5)]),
      daysAgoStr(3),
    );
    expect(covered).toEqual([daysAgoStr(4)]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES - 1);
  });

  it("skips a day already bridged by a repair", () => {
    localStorage.setItem(
      "rafiq_hifz_streak_freeze_v1",
      JSON.stringify([daysAgoStr(1)]),
    );
    const covered = settleFreezes("hifz", new Set([daysAgoStr(2)]));
    expect(covered).toEqual([]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });
});

describe("frozen vs repaired", () => {
  it("distinguishes a frozen day from a repaired one", () => {
    // Repaired: present in the bridged store but never spent a freeze.
    localStorage.setItem(
      "rafiq_hifz_streak_freeze_v1",
      JSON.stringify([daysAgoStr(5)]),
    );
    expect(wasFrozen("hifz", daysAgoStr(5))).toBe(false);

    settleFreezes("hifz", new Set([daysAgoStr(2)]));
    expect(wasFrozen("hifz", daysAgoStr(1))).toBe(true);
  });

  it("reports the most recent frozen day", () => {
    expect(lastFrozenDate("hifz")).toBeNull();
    settleFreezes("hifz", new Set([daysAgoStr(3)]));
    expect(lastFrozenDate("hifz")).toBe(daysAgoStr(1));
  });
});

describe("no stacking with repair", () => {
  it("leaves a three-day gap unrecoverable by repair", () => {
    // The bug a partial spend would create: freezes bridge the two oldest
    // missed days, which makes the day before yesterday active, which is
    // precisely what repair requires — so two extra quizzes today would
    // resurrect a streak that should have died.
    recordQuizCompletion(daysAgoStr(4));
    settleFreezes("quiz", new Set([daysAgoStr(4)]));

    expect(quizStreakRecoveryInfo().recoverable).toBe(false);

    recordQuizCompletion(todayStr());
    recordQuizCompletion(todayStr());
    expect(computeQuizStreak()).toBe(1); // today only — the old run is gone
  });

  it("still lets repair work on a one-day gap when freezes are exhausted", () => {
    localStorage.setItem(
      "rafiq_quiz_freeze_tokens_v1",
      JSON.stringify({ count: 0, earnedOn: {}, spentOn: [] }),
    );
    recordQuizCompletion(daysAgoStr(3));
    recordQuizCompletion(daysAgoStr(2));
    settleFreezes("quiz", new Set([daysAgoStr(3), daysAgoStr(2)]));

    expect(quizStreakRecoveryInfo().recoverable).toBe(true);
    recordQuizCompletion(todayStr());
    recordQuizCompletion(todayStr());
    expect(quizStreakRecoveryInfo().recovered).toBe(true);
    expect(computeQuizStreak()).toBe(4);
  });
});

describe("reset", () => {
  it("restores a drained pool to full", () => {
    settleFreezes("hifz", new Set([daysAgoStr(3)]));
    expect(freezeCount("hifz")).toBe(0);
    resetFreezePool("hifz");
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });
});
