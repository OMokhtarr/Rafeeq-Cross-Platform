import { loadDays, toggleItem, loadSettings, saveSettings, ensureSince } from "../trackerStore";

beforeEach(() => localStorage.clear());

describe("days", () => {
  it("starts empty", () => expect(loadDays()).toEqual({}));
  it("toggles an item on and off", () => {
    expect(toggleItem("2026-09-24", "fajr")["2026-09-24"]).toEqual(["fajr"]);
    expect(toggleItem("2026-09-24", "fajr")["2026-09-24"]).toEqual([]);
    expect(loadDays()["2026-09-24"]).toEqual([]);
  });
  it("keeps every day so the calendar can show old history", () => {
    for (let d = 10; d <= 18; d++) toggleItem(`2026-09-${d}`, "fajr");
    const keys = Object.keys(loadDays()).sort();
    expect(keys).toHaveLength(9);
    expect(keys[0]).toBe("2026-09-10");
  });
  it("survives corrupt JSON", () => {
    localStorage.setItem("rafeeq.tracker.days", "{not json");
    expect(loadDays()).toEqual({});
    localStorage.setItem("rafeeq.tracker.days", "[1,2]");
    expect(loadDays()).toEqual({});
  });
});

describe("settings", () => {
  it("defaults every section on", () => {
    expect(loadSettings()).toEqual({
      prayers: true, azkar: true, quran: true, daily: true, rawatib: true, fasting: true,
    });
  });
  it("round-trips and always keeps prayers on", () => {
    saveSettings({ ...loadSettings(), azkar: false, prayers: false });
    expect(loadSettings().azkar).toBe(false);
    expect(loadSettings().prayers).toBe(true);
  });
  it("survives corrupt JSON", () => {
    localStorage.setItem("rafeeq.tracker.settings", "nope");
    expect(loadSettings().quran).toBe(true);
  });
});

describe("since", () => {
  it("records the first day once and never moves it", () => {
    expect(ensureSince("2026-09-26")).toBe("2026-09-26");
    expect(ensureSince("2026-10-01")).toBe("2026-09-26");
  });
  it("replaces a malformed value", () => {
    localStorage.setItem("rafeeq.tracker.since", "garbage");
    expect(ensureSince("2026-09-26")).toBe("2026-09-26");
  });
});
