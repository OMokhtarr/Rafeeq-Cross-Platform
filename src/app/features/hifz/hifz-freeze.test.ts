/**
 * Freeze behaviour on the Hifz side. Kept separate from any future
 * hifz.service test so the streak/freeze surface stays readable on its own.
 */
import {
  recordHifzSession,
  recordStreakDay,
  recordSessionForDay,
  countSessionsOnDate,
  settleHifzFreezes,
  computeStreakPersistent,
  streakRecoveryInfo,
  type PlanSession,
} from "./hifz.service";
import {
  MAX_FREEZES,
  freezeCount,
  wasFrozen,
} from "../../core/services/storage/streak-freeze.service";
import { todayStr, daysAgoStr } from "../../core/utils/local-date.util";

/** The plan is irrelevant to these paths; the persistent stores drive them. */
const noSessions: PlanSession[] = [];

beforeEach(() => {
  localStorage.clear();
});

function drainHifzFreezes(): void {
  localStorage.setItem(
    "rafiq_hifz_freeze_tokens_v1",
    JSON.stringify({ count: 0, earnedOn: {}, spentOn: [] }),
  );
}

describe("per-day session counts", () => {
  it("counts distinct sessions on a day", () => {
    recordSessionForDay(todayStr(), "s1");
    recordSessionForDay(todayStr(), "s2");
    expect(countSessionsOnDate(todayStr())).toBe(2);
  });

  it("is idempotent for the same session id", () => {
    // Guards the done → undone → done toggle and the seed-on-load loop, either
    // of which would otherwise mint freezes for work already counted.
    recordSessionForDay(todayStr(), "s1");
    recordSessionForDay(todayStr(), "s1");
    recordSessionForDay(todayStr(), "s1");
    expect(countSessionsOnDate(todayStr())).toBe(1);
  });

  it("keeps days separate", () => {
    recordSessionForDay(daysAgoStr(1), "s1");
    recordSessionForDay(todayStr(), "s2");
    expect(countSessionsOnDate(daysAgoStr(1))).toBe(1);
    expect(countSessionsOnDate(todayStr())).toBe(1);
  });
});

describe("earning", () => {
  beforeEach(drainHifzFreezes);

  it("earns nothing for the first session of the day", () => {
    const { earned } = recordHifzSession(noSessions, "s1");
    expect(earned).toBe(0);
    expect(freezeCount("hifz")).toBe(0);
  });

  it("earns one for a second, distinct session", () => {
    recordHifzSession(noSessions, "s1");
    const { earned } = recordHifzSession(noSessions, "s2");
    expect(earned).toBe(1);
    expect(freezeCount("hifz")).toBe(1);
  });

  it("earns nothing for re-recording the same session", () => {
    recordHifzSession(noSessions, "s1");
    const { earned } = recordHifzSession(noSessions, "s1");
    expect(earned).toBe(0);
    expect(freezeCount("hifz")).toBe(0);
  });

  it("caps at MAX_FREEZES", () => {
    for (const id of ["s1", "s2", "s3", "s4", "s5"]) {
      recordHifzSession(noSessions, id);
    }
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });
});

describe("spending", () => {
  it("covers a missed day and keeps the streak alive", () => {
    recordHifzSession(noSessions, "s1", daysAgoStr(3));
    recordHifzSession(noSessions, "s2", daysAgoStr(2));
    // yesterday missed
    const { frozen } = recordHifzSession(noSessions, "s3", todayStr());

    expect(frozen).toEqual([daysAgoStr(1)]);
    expect(wasFrozen("hifz", daysAgoStr(1))).toBe(true);
    expect(computeStreakPersistent(noSessions)).toBe(4);
  });

  it("does not spend a freeze when recording a backdated session", () => {
    recordHifzSession(noSessions, "s1", daysAgoStr(3));
    const { frozen } = recordHifzSession(noSessions, "s2", daysAgoStr(2));
    expect(frozen).toEqual([]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);
  });

  it("leaves repair to handle a gap once freezes are gone", () => {
    recordHifzSession(noSessions, "s1", daysAgoStr(3));
    recordHifzSession(noSessions, "s2", daysAgoStr(2));
    drainHifzFreezes();
    // yesterday missed, no freezes → repair is the fallback
    expect(streakRecoveryInfo(noSessions).recoverable).toBe(true);
  });

  it("settles on demand without recording anything", () => {
    recordStreakDay(daysAgoStr(2));
    const covered = settleHifzFreezes(noSessions);
    expect(covered).toEqual([daysAgoStr(1)]);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES - 1);
  });
});

describe("repair does not double-dip", () => {
  it("withholds the freeze that the repair consumed", () => {
    recordHifzSession(noSessions, "s1", daysAgoStr(3));
    recordHifzSession(noSessions, "s2", daysAgoStr(2));
    drainHifzFreezes();

    // Two sessions today: the 2nd completes the repair, so neither earns.
    recordHifzSession(noSessions, "s3", todayStr());
    recordHifzSession(noSessions, "s4", todayStr());
    expect(freezeCount("hifz")).toBe(0);

    // The 3rd is genuinely extra and does earn.
    const { earned } = recordHifzSession(noSessions, "s5", todayStr());
    expect(earned).toBe(1);
  });

  it("still earns normally on a day that a freeze covered", () => {
    recordHifzSession(noSessions, "s1", daysAgoStr(2));
    localStorage.setItem(
      "rafiq_hifz_freeze_tokens_v1",
      JSON.stringify({ count: 1, earnedOn: {}, spentOn: [] }),
    );
    recordHifzSession(noSessions, "s2", todayStr()); // freeze covers yesterday
    expect(wasFrozen("hifz", daysAgoStr(1))).toBe(true);
    expect(freezeCount("hifz")).toBe(0);

    // A frozen day is not a repair, so the 2nd session today earns.
    const { earned } = recordHifzSession(noSessions, "s3", todayStr());
    expect(earned).toBe(1);
  });
});

describe("settle on open", () => {
  it("shows an intact streak after a lapse without any new activity", () => {
    // The promise: opening the app after missing a day covers it with a
    // freeze, rather than showing a broken streak until the next session.
    recordHifzSession(noSessions, "s1", daysAgoStr(3));
    recordHifzSession(noSessions, "s2", daysAgoStr(2));

    // Before settling, the run stops at the missed day.
    expect(computeStreakPersistent(noSessions)).toBe(0);

    settleHifzFreezes(noSessions);
    expect(computeStreakPersistent(noSessions)).toBe(3);
    expect(wasFrozen("hifz", daysAgoStr(1))).toBe(true);
  });

  it("is safe to call repeatedly across opens", () => {
    recordHifzSession(noSessions, "s1", daysAgoStr(2));
    settleHifzFreezes(noSessions);
    settleHifzFreezes(noSessions);
    settleHifzFreezes(noSessions);
    expect(freezeCount("hifz")).toBe(MAX_FREEZES - 1);
  });
});
