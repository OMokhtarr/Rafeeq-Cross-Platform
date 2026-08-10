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

  it("cannot bridge three consecutive missed days", () => {
    const active = new Set([daysAgoStr(4)]);
    const covered = settleFreezes("hifz", active);
    // Only the two oldest are covered; the run is broken regardless.
    expect(covered).toHaveLength(2);
    expect(freezeCount("hifz")).toBe(0);
    expect(wasFrozen("hifz", daysAgoStr(1))).toBe(false);
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

describe("reset", () => {
  it("restores a drained pool to full", () => {
    settleFreezes("hifz", new Set([daysAgoStr(3)]));
    expect(freezeCount("hifz")).toBe(0);
    resetFreezePool("hifz");
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });
});
