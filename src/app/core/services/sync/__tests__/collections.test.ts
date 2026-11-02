import { Preferences } from "@capacitor/preferences";
import { BACKED_UP_KEYS } from "../../storage/backup.service";
import { collectionForStorageKey, SYNC_COLLECTIONS } from "../collections";
import { stableStringify } from "../merge";
import * as hifz from "../../../../features/hifz/hifz.service";

jest.mock("@capacitor/preferences", () => ({
  Preferences: { get: jest.fn(), set: jest.fn() },
}));
jest.mock("../../../../features/hifz/hifz.service", () => ({
  loadPlanAsync: jest.fn(),
  savePlan: jest.fn(),
  savePlanAsync: jest.fn(),
  clearPlan: jest.fn(),
  clearPlanAsync: jest.fn(),
  loadBestPlanAsync: jest.fn(),
  saveBestPlan: jest.fn(),
  saveBestPlanAsync: jest.fn(),
  loadLatestPlanAsync: jest.fn(),
  saveLatestPlan: jest.fn(),
  saveLatestPlanAsync: jest.fn(),
  loadHifzReadingSessionAsync: jest.fn(),
  saveHifzReadingSession: jest.fn(),
  saveHifzReadingSessionAsync: jest.fn(),
}));

const col = (id: string) => {
  const c = SYNC_COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`no collection ${id}`);
  return c;
};

