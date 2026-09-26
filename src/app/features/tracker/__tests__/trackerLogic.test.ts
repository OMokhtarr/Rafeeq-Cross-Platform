import {
  toDayKey, trackingDayKey, isUnlocked, hijriParts, fastingOccasion,
  visibleSections, sectionShares, dayScore, freshTimes, monthGrid,
} from "../trackerLogic";
import { SECTIONS, SectionId } from "../trackerCatalog";

const item = (id: string) =>
  SECTIONS.flatMap((s) => s.items).find((i) => i.id === id)!;
const allOn: Record<SectionId, boolean> = {
  prayers: true, azkar: true, quran: true, daily: true, rawatib: true, fasting: true,
};

describe("trackingDayKey", () => {
  const fajr = new Date(2026, 8, 24, 4, 30);
  it("is today after Fajr", () => {
    expect(trackingDayKey(new Date(2026, 8, 24, 10, 0), fajr)).toBe("2026-09-24");
  });
  it("is yesterday between midnight and Fajr", () => {
    expect(trackingDayKey(new Date(2026, 8, 24, 2, 0), fajr)).toBe("2026-09-23");
  });
  it("falls back to the calendar day without a Fajr time", () => {
    expect(trackingDayKey(new Date(2026, 8, 24, 2, 0))).toBe("2026-09-24");
  });
  it("pads months and days", () => {
    expect(toDayKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("isUnlocked", () => {
  const times = {
    fajr: new Date(2026, 8, 24, 4, 30),
    sunrise: new Date(2026, 8, 24, 5, 50),
    dhuhr: new Date(2026, 8, 24, 11, 50),
    isha: new Date(2026, 8, 24, 19, 10),
  };
  const noon = new Date(2026, 8, 24, 12, 0);
  it("opens once the anchor time passes", () => {
    expect(isUnlocked(item("dhuhr"), noon, times, false)).toBe(true);
    expect(isUnlocked(item("witr"), noon, times, false)).toBe(false);
  });
  it("uses sunrise + 15 min for duha when no duha time exists", () => {
    expect(isUnlocked(item("duha"), new Date(2026, 8, 24, 6, 0), times, false)).toBe(false);
    expect(isUnlocked(item("duha"), new Date(2026, 8, 24, 6, 5), times, false)).toBe(true);
  });
  it("always opens items with no anchor", () => {
    expect(isUnlocked(item("quranDaily"), new Date(2026, 8, 24, 5, 0), times, false)).toBe(true);
  });
  it("opens everything when there are no times", () => {
    expect(isUnlocked(item("witr"), noon, null, false)).toBe(true);
  });
  it("opens an item whose anchor key is missing", () => {
    expect(isUnlocked(item("asr"), noon, times, false)).toBe(true);
  });
  it("opens everything on the previous day (before Fajr)", () => {
    expect(isUnlocked(item("witr"), new Date(2026, 8, 24, 2, 0), times, true)).toBe(true);
  });
});

describe("fastingOccasion", () => {
  // Find a Gregorian date with the given Hijri month/day by scanning, so the
  // test doesn't hard-code a calendar conversion.
  const findHijri = (month: number, day: number): Date => {
    const d = new Date(2026, 0, 1);
    for (let i = 0; i < 800; i++) {
      const p = hijriParts(d);
      if (p.month === month && p.day === day) return new Date(d);
      d.setDate(d.getDate() + 1);
    }
    throw new Error("not found");
  };
  it("names Ramadan", () => expect(fastingOccasion(findHijri(9, 5))).toBe("ramadan"));
  it("names Arafah", () => expect(fastingOccasion(findHijri(12, 9))).toBe("arafah"));
  it("names Ashura and Tasu'a", () => {
    expect(fastingOccasion(findHijri(1, 10))).toBe("ashura");
    expect(fastingOccasion(findHijri(1, 9))).toBe("tasua");
  });
  it("names Shawwal but never Eid al-Fitr", () => {
    expect(fastingOccasion(findHijri(10, 2))).toBe("shawwal");
    expect(fastingOccasion(findHijri(10, 1))).toBeNull();
  });
  it("never offers Eid al-Adha or the Tashreeq days, even on a White Day", () => {
    [10, 11, 12, 13].forEach((d) => expect(fastingOccasion(findHijri(12, d))).toBeNull());
  });
  it("names the White Days in an ordinary month", () => {
    expect(fastingOccasion(findHijri(4, 13))).toBe("whiteDays");
  });
  it("names Monday and Thursday otherwise, and null for other days", () => {
    const d = findHijri(4, 20);
    for (let i = 0; i < 7; i++) {
      const day = new Date(d);
      day.setDate(d.getDate() + i);
      const dow = day.getDay();
      const expected = dow === 1 ? "monday" : dow === 4 ? "thursday" : null;
      const h = hijriParts(day).day;
      if (h >= 13 && h <= 15) continue;
      expect(fastingOccasion(day)).toBe(expected);
    }
  });
});

describe("scoring", () => {
  const ordinaryTuesday = (() => {
    const d = new Date(2026, 0, 1);
    while (!(d.getDay() === 2 && fastingOccasion(d) === null)) d.setDate(d.getDate() + 1);
    return d;
  })();

  it("hides fasting on a non-occasion day", () => {
    expect(visibleSections(ordinaryTuesday, allOn)).not.toContain("fasting");
  });
  it("hides switched-off sections but always keeps prayers", () => {
    const off = { ...allOn, azkar: false, prayers: false };
    const v = visibleSections(ordinaryTuesday, off);
    expect(v).toContain("prayers");
    expect(v).not.toContain("azkar");
  });
  it("gives prayers 50% and splits the rest equally", () => {
    const s = sectionShares(["prayers", "azkar", "quran", "daily", "rawatib"]);
    expect(s.prayers).toBe(0.5);
    expect(s.azkar).toBeCloseTo(0.125);
  });
  it("gives prayers 100% when nothing else is on", () => {
    expect(sectionShares(["prayers"])).toEqual({ prayers: 1 });
    expect(dayScore(["fajr", "dhuhr"], ["prayers"])).toBe(40);
  });
  it("scores within each section by ticked/total", () => {
    // prayers 5/5 → 50, quran 1/1 → 25, azkar 0/3 → 0
    expect(dayScore(["fajr", "dhuhr", "asr", "maghrib", "isha", "quranDaily"],
      ["prayers", "quran", "azkar"])).toBe(75);
  });
  it("ignores ticks for sections that aren't visible and never exceeds 100", () => {
    expect(dayScore(["fajr", "dhuhr", "asr", "maghrib", "isha", "fastToday"], ["prayers"])).toBe(100);
  });
});

describe("freshTimes", () => {
  const times = { fajr: new Date(2026, 8, 24, 4, 30), isha: new Date(2026, 8, 24, 19, 10) };
  it("keeps times computed for today's calendar date", () => {
    expect(freshTimes(times, new Date(2026, 8, 24, 23, 50))).toBe(times);
  });
  it("drops yesterday's times once midnight passes, so nothing locks on stale anchors", () => {
    expect(freshTimes(times, new Date(2026, 8, 25, 0, 5))).toBeNull();
  });
  it("passes null through", () => {
    expect(freshTimes(null, new Date())).toBeNull();
  });
});

describe("monthGrid", () => {
  it("pads September 2026 to start on Saturday", () => {
    // 1 Sep 2026 is a Tuesday: Sat, Sun, Mon come first as blanks.
    const cells = monthGrid(2026, 8, 6);
    expect(cells.slice(0, 3)).toEqual([null, null, null]);
    expect(cells[3]?.getDate()).toBe(1);
    expect(cells.filter(Boolean)).toHaveLength(30);
    expect(cells.length % 7).toBe(0);
  });
  it("needs no padding when the month starts on the week start", () => {
    // 1 Feb 2026 is a Sunday.
    expect(monthGrid(2026, 1, 0)[0]?.getDate()).toBe(1);
  });
});
