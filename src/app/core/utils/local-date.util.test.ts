import { localDateStr, daysAgoStr, daysBetween, todayStr } from "./local-date.util";

describe("localDateStr", () => {
  it("formats a date as YYYY-MM-DD with padding", () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDateStr(new Date(2026, 11, 25))).toBe("2026-12-25");
  });

  it("uses the local calendar day, not the UTC one", () => {
    // 1am local on Aug 10. In any timezone east of UTC this instant is still
    // Aug 9 in UTC, which is exactly the bug the helper exists to avoid.
    const lateNight = new Date(2026, 7, 10, 1, 0, 0);
    expect(localDateStr(lateNight)).toBe("2026-08-10");
  });

  it("agrees with the date's own local fields for a late-evening time", () => {
    // 11pm local — west of UTC this instant has already rolled over in UTC.
    const lateEvening = new Date(2026, 7, 10, 23, 0, 0);
    expect(localDateStr(lateEvening)).toBe("2026-08-10");
  });
});

describe("daysAgoStr", () => {
  it("returns today for 0", () => {
    expect(daysAgoStr(0)).toBe(todayStr());
  });

  it("steps back one calendar day at a time", () => {
    expect(daysBetween(daysAgoStr(1), todayStr())).toBe(1);
    expect(daysBetween(daysAgoStr(2), todayStr())).toBe(2);
    expect(daysBetween(daysAgoStr(30), todayStr())).toBe(30);
  });
});

describe("daysBetween", () => {
  it("counts whole days forward", () => {
    expect(daysBetween("2026-08-09", "2026-08-10")).toBe(1);
    expect(daysBetween("2026-08-01", "2026-08-31")).toBe(30);
  });

  it("is zero for the same day and negative going backward", () => {
    expect(daysBetween("2026-08-10", "2026-08-10")).toBe(0);
    expect(daysBetween("2026-08-10", "2026-08-09")).toBe(-1);
  });

  it("crosses month and year boundaries", () => {
    expect(daysBetween("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
    expect(daysBetween("2024-02-28", "2024-02-29")).toBe(1); // leap year
  });
});