const note = (id: string) => ({ id, body: `b${id}`, ranges: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z" });

beforeEach(() => {
  localStorage.clear();
  (Preferences.get as jest.Mock).mockResolvedValue({ value: null });
  (Preferences.set as jest.Mock).mockResolvedValue(undefined);
  for (const fn of ["loadPlanAsync", "loadBestPlanAsync", "loadLatestPlanAsync", "loadHifzReadingSessionAsync"]) {
    (hifz as unknown as Record<string, jest.Mock>)[fn].mockResolvedValue(null);
  }
});

describe("round trip", () => {
  const cases: [string, string, unknown][] = [
    ["notes", "rafiq_notes_v1", [note("a"), note("b")]],
    ["bookmarks", "rafiq_bookmarks_v1", { "1:1": "2026-01-01T00:00:00Z", "2:5": "2026-02-01T00:00:00Z" }],
    ["trackerDays", "rafeeq.tracker.days", { "2026-10-01": ["fajr", "dhuhr"], "2026-10-02": ["fajr"] }],
    ["hifzStreakDates", "rafiq_hifz_streak_dates_v1", ["2026-10-02", "2026-10-01"]],
    ["settings", "rafiq_settings_v1", { fontSize: 3, reciteEngine: "deepgram" }],
    ["hiddenVerses", "rafiq_hidden_verses_v1", ["2:1", "1:1"]],
    ["hifzSessionCounts", "rafiq_hifz_session_counts_v1", { "2026-10-01": ["s1", "s2"] }],
  ];
  it.each(cases)("%s leaves the stored value semantically equal", async (id, key, stored) => {
    localStorage.setItem(key, JSON.stringify(stored));
    const c = col(id);
    await c.write(await c.read());
    expect(stableStringify(JSON.parse(localStorage.getItem(key) as string))).toBe(stableStringify(stored));
  });

  it("raw-string stores (theme, since) round-trip unquoted", async () => {
    localStorage.setItem("rafiq_theme_v1", "day");
    localStorage.setItem("rafeeq.tracker.since", "2026-01-05");
    for (const id of ["theme", "trackerSince"]) {
      const c = col(id);
      await c.write(await c.read());
    }
    expect(localStorage.getItem("rafiq_theme_v1")).toBe("day");
    expect(localStorage.getItem("rafeeq.tracker.since")).toBe("2026-01-05");
  });
});

describe("write", () => {
  it("keeps local order, appends new items in key order, and drops removed ones", async () => {
    localStorage.setItem("rafiq_notes_v1", JSON.stringify([note("c"), note("a"), note("b")]));
    const c = col("notes");
    await c.write({ a: note("a"), c: { ...note("c"), body: "edited" }, z: note("z"), m: note("m") });
    const out = JSON.parse(localStorage.getItem("rafiq_notes_v1") as string);
    expect(out.map((n: { id: string }) => n.id)).toEqual(["c", "a", "m", "z"]);
    expect(out[0].body).toBe("edited");
  });

  it("orders map stores the same way", async () => {
    localStorage.setItem("rafiq_bookmarks_v1", JSON.stringify({ "2:1": "x", "1:1": "y" }));
    await col("bookmarks").write({ "1:1": "y", "3:3": "n", "1:2": "n2" });
    expect(Object.keys(JSON.parse(localStorage.getItem("rafiq_bookmarks_v1") as string))).toEqual(["1:1", "1:2", "3:3"]);
  });

  it("quiz presets live in Preferences", async () => {
    const p = { id: "p1", name: "n", ranges: [], createdAt: 1, updatedAt: 2 };
    await col("quizPresets").write({ p1: p });
    expect(Preferences.set).toHaveBeenCalledWith({ key: "quizRangePresets", value: JSON.stringify([p]) });
  });

  it("hifz plan is dual-written and archives go to the archive key", async () => {
    const cur = { memorized: [], goal: {}, sessions: [], createdAt: "2026-10-01" };
    const old = { memorized: [], goal: {}, sessions: [], createdAt: "2026-05-01" };
    await col("hifzPlan").write({ current: cur, "archive:2026-05-01": old });
    expect(hifz.savePlan).toHaveBeenCalledWith(cur);
    expect(hifz.savePlanAsync).toHaveBeenCalledWith(cur);
    expect(JSON.parse(localStorage.getItem("rafiq_hifz_plan_archive_v1") as string)).toEqual({ "2026-05-01": old });
    expect(await col("hifzPlan").read()).toEqual({ "archive:2026-05-01": old });
  });

  it("hifz plan read maps the active plan to current", async () => {
    const cur = { memorized: [], goal: {}, sessions: [], createdAt: "2026-10-01" };
    (hifz.loadPlanAsync as jest.Mock).mockResolvedValue(cur);
    expect(await col("hifzPlan").read()).toEqual({ current: cur });
  });

  it("hifz object stores go through both savers", async () => {
    const best = { completedAt: "x", daysToFinish: 1, totalPages: 2, totalSessions: 3 };
    await col("hifzBest").write({ value: best });
    expect(hifz.saveBestPlan).toHaveBeenCalledWith(best);
    expect(hifz.saveBestPlanAsync).toHaveBeenCalledWith(best);
  });
});

describe("validate", () => {
  it("rejects a Note without id", () => {
    const { id: _id, ...noId } = note("a");
    expect(col("notes").validate(noId, "a")).toBe(false);
    expect(col("notes").validate(note("a"), "a")).toBe(true);
  });
  it("rejects malformed day keys", () => {
    expect(col("hifzStreakDates").validate(true, "2026-1-1")).toBe(false);
    expect(col("hifzStreakDates").validate(true, "2026-10-01")).toBe(true);
  });
  it("rejects a non-array hifzSessionCounts value", () => {
    expect(col("hifzSessionCounts").validate("s1", "2026-10-01")).toBe(false);
    expect(col("hifzSessionCounts").validate(["s1"], "2026-10-01")).toBe(true);
  });
  it("checks freeze pool and plan shape", () => {
    const fp = col("hifzFreezePool");
    expect(fp.validate({ count: 1, earnedOn: {}, spentOn: [] })).toBe(true);
    expect(fp.validate({ count: NaN, earnedOn: {}, spentOn: [] })).toBe(false);
    expect(fp.validate({ count: 1, earnedOn: {}, spentOn: {} })).toBe(false);
    expect(col("hifzPlan").validate({ createdAt: "x", sessions: [] }, "current")).toBe(true);
    expect(col("hifzPlan").validate({ createdAt: "x" }, "current")).toBe(false);
  });
  it("accepts any non-null JSON for plain objects", () => {
    expect(col("settings").validate({ a: 1 })).toBe(true);
    expect(col("settings").validate(null)).toBe(false);
  });
});

describe("lookup", () => {
  it("maps storage keys to collections", () => {
    expect(collectionForStorageKey("rafiq_notes_v1")?.id).toBe("notes");
    expect(collectionForStorageKey("rafiq_pro_v1")).toBeUndefined();
  });
  it("covers every backed-up key", () => {
    const missing = BACKED_UP_KEYS.filter((k) => !collectionForStorageKey(k));
    expect(missing).toEqual([]);
  });
});
