import { Preferences } from "@capacitor/preferences";
import { BACKED_UP_KEYS } from "../../storage/backup.service";
import { collectionForStorageKey, SYNC_COLLECTIONS } from "../collections";
import { stableStringify } from "../merge";
import * as hifz from "../../../../features/hifz/hifz.service";

jest.mock("@capacitor/preferences", () => ({
  Preferences: { get: jest.fn(), set: jest.fn() },
}));
jest.mock("../../../../features/hifz/hifz.service", () => ({
  loadPlanStrict: jest.fn(),
  savePlanStrict: jest.fn(),
  clearPlanStrict: jest.fn(),
  loadBestPlanStrict: jest.fn(),
  saveBestPlanStrict: jest.fn(),
  loadLatestPlanStrict: jest.fn(),
  saveLatestPlanStrict: jest.fn(),
  loadHifzReadingSessionStrict: jest.fn(),
  saveHifzReadingSessionStrict: jest.fn(),
  clearHifzReadingSessionStrict: jest.fn(),
}));

const col = (id: string) => {
  const c = SYNC_COLLECTIONS.find((x) => x.id === id);
  if (!c) throw new Error(`no collection ${id}`);
  return c;
};

const note = (id: string, createdAt = "2026-01-01T00:00:00Z") => ({
  id,
  body: `b${id}`,
  ranges: [],
  createdAt,
  updatedAt: "2026-01-02T00:00:00Z",
});
const rec = (id: string, recordedAt: string) => ({
  id,
  verseKey: "1:1",
  elapsedSeconds: 0,
  reciter: "husary",
  recordedAt,
});
const ids = (key: string) =>
  JSON.parse(localStorage.getItem(key) as string).map((n: { id: string }) => n.id);
const plan = (createdAt: string) => ({ memorized: [], goal: {}, sessions: [], createdAt });

beforeEach(() => {
  localStorage.clear();
  (Preferences.get as jest.Mock).mockResolvedValue({ value: null });
  (Preferences.set as jest.Mock).mockResolvedValue(undefined);
  for (const fn of ["loadPlanStrict", "loadBestPlanStrict", "loadLatestPlanStrict", "loadHifzReadingSessionStrict"]) {
    (hifz as unknown as Record<string, jest.Mock>)[fn].mockResolvedValue(null);
  }
});

