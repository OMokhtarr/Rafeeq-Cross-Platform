/**
 * Logic behind the freeze meter. Tested as plain functions rather than by
 * rendering: @testing-library/react is not a dependency of this project, and
 * the copy and notice rules are the parts worth pinning down.
 */
import {
  freezeStateLine,
  shouldShowSpendNotice,
  weekdayName,
} from "./StreakFreezeMeter";
import { todayStr, daysAgoStr } from "../../core/utils/local-date.util";

describe("state line", () => {
  it("says the streak is protected when full", () => {
    expect(freezeStateLine("hifz", 2, "en")).toMatch(/Both freezes ready/);
  });

  it("says how to earn another when partly spent", () => {
    expect(freezeStateLine("hifz", 1, "en")).toMatch(
      /Do an extra session today to earn another/,
    );
  });

  it("leaves the count to the freeze row above it", () => {
    // The row already shows pips and the total; repeating it here showed the
    // same number twice within a few lines.
    expect(freezeStateLine("hifz", 1, "en")).not.toMatch(/1 of 2/);
  });

  it("says how to recover when empty", () => {
    expect(freezeStateLine("hifz", 0, "en")).toMatch(
      /Every extra session today earns one back/,
    );
  });

  it("names the activity that fills the pool", () => {
    // Freezes are earned by extra Hifz sessions, so the copy must name them.
    expect(freezeStateLine("hifz", 0, "en")).toMatch(/extra session/);
  });

  it("has Arabic copy for every state", () => {
    for (const count of [0, 1, 2]) {
      const line = freezeStateLine("hifz", count, "ar");
      expect(line).not.toMatch(/[A-Za-z]/);
      expect(line.length).toBeGreaterThan(0);
    }
  });
});

describe("spend notice", () => {
  it("shows nothing when no freeze was ever spent", () => {
    expect(shouldShowSpendNotice(null, todayStr(), todayStr())).toBe(false);
  });

  it("reports a freeze spent since the last activity", () => {
    expect(
      shouldShowSpendNotice(daysAgoStr(1), daysAgoStr(2), todayStr()),
    ).toBe(true);
  });

  it("retires once the user is active again after the frozen day", () => {
    expect(
      shouldShowSpendNotice(daysAgoStr(2), todayStr(), todayStr()),
    ).toBe(false);
  });

  it("does not resurface a freeze spent long ago", () => {
    expect(
      shouldShowSpendNotice(daysAgoStr(40), daysAgoStr(41), todayStr()),
    ).toBe(false);
  });

  it("still reports when the streak has no recorded activity", () => {
    expect(shouldShowSpendNotice(daysAgoStr(1), null, todayStr())).toBe(true);
  });
});

describe("weekday name", () => {
  it("names the day in English", () => {
    // 2026-08-10 is a Monday.
    expect(weekdayName("2026-08-10", "en")).toBe("Monday");
  });

  it("uses the local calendar day, not a UTC-shifted one", () => {
    // Parsed as local midnight; a UTC parse would slip a day west of UTC.
    expect(weekdayName("2026-08-09", "en")).toBe("Sunday");
  });
});
