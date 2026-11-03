import { Preferences } from "@capacitor/preferences";
import { idb } from "../../storage/idb.service";
import { loadPlanStrict, savePlanStrict, type HifzPlan } from "../../../../features/hifz/hifz.service";
import { installWriteHook, suppressHook } from "../local-changes";
import { pullSince, push, SyncOfflineError } from "../sync-remote";
import { getLastSyncedAt, resetSyncState, syncNow, SYNC_APPLIED_EVENT } from "../sync.service";
import type { SyncRow } from "../types";

jest.mock("../sync-remote", () => ({
  ...jest.requireActual("../sync-remote"),
  pullSince: jest.fn(),
  push: jest.fn(),
}));
jest.mock("../../auth/supabase.client", () => ({ getSupabase: () => null }));
jest.mock("@capacitor/preferences", () => ({
  Preferences: { get: jest.fn(), set: jest.fn() },
}));
// hifz.service imports it; only its functions use it, and its API client warns on load.
jest.mock("../../data/metadata.service", () => ({}));
jest.mock("../../storage/idb.service", () => ({
  idb: { get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const NOTES = "rafiq_notes_v1";
const STATE = "rafiq_sync_state_v1";
const FREEZES = "rafiq_hifz_freeze_tokens_v1";

// ─── Devices: each has its own localStorage, IndexedDB and Preferences ───────

interface Device {
  ls: Record<string, string>;
  idb: Map<string, unknown>;
  prefs: Map<string, string>;
}
let devices: Record<string, Device>;
let current: string;

const newDevice = (): Device => ({ ls: {}, idb: new Map(), prefs: new Map() });

async function useDevice(name: string): Promise<void> {
  const ls: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) as string;
    ls[k] = localStorage.getItem(k) as string;
  }
  devices[current].ls = ls;
  devices[name] = devices[name] ?? newDevice();
  current = name;
  await suppressHook(async () => {
    localStorage.clear();
    for (const [k, v] of Object.entries(devices[name].ls)) localStorage.setItem(k, v);
  });
}

// ─── Fake cloud applying the sync_push last-write-wins rule ──────────────────

let cloud: Map<string, SyncRow>;
let tick: number;
let rejectKeys: Set<string>;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const nextServerAt = () => new Date(Date.UTC(2026, 10, 1) + ++tick * 1000).toISOString();

function seed(collection: string, item_key: string, value: unknown, edited_at: string, deleted = false) {
  cloud.set(`${collection}/${item_key}`, { collection, item_key, value, edited_at, deleted, server_at: nextServerAt() });
}

async function fakePull(cursor: string | null) {
  const rows = [...cloud.values()]
    .filter((r) => cursor === null || (r.server_at as string) > cursor)
    .sort((a, b) => (a.server_at as string).localeCompare(b.server_at as string));
  if (rows.length === 0) return { rows, cursor };
  // Like the real pull, re-read a little behind the last row next time.
  const last = Date.parse(rows[rows.length - 1].server_at as string);
  return { rows: clone(rows), cursor: new Date(last - 1500).toISOString() };
}

async function fakePush(rows: SyncRow[]) {
  const stored: SyncRow[] = [];
  for (const row of clone(rows)) {
    const id = `${row.collection}/${row.item_key}`;
    if (rejectKeys.has(id)) continue;
    const prev = cloud.get(id);
    if (!prev || Date.parse(row.edited_at) > Date.parse(prev.edited_at)) {
      cloud.set(id, { ...row, server_at: nextServerAt() });
    }
    stored.push(clone(cloud.get(id) as SyncRow));
  }
  return stored;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const note = (id: string, body = `b${id}`, updatedAt = "2026-10-01T00:00:00.000Z") => ({
  id,
  body,
  ranges: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt,
});
const setNotes = (...notes: unknown[]) => localStorage.setItem(NOTES, JSON.stringify(notes));
const localNotes = (): { id: string; body: string }[] => JSON.parse(localStorage.getItem(NOTES) ?? "[]");
const localNoteIds = () => localNotes().map((n) => n.id).sort();
const cloudRows = (collection: string) => [...cloud.values()].filter((r) => r.collection === collection);
const cloudLive = (collection: string) =>
  cloudRows(collection).filter((r) => !r.deleted).map((r) => r.item_key).sort();
const pushedKeys = (call: number) => ((push as jest.Mock).mock.calls[call][0] as SyncRow[]).map((r) => r.item_key);

const plan = (done: boolean): HifzPlan =>
  ({
    memorized: [],
    goal: {},
    createdAt: "2026-10-01T08:00:00.000Z",
    sessions: [{ id: "s1", label: "1", fromPage: 1, toPage: 2, done, ...(done ? { doneDate: "2026-10-02" } : {}) }],
  }) as unknown as HifzPlan;

beforeEach(() => {
  installWriteHook();
  localStorage.clear();
  devices = { A: newDevice() };
  current = "A";
  cloud = new Map();
  tick = 0;
  rejectKeys = new Set();
  (pullSince as jest.Mock).mockImplementation(fakePull);
  (push as jest.Mock).mockImplementation(fakePush);
  (idb.get as jest.Mock).mockImplementation(async (_s: string, id: string) => devices[current].idb.get(id));
  (idb.put as jest.Mock).mockImplementation(async (_s: string, rec: { id: string }) => {
    devices[current].idb.set(rec.id, rec);
  });
  (idb.delete as jest.Mock).mockImplementation(async (_s: string, id: string) => {
    devices[current].idb.delete(id);
  });
  (Preferences.get as jest.Mock).mockImplementation(async ({ key }: { key: string }) => ({
    value: devices[current].prefs.get(key) ?? null,
  }));
  (Preferences.set as jest.Mock).mockImplementation(async ({ key, value }: { key: string; value: string }) => {
    devices[current].prefs.set(key, value);
  });
});

describe("first merge", () => {
  it("uploads local notes to an empty cloud and deletes nothing", async () => {
    setNotes(note("a"), note("b"), note("c"));

    const result = await syncNow("u1");

    expect(result).toEqual({ status: "synced", appliedCollections: [] });
    expect(cloudLive("notes")).toEqual(["a", "b", "c"]);
    expect(cloudRows("notes").some((r) => r.deleted)).toBe(false);
    expect(localNoteIds()).toEqual(["a", "b", "c"]);
  });

  it("downloads cloud notes into an empty device and announces it", async () => {
    for (const id of ["a", "b", "c"]) seed("notes", id, note(id), "2026-10-01T00:00:00.000Z");
    const events: string[][] = [];
    const onApplied = (e: Event) => events.push((e as CustomEvent).detail.collections);
    window.addEventListener(SYNC_APPLIED_EVENT, onApplied);

    const result = await syncNow("u1");
    window.removeEventListener(SYNC_APPLIED_EVENT, onApplied);

    expect(result).toEqual({ status: "synced", appliedCollections: ["notes"] });
    expect(localNoteIds()).toEqual(["a", "b", "c"]);
    expect(events).toEqual([["notes"]]);
  });

  it("gives both sides every note when each has different ones", async () => {
    seed("notes", "c", note("c"), "2026-10-01T00:00:00.000Z");
    setNotes(note("a"), note("b"));

    await syncNow("u1");

    expect(localNoteIds()).toEqual(["a", "b", "c"]);
    expect(cloudLive("notes")).toEqual(["a", "b", "c"]);
  });
});

describe("display events", () => {
  it("fires the app's own change events only when their collections were applied", async () => {
    const heard: string[] = [];
    const settings = () => heard.push("settings");
    const streak = () => heard.push("streak");
    window.addEventListener("rafiq-settings-changed", settings);
    window.addEventListener("hifz-streak-changed", streak);

    seed("notes", "a", note("a"), "2026-10-01T00:00:00.000Z");
    await syncNow("u1");
    expect(heard).toEqual([]);

    seed("settings", "value", { soundEffects: false }, "2026-10-01T00:00:00.000Z");
    await syncNow("u1");
    expect(heard).toEqual(["settings"]);

    seed("hifzStreakDates", "2026-10-01", true, "2026-10-01T00:00:00.000Z");
    await syncNow("u1");
    expect(heard).toEqual(["settings", "streak"]);

    window.removeEventListener("rafiq-settings-changed", settings);
    window.removeEventListener("hifz-streak-changed", streak);
  });
});

describe("deletes", () => {
  it("pushes a tombstone after the first merge and a second device removes the note", async () => {
    setNotes(note("a"), note("b"));
    await syncNow("u1");
    await useDevice("B");
    await syncNow("u1");
    expect(localNoteIds()).toEqual(["a", "b"]);

    await useDevice("A");
    setNotes(note("b"));
    await syncNow("u1");
    expect(cloud.get("notes/a")?.deleted).toBe(true);

    await useDevice("B");
    await syncNow("u1");
    expect(localNoteIds()).toEqual(["b"]);
  });
});

describe("failures", () => {
  it("pushes pending local notes on the next run after dying between apply and push", async () => {
    setNotes(note("a"));
    await syncNow("u1");
    seed("notes", "c", note("c"), "2026-10-03T00:00:00.000Z");
    setNotes(note("a"), note("d"));
    (push as jest.Mock).mockRejectedValueOnce(new Error("app killed"));

    expect(await syncNow("u1")).toEqual({ status: "error", message: "app killed" });
    expect(localNoteIds()).toEqual(["a", "c", "d"]);
    expect(cloudLive("notes")).toEqual(["a", "c"]);

    expect((await syncNow("u1")).status).toBe("synced");
    expect(cloudLive("notes")).toEqual(["a", "c", "d"]);
    expect(localNoteIds()).toEqual(["a", "c", "d"]);
  });

  it("reports offline and leaves local data and the snapshot alone", async () => {
    setNotes(note("a"));
    await syncNow("u1");
    setNotes(note("a"), note("b"));
    const before = { notes: localStorage.getItem(NOTES), state: localStorage.getItem(STATE) };
    (pullSince as jest.Mock).mockRejectedValueOnce(new SyncOfflineError("Failed to fetch"));

    expect(await syncNow("u1")).toEqual({ status: "offline" });
    expect({ notes: localStorage.getItem(NOTES), state: localStorage.getItem(STATE) }).toEqual(before);
    expect(cloudLive("notes")).toEqual(["a"]);
  });

  it("never throws: an unexpected error becomes an error result", async () => {
    (pullSince as jest.Mock).mockRejectedValueOnce(new TypeError("rows is not iterable"));

    expect(await syncNow("u1")).toEqual({ status: "error", message: "rows is not iterable" });
  });

  it("skips a corrupt remote note and applies the others", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    seed("notes", "x", { id: "x", body: 42 }, "2026-10-01T00:00:00.000Z");
    seed("notes", "y", note("y"), "2026-10-01T00:00:00.000Z");
    seed("notes", "z", note("z"), "2026-10-01T00:00:00.000Z");

    expect((await syncNow("u1")).status).toBe("synced");

    expect(localNoteIds()).toEqual(["y", "z"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("notes/x"));
    warn.mockRestore();
  });

  it("skips notes when their store cannot be read, and still syncs the rest", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setNotes(note("a"));
    await syncNow("u1");
    seed("notes", "c", note("c"), "2026-10-03T00:00:00.000Z");
    tick += 10; // a later row moves the cursor well past the pull's re-read overlap
    seed("hiddenVerses", "2:255", true, "2026-10-03T00:00:00.000Z");
    localStorage.setItem(NOTES, "{corrupt");
    localStorage.setItem("rafiq_bookmarks_v1", JSON.stringify({ "1:1": "2026-10-01T00:00:00Z" }));

    expect((await syncNow("u1")).status).toBe("synced");
    expect(cloud.get("notes/a")?.deleted).toBe(false);
    expect(cloudLive("bookmarks")).toEqual(["1:1"]);
    expect(localStorage.getItem(NOTES)).toBe("{corrupt");

    // The cursor did not move past the notes it skipped.
    setNotes(note("a"));
    await syncNow("u1");
    expect(localNoteIds()).toEqual(["a", "c"]);
    warn.mockRestore();
  });

  it("does not re-push an item the server rejected until it changes", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    rejectKeys.add("notes/big");
    setNotes(note("a"), note("big"));
    await syncNow("u1");
    expect(pushedKeys(0)).toEqual(expect.arrayContaining(["a", "big"]));
    expect(cloudLive("notes")).toEqual(["a"]);

    await syncNow("u1");
    expect(push).toHaveBeenCalledTimes(1);

    setNotes(note("a"), note("big", "edited"));
    await syncNow("u1");
    expect(push).toHaveBeenCalledTimes(2);
    expect(pushedKeys(1)).toEqual(["big"]);
    warn.mockRestore();
  });
});

describe("lost pushes", () => {
  it("re-pushes a one-sided local edit that lost to a cloud copy stamped by a fast clock", async () => {
    setNotes(note("a"));
    await syncNow("u1");
    await syncNow("u1"); // moves the cursor past the row
    // Same content, but the stored edit time is far ahead (another device's
    // clock), and the row is old enough that the next pull does not see it.
    Object.assign(cloud.get("notes/a") as SyncRow, {
      edited_at: "2030-01-01T00:00:00.000Z",
      server_at: "2026-01-01T00:00:00.000Z",
    });
    setNotes(note("a", "edited"));

    expect((await syncNow("u1")).status).toBe("synced");

    expect((cloud.get("notes/a") as SyncRow).value).toMatchObject({ body: "edited" });
    expect(localNotes()[0].body).toBe("edited");
  });

  it("adopts a newer edit another device pushed between this device's pull and push", async () => {
    setNotes(note("a"));
    await syncNow("u1");
    setNotes(note("a", "mine"));
    (push as jest.Mock).mockImplementationOnce(async (rows: SyncRow[]) => {
      seed("notes", "a", note("a", "theirs"), "2099-01-01T00:00:00.000Z");
      return fakePush(rows);
    });

    const result = await syncNow("u1");

    expect(result).toEqual({ status: "synced", appliedCollections: ["notes"] });
    expect(localNotes()[0].body).toBe("theirs");
    expect((cloud.get("notes/a") as SyncRow).value).toMatchObject({ body: "theirs" });
  });
});

describe("edit times", () => {
  it("a note's own edit time decides, not a later edit of another note", async () => {
    setNotes(note("x", "v0", "2026-10-01T00:00:00.000Z"));
    await syncNow("u1");
    await useDevice("B");
    await syncNow("u1");

    await useDevice("A");
    setNotes(note("x", "a-edit", "2026-10-20T00:00:00.000Z"));
    await syncNow("u1");
    // B, offline: edited x at t10, then y at t30. Its notes dirty time is the
    // latest stamp of all, but x's own edit is older than A's.
    await useDevice("B");
    setNotes(note("x", "b-edit", "2026-10-10T00:00:00.000Z"), note("y", "y", "2026-10-30T00:00:00.000Z"));
    await syncNow("u1");

    expect(localNotes().find((n) => n.id === "x")?.body).toBe("a-edit");
    expect((cloud.get("notes/x") as SyncRow).value).toMatchObject({ body: "a-edit" });
    expect(cloudLive("notes")).toEqual(["x", "y"]);
  });

  it("a first merge keeps the cloud's newer copy over a stale local note", async () => {
    seed("notes", "x", note("x", "cloud", "2026-10-05T00:00:00.000Z"), "2026-10-05T00:00:00.000Z");
    setNotes(note("x", "stale", "2026-10-01T00:00:00.000Z"));

    await syncNow("u1");

    expect(localNotes()[0].body).toBe("cloud");
    expect((cloud.get("notes/x") as SyncRow).value).toMatchObject({ body: "cloud" });
  });
});

describe("first merge again", () => {
  it("a first merge that skipped a collection stays a first merge until it completes", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const firstMerge = () => JSON.parse(localStorage.getItem(STATE) as string).firstMerge;
    localStorage.setItem(NOTES, "{corrupt");
    localStorage.setItem("rafiq_bookmarks_v1", JSON.stringify({ "1:1": "2026-10-01T00:00:00Z" }));

    await syncNow("u1");
    expect(cloudLive("bookmarks")).toEqual(["1:1"]);
    expect(firstMerge()).toBe(true);

    setNotes(note("a"));
    await syncNow("u1");
    expect(firstMerge()).toBe(false);
    expect(cloudLive("notes")).toEqual(["a"]);
    warn.mockRestore();
  });

  it("a user switch merges into the new account without deleting anything", async () => {
    setNotes(note("a"), note("b"));
    await syncNow("u1");
    setNotes(note("a"));
    const u1Cloud = cloud;
    cloud = new Map();
    seed("notes", "x", note("x"), "2026-10-01T00:00:00.000Z");

    expect((await syncNow("u2")).status).toBe("synced");

    expect(localNoteIds()).toEqual(["a", "x"]);
    expect(cloudLive("notes")).toEqual(["a", "x"]);
    expect(cloudRows("notes").some((r) => r.deleted)).toBe(false);
    expect(u1Cloud.get("notes/b")?.deleted).toBe(false);
  });

  it("resetSyncState makes the next run a first merge: local removals are not pushed", async () => {
    setNotes(note("a"), note("b"));
    await syncNow("u1");
    setNotes(note("a"));
    resetSyncState();

    await syncNow("u1");

    expect(cloud.get("notes/b")?.deleted).toBe(false);
    expect(localNoteIds()).toEqual(["a", "b"]);
  });
});