describe("round trip", () => {
  const cases: [string, string, unknown][] = [
    ["notes", "rafiq_notes_v1", [note("b", "2026-02-01"), note("a", "2026-01-01")]],
    ["bookmarks", "rafiq_bookmarks_v1", { "1:1": "2026-01-01T00:00:00Z", "2:5": "2026-02-01T00:00:00Z" }],
    ["trackerDays", "rafeeq.tracker.days", { "2026-10-01": ["fajr", "dhuhr"], "2026-10-02": ["fajr"] }],
    ["hifzStreakDates", "rafiq_hifz_streak_dates_v1", ["2026-10-02", "2026-10-01"]],
    ["settings", "rafiq_settings_v1", { fontSize: 3, reciteEngine: "deepgram" }],
    ["hiddenVerses", "rafiq_hidden_verses_v1", ["2:1", "1:1"]],
    ["hifzSessionCounts", "rafiq_hifz_session_counts_v1", { "2026-10-01": ["s1", "s2"] }],
    ["recitationHistory", "rafiq_recitation_history_v1", [rec("r2", "2026-02-01"), rec("r1", "2026-01-01")]],
    ["azkarFavorites", "azkar:favorites", ["z2", "z1"]],
    ["hifzFreezePool", "rafiq_hifz_freeze_tokens_v1", { count: 1, earnedOn: { "2026-10-01": 1 }, spentOn: [] }],
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

  it("quiz presets round-trip through Preferences", async () => {
    const p = { id: "p1", name: "n", ranges: [], createdAt: 1, updatedAt: 2 };
    (Preferences.get as jest.Mock).mockResolvedValue({ value: JSON.stringify([p]) });
    const c = col("quizPresets");
    await c.write(await c.read());
    expect(Preferences.set).toHaveBeenCalledWith({ key: "quizRangePresets", value: JSON.stringify([p]) });
  });
});

describe("write", () => {
  it("keeps local order for sets and maps, appends new items in key order", async () => {
    localStorage.setItem("rafiq_hidden_verses_v1", JSON.stringify(["3:1", "1:1", "2:1"]));
    await col("hiddenVerses").write({ "1:1": true, "3:1": true, "9:9": true, "4:4": true });
    expect(JSON.parse(localStorage.getItem("rafiq_hidden_verses_v1") as string)).toEqual(["3:1", "1:1", "4:4", "9:9"]);
    localStorage.setItem("rafiq_bookmarks_v1", JSON.stringify({ "2:1": "x", "1:1": "y" }));
    await col("bookmarks").write({ "1:1": "y", "3:3": "n", "1:2": "n2" });
    expect(Object.keys(JSON.parse(localStorage.getItem("rafiq_bookmarks_v1") as string))).toEqual(["1:1", "1:2", "3:3"]);
  });

  it("stores notes newest-first and recitation sessions by recordedAt desc", async () => {
    localStorage.setItem("rafiq_notes_v1", JSON.stringify([note("b", "2026-03-01"), note("a", "2026-01-01")]));
    await col("notes").write({
      a: note("a", "2026-01-01"),
      b: { ...note("b", "2026-03-01"), body: "edited" },
      old: note("old", "2025-01-01"),
      new: note("new", "2026-06-01"),
    });
    expect(ids("rafiq_notes_v1")).toEqual(["new", "b", "a", "old"]);
    expect(JSON.parse(localStorage.getItem("rafiq_notes_v1") as string)[1].body).toBe("edited");
    await col("recitationHistory").write({ r1: rec("r1", "2026-01-01"), r2: rec("r2", "2026-05-01") });
    expect(ids("rafiq_recitation_history_v1")).toEqual(["r2", "r1"]);
  });

  it("breaks date ties by id and drops removed items", async () => {
    const at = "2026-01-01";
    localStorage.setItem("rafiq_notes_v1", JSON.stringify([note("a", at), note("gone", at)]));
    await col("notes").write({ a: note("a", at), c: note("c", at), b: note("b", at) });
    expect(ids("rafiq_notes_v1")).toEqual(["a", "b", "c"]);
  });

  it("quiz presets live in Preferences", async () => {
    const p = { id: "p1", name: "n", ranges: [], createdAt: 1, updatedAt: 2 };
    await col("quizPresets").write({ p1: p });
    expect(Preferences.set).toHaveBeenCalledWith({ key: "quizRangePresets", value: JSON.stringify([p]) });
  });

  it("hifz plan is dual-written and archives go to the archive key", async () => {
    const cur = plan("2026-10-01");
    const old = plan("2026-05-01");
    await col("hifzPlan").write({ current: cur, "archive:2026-05-01": old });
    expect(hifz.savePlanStrict).toHaveBeenCalledWith(cur);
    expect(JSON.parse(localStorage.getItem("rafiq_hifz_plan_archive_v1") as string)).toEqual({ "2026-05-01": old });
    expect(await col("hifzPlan").read()).toEqual({ "archive:2026-05-01": old });
  });

  it("hifz plan read maps the active plan to current", async () => {
    const cur = plan("2026-10-01");
    (hifz.loadPlanStrict as jest.Mock).mockResolvedValue(cur);
    expect(await col("hifzPlan").read()).toEqual({ current: cur });
  });

  it("hifz object stores go through both savers", async () => {
    const best = { completedAt: "x", daysToFinish: 1, totalPages: 2, totalSessions: 3 };
    await col("hifzBest").write({ value: best });
    expect(hifz.saveBestPlanStrict).toHaveBeenCalledWith(best);
  });

  it("de-duplicates by id, first occurrence wins", async () => {
    localStorage.setItem("rafiq_notes_v1", JSON.stringify([note("a"), { ...note("a"), body: "dup" }]));
    await col("notes").write({ a: note("a") });
    expect(JSON.parse(localStorage.getItem("rafiq_notes_v1") as string)).toHaveLength(1);
  });

  it("does not create the plan archive key when there is nothing to archive", async () => {
    await col("hifzPlan").write({ current: plan("x") });
    expect(localStorage.getItem("rafiq_hifz_plan_archive_v1")).toBeNull();
  });
});

describe("deletes and failures", () => {
  it("a write without current clears the plan, sync and async", async () => {
    await col("hifzPlan").write({});
    expect(hifz.clearPlanStrict).toHaveBeenCalled();
    expect(hifz.savePlanStrict).not.toHaveBeenCalled();
  });

  it("a write without a reading value clears it", async () => {
    await col("hifzReading").write({});
    expect(hifz.clearHifzReadingSessionStrict).toHaveBeenCalled();
  });

  it("absent data reads as {}", async () => {
    for (const id of ["notes", "bookmarks", "settings", "hifzFreezePool", "hifzPlan", "quizPresets", "theme"]) {
      expect(await col(id).read()).toEqual({});
    }
  });

  it("corrupt JSON makes read reject", async () => {
    localStorage.setItem("rafiq_notes_v1", "{oops");
    await expect(col("notes").read()).rejects.toThrow();
    localStorage.setItem("rafiq_bookmarks_v1", "[1");
    await expect(col("bookmarks").read()).rejects.toThrow();
    localStorage.setItem("rafiq_hidden_verses_v1", "{oops");
    await expect(col("hiddenVerses").read()).rejects.toThrow();
  });

  it("a failing Hifz loader makes read reject and nothing is cleared", async () => {
    (hifz.loadPlanStrict as jest.Mock).mockRejectedValue(new Error("idb down"));
    (hifz.loadHifzReadingSessionStrict as jest.Mock).mockRejectedValue(new Error("idb down"));
    await expect(col("hifzPlan").read()).rejects.toThrow("idb down");
    await expect(col("hifzReading").read()).rejects.toThrow("idb down");
    expect(hifz.clearPlanStrict).not.toHaveBeenCalled();
    expect(hifz.clearHifzReadingSessionStrict).not.toHaveBeenCalled();
  });

  it("a failing Hifz saver makes write reject", async () => {
    (hifz.savePlanStrict as jest.Mock).mockRejectedValue(new Error("disk full"));
    await expect(col("hifzPlan").write({ current: plan("x") })).rejects.toThrow("disk full");
    (hifz.clearPlanStrict as jest.Mock).mockRejectedValue(new Error("disk full"));
    await expect(col("hifzPlan").write({})).rejects.toThrow("disk full");
  });

  it("a failing Preferences.get makes read reject", async () => {
    (Preferences.get as jest.Mock).mockRejectedValue(new Error("boom"));
    await expect(col("quizPresets").read()).rejects.toThrow();
  });

  it("a failing setItem makes write reject", async () => {
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    try {
      await expect(col("notes").write({ a: note("a") })).rejects.toThrow();
      await expect(col("settings").write({ value: { a: 1 } })).rejects.toThrow();
    } finally {
      spy.mockRestore();
    }
  });

  it("a failing Preferences.set makes write reject", async () => {
    (Preferences.set as jest.Mock).mockRejectedValue(new Error("quota"));
    await expect(col("quizPresets").write({})).rejects.toThrow();
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
    expect(fp.validate({ count: 1, earnedOn: {}, spentOn: [] }, "value")).toBe(true);
    expect(fp.validate({ count: NaN, earnedOn: {}, spentOn: [] }, "value")).toBe(false);
    expect(fp.validate({ count: 1, earnedOn: {}, spentOn: {} }, "value")).toBe(false);
    expect(col("hifzPlan").validate({ createdAt: "x", sessions: [] }, "current")).toBe(true);
    expect(col("hifzPlan").validate({ createdAt: "x" }, "current")).toBe(false);
  });
  it("checks each plain store's own shape", () => {
    expect(col("settings").validate({ a: 1 }, "value")).toBe(true);
    expect(col("settings").validate("x", "value")).toBe(false);
    expect(col("settings").validate(null, "value")).toBe(false);
    expect(col("theme").validate({}, "value")).toBe(false);
    expect(col("theme").validate("day", "value")).toBe(true);
    expect(col("searchRecents").validate({}, "value")).toBe(false);
    expect(col("searchRecents").validate(["a"], "value")).toBe(true);
    expect(col("lastPage").validate("12", "value")).toBe(true);
    expect(col("lastPage").validate(12, "value")).toBe(true);
    expect(col("lastPage").validate("abc", "value")).toBe(false);
    expect(col("trackerSince").validate("2026-1-1", "value")).toBe(false);
  });
});

describe("lookup", () => {
  it("maps storage keys to collections", () => {
    expect(collectionForStorageKey("rafiq_notes_v1")?.id).toBe("notes");
    expect(collectionForStorageKey("rafiq_pro_v1")).toBeUndefined();
  });
  it("covers every backed-up key", () => {
    // Deliberately not synced.
    const NOT_SYNCED = [
      "rafiq_tafsir_resources_v1", // content cache, re-downloadable
    ];
    const missing = BACKED_UP_KEYS.filter((k) => !NOT_SYNCED.includes(k) && !collectionForStorageKey(k));
    expect(missing).toEqual([]);
    expect(collectionForStorageKey("rafiq_tafsir_resources_v1")).toBeUndefined();
  });
});
