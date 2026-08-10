import {
  recordQuizCompletion,
  computeQuizStreak,
  computeLongestQuizStreak,
  countQuizzesOnDate,
  quizStreakRecoveryInfo,
} from "./quiz-streak.service";
import {
  MAX_FREEZES,
  freezeCount,
  wasFrozen,
} from "./streak-freeze.service";
import { todayStr, daysAgoStr } from "../../utils/local-date.util";

beforeEach(() => {
  localStorage.clear();
});

describe("quiz streak", () => {
  it("counts a completion on the local calendar day", () => {
    recordQuizCompletion();
    expect(countQuizzesOnDate(todayStr())).toBe(1);
    expect(computeQuizStreak()).toBe(1);
  });

  it("is idempotent per day for the streak but counts each quiz", () => {
    recordQuizCompletion();
    recordQuizCompletion();
    recordQuizCompletion();
    expect(computeQuizStreak()).toBe(1);
    expect(countQuizzesOnDate(todayStr())).toBe(3);
  });

  it("accumulates consecutive days", () => {
    recordQuizCompletion(daysAgoStr(2));
    recordQuizCompletion(daysAgoStr(1));
    recordQuizCompletion(todayStr());
    expect(computeQuizStreak()).toBe(3);
  });

  it("breaks on a gap", () => {
    recordQuizCompletion(daysAgoStr(5));
    recordQuizCompletion(daysAgoStr(4));
    recordQuizCompletion(todayStr());
    expect(computeQuizStreak()).toBe(1);
  });

  it("reports the longest run ever, not the current one", () => {
    recordQuizCompletion(daysAgoStr(10));
    recordQuizCompletion(daysAgoStr(9));
    recordQuizCompletion(daysAgoStr(8));
    recordQuizCompletion(daysAgoStr(7));
    recordQuizCompletion(todayStr());
    expect(computeQuizStreak()).toBe(1);
    expect(computeLongestQuizStreak()).toBe(4);
  });
});

describe("quiz streak repair", () => {
  /** Empty the freeze pool so the repair path is reachable. */
  function drainFreezes(): void {
    localStorage.setItem(
      "rafiq_quiz_freeze_tokens_v1",
      JSON.stringify({ count: 0, earnedOn: {}, spentOn: [] }),
    );
  }

  it("is recoverable after one missed day once freezes are exhausted", () => {
    recordQuizCompletion(daysAgoStr(3));
    recordQuizCompletion(daysAgoStr(2));
    drainFreezes();
    // yesterday missed
    const info = quizStreakRecoveryInfo();
    expect(info.recoverable).toBe(true);
    expect(info.needed).toBe(2);
  });

  it("bridges the missed day once the threshold is met", () => {
    recordQuizCompletion(daysAgoStr(3));
    recordQuizCompletion(daysAgoStr(2));
    drainFreezes();
    recordQuizCompletion(todayStr());
    recordQuizCompletion(todayStr()); // 2nd today triggers repair
    expect(quizStreakRecoveryInfo().recovered).toBe(true);
    // 3 prior days + bridged yesterday + today
    expect(computeQuizStreak()).toBe(4);
  });

  it("is not recoverable after a two-day gap with no freezes", () => {
    recordQuizCompletion(daysAgoStr(4));
    recordQuizCompletion(daysAgoStr(3));
    drainFreezes();
    expect(quizStreakRecoveryInfo().recoverable).toBe(false);
  });
});

describe("freeze takes precedence over repair", () => {
  it("covers a missed day silently, so repair is never needed", () => {
    recordQuizCompletion(daysAgoStr(3));
    recordQuizCompletion(daysAgoStr(2));
    // yesterday missed, but a freeze is available
    recordQuizCompletion(todayStr());

    expect(quizStreakRecoveryInfo().recoverable).toBe(false);
    expect(wasFrozen("quiz", daysAgoStr(1))).toBe(true);
    expect(freezeCount("quiz")).toBe(MAX_FREEZES - 1);
    // The run never broke: 3-ago, 2-ago, frozen yesterday, today.
    expect(computeQuizStreak()).toBe(4);
  });

  it("does not raise the earning threshold on a frozen day", () => {
    // A frozen day is not a repair, so the 2nd quiz today still earns.
    recordQuizCompletion(daysAgoStr(2));
    localStorage.setItem(
      "rafiq_quiz_freeze_tokens_v1",
      JSON.stringify({ count: 1, earnedOn: {}, spentOn: [] }),
    );
    recordQuizCompletion(todayStr()); // settles: freeze covers yesterday
    expect(wasFrozen("quiz", daysAgoStr(1))).toBe(true);
    expect(freezeCount("quiz")).toBe(0);

    recordQuizCompletion(todayStr()); // 2nd today → earns one back
    expect(freezeCount("quiz")).toBe(1);
  });
});

describe("earning through the quiz flow", () => {
  it("earns a freeze for an extra quiz on the same day", () => {
    localStorage.setItem(
      "rafiq_quiz_freeze_tokens_v1",
      JSON.stringify({ count: 0, earnedOn: {}, spentOn: [] }),
    );
    recordQuizCompletion(todayStr());
    expect(freezeCount("quiz")).toBe(0);
    recordQuizCompletion(todayStr());
    expect(freezeCount("quiz")).toBe(1);
    recordQuizCompletion(todayStr());
    expect(freezeCount("quiz")).toBe(2);
    recordQuizCompletion(todayStr()); // capped
    expect(freezeCount("quiz")).toBe(2);
  });
});

describe("local-day regression", () => {
  it("files a late-night completion under today, not yesterday", () => {
    // The bug this guards: with UTC dates, a user east of UTC completing a
    // quiz at 1am local had it recorded under the previous calendar day.
    const realDate = Date;
    const oneAmLocal = new realDate();
    oneAmLocal.setHours(1, 0, 0, 0);

    const spy = jest
      .spyOn(global, "Date")
      .mockImplementation((...args: unknown[]) =>
        args.length ? new (realDate as any)(...args) : new realDate(oneAmLocal),
      ) as unknown as jest.SpyInstance;

    try {
      recordQuizCompletion();
      const expected = `${oneAmLocal.getFullYear()}-${String(
        oneAmLocal.getMonth() + 1,
      ).padStart(2, "0")}-${String(oneAmLocal.getDate()).padStart(2, "0")}`;
      expect(countQuizzesOnDate(expected)).toBe(1);
    } finally {
      spy.mockRestore();
    }
  });
});
