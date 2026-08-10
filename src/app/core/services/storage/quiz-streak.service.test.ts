import {
  recordQuizCompletion,
  computeQuizStreak,
  computeLongestQuizStreak,
  countQuizzesOnDate,
  quizStreakRecoveryInfo,
} from "./quiz-streak.service";
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
  it("is recoverable after exactly one missed day", () => {
    recordQuizCompletion(daysAgoStr(3));
    recordQuizCompletion(daysAgoStr(2));
    // yesterday missed
    const info = quizStreakRecoveryInfo();
    expect(info.recoverable).toBe(true);
    expect(info.needed).toBe(2);
  });

  it("bridges the missed day once the threshold is met", () => {
    recordQuizCompletion(daysAgoStr(3));
    recordQuizCompletion(daysAgoStr(2));
    recordQuizCompletion(todayStr());
    recordQuizCompletion(todayStr()); // 2nd today triggers repair
    expect(quizStreakRecoveryInfo().recovered).toBe(true);
    // 3 prior days + bridged yesterday + today
    expect(computeQuizStreak()).toBe(4);
  });

  it("is not recoverable after a two-day gap", () => {
    recordQuizCompletion(daysAgoStr(4));
    recordQuizCompletion(daysAgoStr(3));
    expect(quizStreakRecoveryInfo().recoverable).toBe(false);
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
