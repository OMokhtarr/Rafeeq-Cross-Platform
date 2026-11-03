import { createBackup, parseBackup, restoreBackup } from "../backup.service";
import { PRESETS_KEY } from "../../../../features/quiz/services/quiz-presets.service";
import { resetSyncState } from "../../sync/sync.service";
import { freezeCount, MAX_FREEZES } from "../streak-freeze.service";
import { idb } from "../idb.service";
import { SYNC_COLLECTIONS } from "../../sync/collections";

jest.mock("../../sync/sync.service", () => ({ resetSyncState: jest.fn() }));
jest.mock("../idb.service", () => ({ idb: { get: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

const NOTES = "rafiq_notes_v1";
const note = (id: string, body: string, updatedAt = "2026-10-01T00:00:00.000Z") => ({
  id,
  body,
  ranges: [],
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt,
});
const fileWith = (data: Record<string, string>) => ({ version: 1, exportedAt: "", platform: "web", data });
const localNotes = (): { id: string; body: string }[] => JSON.parse(localStorage.getItem(NOTES) as string);

beforeEach(() => {
  localStorage.clear();
  (idb.get as jest.Mock).mockResolvedValue(undefined);
  (idb.put as jest.Mock).mockResolvedValue(undefined);
  (idb.delete as jest.Mock).mockResolvedValue(undefined);
});

describe("backup carries freeze state", () => {
  it("round-trips the freeze pool and session counts", async () => {
    // Drain the pool to a distinctive value so a default cannot pass.
    localStorage.setItem(
      "rafiq_hifz_freeze_tokens_v1",
      JSON.stringify({ count: 1, earnedOn: { "2026-08-01": 1 }, spentOn: ["2026-08-02"] }),
    );
    localStorage.setItem(
      "rafiq_hifz_session_counts_v1",
      JSON.stringify({ "2026-08-03": ["s1", "s2"] }),
    );

    const backup = await createBackup();
    const json = JSON.stringify(backup);

    localStorage.clear();
    // Without a restore this reads as the full default.
    expect(freezeCount("hifz")).toBe(MAX_FREEZES);

    await restoreBackup(parseBackup(json));

    expect(freezeCount("hifz")).toBe(1);
    expect(localStorage.getItem("rafiq_hifz_session_counts_v1")).toBe(
      JSON.stringify({ "2026-08-03": ["s1", "s2"] }),
    );
  });
});

describe("backup carries the worship tracker", () => {
  it("round-trips the days, settings and start date", async () => {
    localStorage.setItem("rafeeq.tracker.days", JSON.stringify({ "2026-03-02": ["fajr"] }));
    localStorage.setItem("rafeeq.tracker.settings", JSON.stringify({ azkar: false }));
    localStorage.setItem("rafeeq.tracker.since", "2026-03-01");

    const json = JSON.stringify(await createBackup());
    localStorage.clear();
    await restoreBackup(parseBackup(json));

    expect(localStorage.getItem("rafeeq.tracker.days")).toBe(JSON.stringify({ "2026-03-02": ["fajr"] }));
    expect(localStorage.getItem("rafeeq.tracker.settings")).toBe(JSON.stringify({ azkar: false }));
    expect(localStorage.getItem("rafeeq.tracker.since")).toBe("2026-03-01");
  });
});

describe("restoring a backup", () => {
  it("resets sync state so the next sync is a first merge that deletes nothing", async () => {
    localStorage.setItem("rafeeq.tracker.since", "2026-03-01");
    const json = JSON.stringify(await createBackup());
    await restoreBackup(parseBackup(json));
    expect(resetSyncState).toHaveBeenCalledTimes(2);
  });

  it("resets sync state before the first write, so a run during the import is a first merge", async () => {
    localStorage.setItem(NOTES, JSON.stringify([note("old", "old")]));
    const notesAtReset: (string | null)[] = [];
    (resetSyncState as jest.Mock).mockImplementation(() => notesAtReset.push(localStorage.getItem(NOTES)));

    await restoreBackup(fileWith({ [NOTES]: JSON.stringify([note("new", "new")]) }));

    expect(notesAtReset).toEqual([JSON.stringify([note("old", "old")]), JSON.stringify([note("new", "new")])]);
  });

  it("still resets sync state when a step fails after the stores were overwritten", async () => {
    const data = new Proxy({ "rafeeq.tracker.since": "2026-03-01" } as Record<string, string>, {
      get: (target, key) => {
        if (key === PRESETS_KEY) throw new Error("boom");
        return Reflect.get(target, key);
      },
    });
    await expect(restoreBackup({ version: 1, exportedAt: "", data } as never)).rejects.toThrow("boom");
    expect(localStorage.getItem("rafeeq.tracker.since")).toBe("2026-03-01");
    expect(resetSyncState).toHaveBeenCalledTimes(2);
  });
});

describe("importing on a device that syncs", () => {
  const importing = (notes: unknown[]) => restoreBackup(fileWith({ [NOTES]: JSON.stringify(notes) }), { keepLocal: true });

  it("keeps an unsynced note the file lacks", async () => {
    localStorage.setItem(NOTES, JSON.stringify([note("unsynced", "mine")]));

    await importing([note("fromfile", "file")]);

    expect(localNotes().map((n) => n.id).sort()).toEqual(["fromfile", "unsynced"]);
  });

  it("keeps a local note newer than the file's copy, and takes the file's copy when it is newer", async () => {
    localStorage.setItem(
      NOTES,
      JSON.stringify([note("a", "local newer", "2026-10-05T00:00:00.000Z"), note("b", "local older", "2026-10-01T00:00:00.000Z")]),
    );

    await importing([note("a", "file older", "2026-10-01T00:00:00.000Z"), note("b", "file newer", "2026-10-05T00:00:00.000Z")]);

    const byId = Object.fromEntries(localNotes().map((n) => [n.id, n.body]));
    expect(byId).toEqual({ a: "local newer", b: "file newer" });
  });

  it("adds back day-set and map entries the file lacks, and takes the file's value for one with no time of its own", async () => {
    localStorage.setItem("rafiq_hifz_streak_dates_v1", JSON.stringify(["2026-10-01"]));
    localStorage.setItem("rafiq_bookmarks_v1", JSON.stringify({ "1:1": "local", "2:2": "local" }));

    await restoreBackup(
      fileWith({
        rafiq_hifz_streak_dates_v1: JSON.stringify(["2026-10-02"]),
        rafiq_bookmarks_v1: JSON.stringify({ "1:1": "file" }),
      }),
      { keepLocal: true },
    );

    expect(JSON.parse(localStorage.getItem("rafiq_hifz_streak_dates_v1") as string).sort()).toEqual(["2026-10-01", "2026-10-02"]);
    expect(JSON.parse(localStorage.getItem("rafiq_bookmarks_v1") as string)).toEqual({ "1:1": "file", "2:2": "local" });
  });

  it("a store that cannot be read first is skipped, and a failed write-back does not fail the import", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("rafiq_bookmarks_v1", "{corrupt");
    localStorage.setItem(NOTES, JSON.stringify([note("unsynced", "mine")]));
    const notes = SYNC_COLLECTIONS.find((c) => c.id === "notes") as (typeof SYNC_COLLECTIONS)[number];
    const write = jest.spyOn(notes, "write").mockRejectedValue(new Error("quota"));

    await expect(importing([note("fromfile", "file")])).resolves.toBeUndefined();

    expect(localNotes().map((n) => n.id)).toEqual(["fromfile"]);
    expect(localStorage.getItem("rafiq_bookmarks_v1")).toBe("{corrupt");
    write.mockRestore();
    warn.mockRestore();
  });

  it("still keeps local items when a later step of the restore fails", async () => {
    localStorage.setItem(NOTES, JSON.stringify([note("unsynced", "mine")]));
    const data = new Proxy({ [NOTES]: JSON.stringify([note("fromfile", "file")]) } as Record<string, string>, {
      get: (target, key) => {
        if (key === PRESETS_KEY) throw new Error("boom");
        return Reflect.get(target, key);
      },
    });

    await expect(restoreBackup({ version: 1, exportedAt: "", data } as never, { keepLocal: true })).rejects.toThrow("boom");

    expect(localNotes().map((n) => n.id).sort()).toEqual(["fromfile", "unsynced"]);
  });
});

describe("importing on a device that does not sync", () => {
  it("is a plain replace", async () => {
    localStorage.setItem(NOTES, JSON.stringify([note("local", "mine", "2030-01-01T00:00:00.000Z"), note("a", "newer", "2030-01-01T00:00:00.000Z")]));

    await restoreBackup(fileWith({ [NOTES]: JSON.stringify([note("a", "file")]) }));

    expect(localNotes()).toEqual([note("a", "file")]);
  });
});