describe("lastSyncedAt", () => {
  it("is set by a run, kept for the same user, and cleared by a user switch and by resetSyncState", async () => {
    expect(getLastSyncedAt("u1")).toBeNull();
    await syncNow("u1");
    const first = getLastSyncedAt("u1");
    expect(Number.isNaN(Date.parse(first as string))).toBe(false);
    expect(getLastSyncedAt("u2")).toBeNull();

    resetSyncState();
    expect(getLastSyncedAt("u1")).toBeNull();

    await syncNow("u1");
    expect(getLastSyncedAt("u1")).not.toBeNull();
    (pullSince as jest.Mock).mockRejectedValueOnce(new SyncOfflineError());
    await syncNow("u1");
    expect(getLastSyncedAt("u1")).not.toBeNull();
    await syncNow("u2");
    expect(getLastSyncedAt("u1")).toBeNull();
  });
});

describe("custom merges only when both sides changed", () => {
  it("a Hifz reset on one device reaches an unchanged device", async () => {
    await savePlanStrict(plan(true));
    await syncNow("u1");
    await useDevice("B");
    await syncNow("u1");
    expect((await loadPlanStrict())?.sessions[0].done).toBe(true);

    await useDevice("A");
    await savePlanStrict(plan(false));
    await syncNow("u1");
    await useDevice("B");
    await syncNow("u1");

    expect((await loadPlanStrict())?.sessions[0].done).toBe(false);
    expect(localStorage.getItem("rafiq_hifz_plan_archive_v1")).toBeNull();
  });

  it("a freeze earned on one device reaches an idle device", async () => {
    localStorage.setItem(FREEZES, JSON.stringify({ count: 0, earnedOn: {}, spentOn: [] }));
    await syncNow("u1");
    await useDevice("B");
    await syncNow("u1");

    await useDevice("A");
    localStorage.setItem(FREEZES, JSON.stringify({ count: 1, earnedOn: { "2026-10-05": 1 }, spentOn: [] }));
    await syncNow("u1");
    await useDevice("B");
    await syncNow("u1");
    await useDevice("A");
    await syncNow("u1");

    for (const d of ["A", "B"]) {
      await useDevice(d);
      expect(JSON.parse(localStorage.getItem(FREEZES) as string).count).toBe(1);
    }
  });
});

describe("concurrency", () => {
  it("two concurrent calls share one network run", async () => {
    setNotes(note("a"));

    const [first, second] = await Promise.all([syncNow("u1"), syncNow("u1")]);

    expect(pullSince).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });
});
