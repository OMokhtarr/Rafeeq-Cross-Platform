import { Preferences } from "@capacitor/preferences";
import { idb } from "../../storage/idb.service";
import { loadPlanAsync, loadPlanStrict, savePlanStrict, type HifzPlan } from "../../../../features/hifz/hifz.service";
import { dirtyTime, installWriteHook, suppressHook } from "../local-changes";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { VerseVisibilityProvider } from "../../../context/VerseVisibilityContext";
import { listPresets, savePreset } from "../../../../features/quiz/services/quiz-presets.service";
import { brokenStores } from "../broken-stores";
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

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// Taken before any test installs the write hook: a write the hook never sees.
const rawSetItem = Storage.prototype.setItem;
const NOTES = "rafiq_notes_v1";
const HIDDEN = "rafiq_hidden_verses_v1";
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
    // sync_push's compare-and-swap: a row stored after the copy the push was based on stays.
    const moved = !!row.base_server_at && !!prev && (prev.server_at as string) > row.base_server_at;
    if (!moved && (!prev || Date.parse(row.edited_at) > Date.parse(prev.edited_at))) {
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

describe("the last page", () => {
  it("goes up with the next run, on its own stamp", async () => {
    await syncNow("u1");

    localStorage.setItem("rafiq_last_page_v1", "42");
    await syncNow("u1");

    expect(cloud.get("lastPage/value")?.value).toBe("42");
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

  it("skips notes when their store cannot be read, syncs the rest, and reports the error", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setNotes(note("a"));
    await syncNow("u1");
    seed("notes", "c", note("c"), "2026-10-03T00:00:00.000Z");
    tick += 10; // a later row moves the cursor well past the pull's re-read overlap
    seed("hiddenVerses", "2:255", true, "2026-10-03T00:00:00.000Z");
    localStorage.setItem(NOTES, "{corrupt");
    localStorage.setItem("rafiq_bookmarks_v1", JSON.stringify({ "1:1": "2026-10-01T00:00:00Z" }));

    const result = await syncNow("u1");
    expect(result.status).toBe("error");
    expect((result as { message: string }).message).toContain("notes");
    expect(cloud.get("notes/a")?.deleted).toBe(false);
    expect(cloudLive("bookmarks")).toEqual(["1:1"]);
    expect(localStorage.getItem(NOTES)).toBe("{corrupt");
    expect(JSON.parse(localStorage.getItem("rafiq_hidden_verses_v1") as string)).toEqual(["2:255"]);

    // Its rows are pulled again once the store can be read, though the cursor moved on.
    setNotes(note("a"));
    expect((await syncNow("u1")).status).toBe("synced");
    expect(localNoteIds()).toEqual(["a", "c"]);
    warn.mockRestore();
  });

  it("a write failure skips only that collection, reports the error and applies it next run", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setNotes(note("a"));
    await syncNow("u1");
    seed("notes", "c", note("c"), "2026-10-03T00:00:00.000Z");
    tick += 10;
    seed("hiddenVerses", "2:255", true, "2026-10-03T00:00:00.000Z");
    const realSet = Storage.prototype.setItem;
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, v) {
      if (k === NOTES) throw new Error("quota");
      realSet.call(this, k, v);
    });

    const result = await syncNow("u1");
    spy.mockRestore();

    expect(result.status).toBe("error");
    expect(localNoteIds()).toEqual(["a"]);
    expect(JSON.parse(localStorage.getItem("rafiq_hidden_verses_v1") as string)).toEqual(["2:255"]);

    expect((await syncNow("u1")).status).toBe("synced");
    expect(localNoteIds()).toEqual(["a", "c"]);
    warn.mockRestore();
  });

  it("a store changed during the run is left alone without an error, and applied next run", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setNotes(note("a"));
    await syncNow("u1");
    seed("notes", "c", note("c"), "2026-10-03T00:00:00.000Z");
    (pullSince as jest.Mock).mockImplementationOnce(async (cursor: string | null) => {
      setNotes(note("a"), note("typed-during-sync"));
      return fakePull(cursor);
    });

    const result = await syncNow("u1");

    expect(result.status).toBe("synced");
    expect(localNoteIds()).toEqual(["a", "typed-during-sync"]);
    expect(cloudLive("notes")).toEqual(["a", "c"]);

    expect((await syncNow("u1")).status).toBe("synced");
    expect(localNoteIds()).toEqual(["a", "c", "typed-during-sync"]);
    expect(cloudLive("notes")).toEqual(["a", "c", "typed-during-sync"]);
    warn.mockRestore();
  });

  it("a state save that fails is an error and leaves the old state and dirty times", async () => {
    setNotes(note("a"));
    await syncNow("u1");
    const before = localStorage.getItem(STATE);
    setNotes(note("a"), note("b"));
    const realSet = Storage.prototype.setItem;
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, v) {
      if (k === STATE) throw new Error("quota");
      realSet.call(this, k, v);
    });

    const result = await syncNow("u1");
    spy.mockRestore();

    expect(result.status).toBe("error");
    expect(localStorage.getItem(STATE)).toBe(before);
    expect(dirtyTime("notes")).not.toBeNull();

    expect((await syncNow("u1")).status).toBe("synced");
    expect(cloudLive("notes")).toEqual(["a", "b"]);
    expect(dirtyTime("notes")).toBeNull();
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

describe("rows stored after this device's pull", () => {
  it("an edit another phone stored after the pull beats this phone's later delete", async () => {
    setNotes(note("n"), note("other"));
    await syncNow("u1");
    setNotes(note("other"));
    (push as jest.Mock).mockImplementationOnce(async (rows: SyncRow[]) => {
      // Stored after A pulled, with an edit time before A's delete.
      seed("notes", "n", note("n", "edited on B"), "2026-10-02T00:00:00.000Z");
      return fakePush(rows);
    });

    expect((await syncNow("u1")).status).toBe("synced");

    expect(cloud.get("notes/n")?.deleted).toBe(false);
    expect(cloud.get("notes/n")?.value).toMatchObject({ body: "edited on B" });
    expect(localNotes().find((n) => n.id === "n")?.body).toBe("edited on B");
  });

  it("a newer local value is pushed again against the row that beat it, and lands", async () => {
    const SETTINGS = "rafiq_settings_v1";
    localStorage.setItem(SETTINGS, JSON.stringify({ fontSize: 3 }));
    await syncNow("u1");
    localStorage.setItem(SETTINGS, JSON.stringify({ fontSize: 4 }));
    (push as jest.Mock).mockImplementationOnce(async (rows: SyncRow[]) => {
      seed("settings", "value", { fontSize: 9 }, "2026-01-01T00:00:00.000Z");
      return fakePush(rows);
    });

    expect((await syncNow("u1")).status).toBe("synced");

    expect(cloud.get("settings/value")?.value).toEqual({ fontSize: 4 });
    expect(JSON.parse(localStorage.getItem(SETTINGS) as string)).toEqual({ fontSize: 4 });
    expect((push as jest.Mock).mock.calls.at(-1)[0][0].base_server_at).toBeDefined();
  });

  it("a row this build can't read that beat the push is left alone, not written locally", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setNotes(note("n"));
    await syncNow("u1");
    setNotes(note("n", "mine"));
    (push as jest.Mock).mockImplementationOnce(async (rows: SyncRow[]) => {
      seed("notes", "n", { id: "n", future: true }, "2026-01-01T00:00:00.000Z");
      return fakePush(rows);
    });

    await syncNow("u1");

    expect(localNotes()[0].body).toBe("mine");
    expect(cloud.get("notes/n")?.value).toEqual({ id: "n", future: true });
    warn.mockRestore();
  });
});

describe("a delete against an edit", () => {
  const LONG_AGO = "2026-10-03T00:00:00.000Z";

  async function twoPhonesWithNotes() {
    setNotes(note("n"), note("other"));
    await syncNow("u1");
    await useDevice("B");
    await syncNow("u1");
  }

  it("the edit in the cloud beats a pending delete with a later collection time", async () => {
    await twoPhonesWithNotes();
    setNotes(note("n", "edited on B", LONG_AGO), note("other"));
    await syncNow("u1");

    // A, offline: deleted n, then edited another note, so its delete looks recent.
    await useDevice("A");
    setNotes(note("other", "edited on A"));
    await syncNow("u1");

    expect(localNotes().find((n) => n.id === "n")?.body).toBe("edited on B");
    expect(cloud.get("notes/n")?.deleted).toBe(false);
    expect(cloud.get("notes/n")?.value).toMatchObject({ body: "edited on B" });
  });

  it("a pending edit beats a delete already in the cloud, and the note returns to the deleter", async () => {
    await twoPhonesWithNotes();
    await useDevice("A");
    setNotes(note("other"));
    await syncNow("u1");
    expect(cloud.get("notes/n")?.deleted).toBe(true);

    await useDevice("B");
    setNotes(note("n", "edited on B", LONG_AGO), note("other"));
    await syncNow("u1");
    expect(cloud.get("notes/n")?.deleted).toBe(false);
    expect(localNotes().find((n) => n.id === "n")?.body).toBe("edited on B");

    await useDevice("A");
    await syncNow("u1");
    expect(localNotes().find((n) => n.id === "n")?.body).toBe("edited on B");
  });

  it("a delete the other phone did not edit still removes the note there", async () => {
    await twoPhonesWithNotes();
    await useDevice("A");
    setNotes(note("other", "edited on A"));
    await syncNow("u1");

    await useDevice("B");
    setNotes(note("n"), note("other"), note("new on B"));
    await syncNow("u1");

    expect(localNoteIds()).toEqual(["new on B", "other"]);
    expect(cloud.get("notes/n")?.deleted).toBe(true);
  });
});

describe("the snapshot", () => {
  it("holds no item content, and still tells changed from unchanged", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    rejectKeys.add("notes/big");
    setNotes(note("a", "private words"), note("big", "refused words"));
    await syncNow("u1");
    const state = localStorage.getItem(STATE) as string;
    expect(state).not.toContain("private words");
    expect(state).not.toContain("refused words");

    (push as jest.Mock).mockClear();
    await syncNow("u1");
    expect(push).not.toHaveBeenCalled();

    setNotes(note("a", "private words, edited"), note("big", "refused words"));
    await syncNow("u1");
    expect(pushedKeys(0)).toEqual(["a"]);
    warn.mockRestore();
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
  it("a collection skipped by its first merge is still in first merge once it can be read", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    seed("notes", "a", null, "2026-10-01T00:00:00.000Z", true);
    localStorage.setItem(NOTES, "{corrupt");
    localStorage.setItem("rafiq_bookmarks_v1", JSON.stringify({ "1:1": "2026-10-01T00:00:00Z" }));

    expect((await syncNow("u1")).status).toBe("error");
    expect(cloudLive("bookmarks")).toEqual(["1:1"]);

    // A first merge never deletes: the live note beats the cloud's delete.
    setNotes(note("a"));
    expect((await syncNow("u1")).status).toBe("synced");
    expect(localNoteIds()).toEqual(["a"]);
    expect(cloudLive("notes")).toEqual(["a"]);
    warn.mockRestore();
  });

  it("an unreadable store does not stop other collections leaving first merge", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    const BOOKMARKS = "rafiq_bookmarks_v1";
    const marks = (...keys: string[]) =>
      localStorage.setItem(BOOKMARKS, JSON.stringify(Object.fromEntries(keys.map((k) => [k, "2026-10-01T00:00:00Z"]))));
    const localMarks = () => Object.keys(JSON.parse(localStorage.getItem(BOOKMARKS) as string)).sort();
    marks("1:1", "2:2");
    setNotes(note("a"));
    await syncNow("u1");

    await useDevice("B");
    localStorage.setItem(NOTES, "{corrupt");
    marks("1:1", "2:2");
    expect((await syncNow("u1")).status).toBe("error");

    // A healthy phone deletes a bookmark; B must not bring it back.
    await useDevice("A");
    marks("2:2");
    await syncNow("u1");
    expect(cloud.get("bookmarks/1:1")?.deleted).toBe(true);
    tick += 10;

    await useDevice("B");
    expect((await syncNow("u1")).status).toBe("error");
    expect(localMarks()).toEqual(["2:2"]);
    expect(cloud.get("bookmarks/1:1")?.deleted).toBe(true);

    // B's own delete goes up too, rather than coming straight back.
    marks();
    expect((await syncNow("u1")).status).toBe("error");
    expect(cloud.get("bookmarks/2:2")?.deleted).toBe(true);
    expect(localMarks()).toEqual([]);

    // The pull stays incremental while the store is broken.
    (pullSince as jest.Mock).mockClear();
    await syncNow("u1");
    expect((pullSince as jest.Mock).mock.calls[0][0]).not.toBeNull();

    // Repaired: the next run pulls everything again and merges the notes.
    setNotes(note("b"));
    (pullSince as jest.Mock).mockClear();
    expect((await syncNow("u1")).status).toBe("synced");
    expect((pullSince as jest.Mock).mock.calls[0][0]).toBeNull();
    expect(localNoteIds()).toEqual(["a", "b"]);
    expect(cloudLive("notes")).toEqual(["a", "b"]);
    expect(cloud.get("notes/a")?.deleted).toBe(false);
    warn.mockRestore();
  });

  it("notes that recover from corruption merge: no tombstones, and the cloud's notes come back", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setNotes(note("a"), note("b"), note("c"));
    await syncNow("u1");
    expect(cloudLive("notes")).toEqual(["a", "b", "c"]);

    localStorage.setItem(NOTES, "{corrupt");
    expect((await syncNow("u1")).status).toBe("error");
    expect(cloudLive("notes")).toEqual(["a", "b", "c"]);

    // The app reads bad JSON as [], so the next added note overwrites the store.
    setNotes(note("d"));
    expect((await syncNow("u1")).status).toBe("synced");
    expect(cloudRows("notes").filter((r) => r.deleted)).toEqual([]);
    expect(cloudLive("notes")).toEqual(["a", "b", "c", "d"]);
    expect(localNoteIds()).toEqual(["a", "b", "c", "d"]);
    warn.mockRestore();
  });

  it("a Hifz plan that recovers from corruption archives a different plan instead of replacing it", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await savePlanStrict(plan(true));
    await syncNow("u1");
    expect(cloudLive("hifzPlan")).toEqual(["current"]);

    devices.A.idb.set("plan", { id: "plan", data: "{corrupt" });
    expect((await syncNow("u1")).status).toBe("error");

    await savePlanStrict({ ...plan(false), createdAt: "2026-10-05T08:00:00.000Z" } as HifzPlan);
    expect((await syncNow("u1")).status).toBe("synced");
    expect(cloudLive("hifzPlan")).toEqual(["archive:2026-10-01T08:00:00.000Z", "current"]);
    expect((cloud.get("hifzPlan/current")?.value as HifzPlan).createdAt).toBe("2026-10-05T08:00:00.000Z");
    warn.mockRestore();
  });

  it("a like-for-like repair ends with no tombstones, and a later delete propagates", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    setNotes(note("a"), note("b"));
    await syncNow("u1");

    const saved = localStorage.getItem(NOTES) as string;
    localStorage.setItem(NOTES, "{corrupt");
    expect((await syncNow("u1")).status).toBe("error");
    localStorage.setItem(NOTES, saved);
    expect((await syncNow("u1")).status).toBe("synced");
    expect(cloudRows("notes").filter((r) => r.deleted)).toEqual([]);

    // Back in normal merging: a plain delete goes up.
    setNotes(note("b"));
    await syncNow("u1");
    expect(cloud.get("notes/a")?.deleted).toBe(true);
    expect(cloudLive("notes")).toEqual(["b"]);
    warn.mockRestore();
  });

  describe("a broken store is remembered until it has merged", () => {
    const NOTES_COLLECTION = "notes";
    const noTombstones = () => expect(cloudRows(NOTES_COLLECTION).filter((r) => r.deleted)).toEqual([]);
    const quiet = () => jest.spyOn(console, "warn").mockImplementation(() => {});
    const seedAbc = async () => {
      setNotes(note("a"), note("b"), note("c"));
      await syncNow("u1");
    };
    const expectAllFour = () => {
      noTombstones();
      expect(cloudLive("notes")).toEqual(["a", "b", "c", "d"]);
      expect(localNoteIds()).toEqual(["a", "b", "c", "d"]);
    };
    const failStateSave = () => {
      const realSet = Storage.prototype.setItem;
      return jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, v) {
        if (k === STATE) throw new Error("quota");
        realSet.call(this, k, v);
      });
    };

    it("survives an offline bad run", async () => {
      const warn = quiet();
      await seedAbc();
      localStorage.setItem(NOTES, "{corrupt");
      (pullSince as jest.Mock).mockRejectedValueOnce(new SyncOfflineError());
      expect((await syncNow("u1")).status).toBe("offline");

      setNotes(note("d"));
      expect((await syncNow("u1")).status).toBe("synced");
      expectAllFour();
      warn.mockRestore();
    });

    it("survives a failed state save during the bad run", async () => {
      const warn = quiet();
      await seedAbc();
      localStorage.setItem(NOTES, "{corrupt");
      const spy = failStateSave();
      expect((await syncNow("u1")).status).toBe("error");
      spy.mockRestore();

      setNotes(note("d"));
      expect((await syncNow("u1")).status).toBe("synced");
      expectAllFour();
      warn.mockRestore();
    });

    it("covers corruption no run ever saw, and pulls everything on recovery", async () => {
      await seedAbc();
      localStorage.setItem(NOTES, "{corrupt");
      setNotes(note("d"));
      (pullSince as jest.Mock).mockClear();
      expect((await syncNow("u1")).status).toBe("synced");
      expect((pullSince as jest.Mock).mock.calls[0][0]).toBeNull();
      expectAllFour();
    });

    it.each([
      ["corrupt JSON", "{corrupt"],
      ["a non-array", '{"1:1":true}'],
    ])("covers hidden verses read as empty and overwritten on mount (%s)", async (_name, bad) => {
      localStorage.setItem(HIDDEN, JSON.stringify(["1:1", "2:2", "3:3"]));
      await syncNow("u1");
      localStorage.setItem(HIDDEN, bad);

      const root = createRoot(document.createElement("div"));
      await act(async () => root.render(React.createElement(VerseVisibilityProvider, null, null)));
      expect(localStorage.getItem(HIDDEN)).toBe("[]");
      await act(async () => root.unmount());

      expect((await syncNow("u1")).status).toBe("synced");
      expect(cloudRows("hiddenVerses").filter((r) => r.deleted)).toEqual([]);
      expect(cloudLive("hiddenVerses")).toEqual(["1:1", "2:2", "3:3"]);
      expect(JSON.parse(localStorage.getItem(HIDDEN) as string).sort()).toEqual(["1:1", "2:2", "3:3"]);
    });

    it("covers a Hifz plan the non-strict loader could not read", async () => {
      await savePlanStrict(plan(true));
      await syncNow("u1");
      devices.A.idb.set("plan", { id: "plan", data: "{corrupt" });
      expect(await loadPlanAsync()).toBeNull();

      await savePlanStrict({ ...plan(false), createdAt: "2026-10-05T08:00:00.000Z" } as HifzPlan);
      expect((await syncNow("u1")).status).toBe("synced");
      expect(cloudLive("hifzPlan")).toEqual(["archive:2026-10-01T08:00:00.000Z", "current"]);
    });

    it("covers quiz presets that could not be parsed", async () => {
      await savePreset([], "one");
      await savePreset([], "two");
      await syncNow("u1");
      expect(cloudLive("quizPresets")).toHaveLength(2);
      devices.A.prefs.set("quizRangePresets", "{corrupt");
      expect(await listPresets()).toEqual([]);

      await savePreset([], "three");
      expect((await syncNow("u1")).status).toBe("synced");
      expect(cloudRows("quizPresets").filter((r) => r.deleted)).toEqual([]);
      expect(cloudLive("quizPresets")).toHaveLength(3);
      expect(JSON.parse(devices.A.prefs.get("quizRangePresets") as string)).toHaveLength(3);
    });

    it("covers a store that cannot be read while applying remote changes", async () => {
      const warn = quiet();
      await seedAbc();
      seed("notes", "e", note("e"), "2026-10-03T00:00:00.000Z");
      // Corrupted after the run read it, before it applies the cloud's note.
      (pullSince as jest.Mock).mockImplementationOnce(async (cursor: string | null) => {
        rawSetItem.call(localStorage, NOTES, "{corrupt");
        return fakePull(cursor);
      });
      expect((await syncNow("u1")).status).toBe("error");

      rawSetItem.call(localStorage, NOTES, JSON.stringify([note("d")]));
      expect((await syncNow("u1")).status).toBe("synced");
      noTombstones();
      expect(cloudLive("notes")).toEqual(["a", "b", "c", "d", "e"]);
      warn.mockRestore();
    });

    it("archives the old plan when saving the archive fails first, and keeps the plan meanwhile", async () => {
      const warn = quiet();
      await savePlanStrict(plan(true));
      await syncNow("u1");
      // Both sides changed: a different plan in the cloud, a session edit here.
      await savePlanStrict(plan(false));
      seed("hifzPlan", "current", { ...plan(false), createdAt: "2026-10-05T08:00:00.000Z" }, "2099-01-01T00:00:00.000Z");
      const realSet = Storage.prototype.setItem;
      const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, v) {
        if (k === "rafiq_hifz_plan_archive_v1") throw new Error("quota");
        realSet.call(this, k, v);
      });
      expect((await syncNow("u1")).status).toBe("error");
      spy.mockRestore();
      expect((await loadPlanStrict())?.createdAt).toBe("2026-10-01T08:00:00.000Z");

      expect((await syncNow("u1")).status).toBe("synced");
      expect((await loadPlanStrict())?.createdAt).toBe("2026-10-05T08:00:00.000Z");
      expect(cloudLive("hifzPlan")).toEqual(["archive:2026-10-01T08:00:00.000Z", "current"]);
      expect(Object.keys(JSON.parse(localStorage.getItem("rafiq_hifz_plan_archive_v1") as string))).toEqual([
        "2026-10-01T08:00:00.000Z",
      ]);
      warn.mockRestore();
    });

    it("keeps the mark while the store is unreadable, and when the state save fails", async () => {
      const warn = quiet();
      await seedAbc();
      localStorage.setItem(NOTES, "{corrupt");
      await syncNow("u1");
      await syncNow("u1");
      expect(brokenStores()).toEqual(["notes"]);

      setNotes(note("d"));
      const spy = failStateSave();
      expect((await syncNow("u1")).status).toBe("error");
      spy.mockRestore();
      expect(brokenStores()).toEqual(["notes"]);
      warn.mockRestore();
    });

    it("clears the mark after a completed merge, and a later delete then propagates", async () => {
      const warn = quiet();
      await seedAbc();
      localStorage.setItem(NOTES, "{corrupt");
      setNotes(note("d"));
      expect(brokenStores()).toEqual(["notes"]);
      await syncNow("u1");
      expect(brokenStores()).toEqual([]);
      expectAllFour();

      setNotes(note("b"), note("c"), note("d"));
      await syncNow("u1");
      expect(cloud.get("notes/a")?.deleted).toBe(true);
      warn.mockRestore();
    });

    it("sets no mark when an intact store is overwritten, and deletes propagate", async () => {
      await seedAbc();
      setNotes(note("a"), note("b"));
      expect(brokenStores()).toEqual([]);
      await syncNow("u1");
      expect(cloud.get("notes/c")?.deleted).toBe(true);
      expect(cloudLive("notes")).toEqual(["a", "b"]);
    });
  });

  it("a reset during a run still makes the next run a first merge", async () => {
    setNotes(note("a"), note("b"));
    await syncNow("u1");
    (pullSince as jest.Mock).mockImplementationOnce(async (cursor: string | null) => {
      resetSyncState();
      return fakePull(cursor);
    });
    await syncNow("u1");

    setNotes(note("a"));
    await syncNow("u1");

    expect(cloud.get("notes/b")?.deleted).toBe(false);
    expect(localNoteIds()).toEqual(["a", "b"]);
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

describe("entries sync can't read", () => {
  it("a note that lost its id is kept, its old key is not deleted, and cloud deletes still apply", async () => {
    setNotes(note("a"), note("b"), note("c"));
    await syncNow("u1");
    const broken = { ...note("b"), id: 5 };
    rawSetItem.call(localStorage, NOTES, JSON.stringify([note("a"), broken, note("c")]));
    seed("notes", "c", null, "2099-01-01T00:00:00.000Z", true);

    expect((await syncNow("u1")).status).toBe("synced");

    expect(cloud.get("notes/b")?.deleted).toBe(false);
    expect(localNotes()).toContainEqual(broken);
    expect(localNoteIds()).not.toContain("c");
    expect((await syncNow("u1")).status).toBe("synced");
    expect(cloud.get("notes/b")?.deleted).toBe(false);
  });

  it("a hidden verse that is no longer a string is kept and not deleted", async () => {
    localStorage.setItem(HIDDEN, JSON.stringify(["1:1", "2:2"]));
    await syncNow("u1");
    rawSetItem.call(localStorage, HIDDEN, JSON.stringify(["1:1", 22]));
    seed("hiddenVerses", "3:3", true, "2099-01-01T00:00:00.000Z");

    await syncNow("u1");

    expect(cloud.get("hiddenVerses/2:2")?.deleted).toBe(false);
    expect(JSON.parse(localStorage.getItem(HIDDEN) as string)).toEqual(["1:1", 22, "3:3"]);
  });

  it("a Hifz plan stored as JSON null is not a delete: the cloud's plan comes back", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    await savePlanStrict(plan(true));
    await syncNow("u1");
    devices.A.idb.set("plan", { id: "plan", data: "null" });
    rawSetItem.call(localStorage, "rafiq_hifz_v2", "null");

    expect((await syncNow("u1")).status).toBe("synced");

    expect(cloud.get("hifzPlan/current")?.deleted).toBe(false);
    expect((await loadPlanStrict())?.createdAt).toBe(plan(true).createdAt);
    warn.mockRestore();
  });
});

describe("reminder flags", () => {
  const SETTINGS = "rafiq_settings_v1";
  const settingsOf = () => JSON.parse(localStorage.getItem(SETTINGS) as string);

  it("stay on each phone: a reminder change elsewhere neither syncs nor overwrites", async () => {
    localStorage.setItem(SETTINGS, JSON.stringify({ fontSize: 3, prayerReminders: true }));
    await syncNow("u1");
    expect(cloud.get("settings/value")?.value).toEqual({ fontSize: 3 });

    await useDevice("B");
    localStorage.setItem(SETTINGS, JSON.stringify({ fontSize: 3, prayerReminders: false, azkarReminders: true }));
    await syncNow("u1");
    localStorage.setItem(SETTINGS, JSON.stringify({ fontSize: 4, prayerReminders: false, azkarReminders: false }));
    await syncNow("u1");
    expect(cloud.get("settings/value")?.value).toEqual({ fontSize: 4 });

    await useDevice("A");
    await syncNow("u1");
    expect(settingsOf()).toEqual({ fontSize: 4, prayerReminders: true });
  });
});

describe("recovering from damage", () => {
  const ARCHIVE = "rafiq_hifz_plan_archive_v1";
  const SETTINGS = "rafiq_settings_v1";
  const quiet = () => jest.spyOn(console, "warn").mockImplementation(() => {});
  const seedAbc = async () => {
    setNotes(note("a"), note("b"), note("c"));
    await syncNow("u1");
  };
  const noTombstones = () => expect(cloudRows("notes").filter((r) => r.deleted)).toEqual([]);

  it("a corrupt archive map is dropped and its archives come back from the cloud", async () => {
    const warn = quiet();
    const old = { ...plan(true), createdAt: "2026-09-01T08:00:00.000Z" };
    seed("hifzPlan", `archive:${old.createdAt}`, old, "2026-10-01T00:00:00.000Z");
    await savePlanStrict(plan(false));
    await syncNow("u1");
    expect(Object.keys(JSON.parse(localStorage.getItem(ARCHIVE) as string))).toEqual([old.createdAt]);

    rawSetItem.call(localStorage, ARCHIVE, "{corrupt");
    expect((await syncNow("u1")).status).toBe("synced");
    expect(Object.keys(JSON.parse(localStorage.getItem(ARCHIVE) as string))).toEqual([old.createdAt]);
    expect(cloudRows("hifzPlan").filter((r) => r.deleted)).toEqual([]);
    expect((await syncNow("u1")).status).toBe("synced");
    warn.mockRestore();
  });

  it("settings reset to defaults after damage take the cloud's copy, not replace it", async () => {
    localStorage.setItem(SETTINGS, JSON.stringify({ fontSize: 5, soundEffects: false }));
    await syncNow("u1");

    rawSetItem.call(localStorage, SETTINGS, "{corrupt");
    // The page reads bad JSON as its defaults and saves them.
    localStorage.setItem(SETTINGS, JSON.stringify({ fontSize: 3, soundEffects: true }));
    await syncNow("u1");

    expect(cloud.get("settings/value")?.value).toEqual({ fontSize: 5, soundEffects: false });
    expect(JSON.parse(localStorage.getItem(SETTINGS) as string)).toEqual({ fontSize: 5, soundEffects: false });
  });

  it("a freeze pool reset after damage takes the cloud's freezes, not zero", async () => {
    const pool = { count: 2, earnedOn: { "2026-10-05": 1 }, spentOn: [] };
    localStorage.setItem(FREEZES, JSON.stringify(pool));
    await syncNow("u1");

    rawSetItem.call(localStorage, FREEZES, "{corrupt");
    localStorage.setItem(FREEZES, JSON.stringify({ count: 0, earnedOn: {}, spentOn: [] }));
    await syncNow("u1");

    expect(cloud.get("hifzFreezePool/value")?.value).toEqual(pool);
    expect(JSON.parse(localStorage.getItem(FREEZES) as string)).toEqual(pool);
  });

  it("damage seen again during the run that merges it keeps the store marked", async () => {
    const warn = quiet();
    await seedAbc();
    rawSetItem.call(localStorage, NOTES, "{corrupt");
    setNotes(note("d"));

    (push as jest.Mock).mockImplementationOnce(async (rows: SyncRow[]) => {
      rawSetItem.call(localStorage, NOTES, "{corrupt");
      setNotes(note("e"));
      return fakePush(rows);
    });
    await syncNow("u1");
    expect(brokenStores()).toEqual(["notes"]);

    await syncNow("u1");
    noTombstones();
    expect(cloudLive("notes")).toEqual(["a", "b", "c", "d", "e"]);
    warn.mockRestore();
  });

  it("a mark storage is too full to save still holds for this session", async () => {
    const warn = quiet();
    await seedAbc();
    rawSetItem.call(localStorage, NOTES, "{corrupt");
    const realSet = Storage.prototype.setItem;
    const spy = jest.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, v) {
      if (k === "rafiq_sync_broken_v1") throw new Error("quota");
      realSet.call(this, k, v);
    });
    setNotes(note("d"));
    spy.mockRestore();
    expect(localStorage.getItem("rafiq_sync_broken_v1")).toBeNull();
    expect(brokenStores()).toEqual(["notes"]);

    await syncNow("u1");
    noTombstones();
    expect(cloudLive("notes")).toEqual(["a", "b", "c", "d"]);
    expect(brokenStores()).toEqual([]);
    warn.mockRestore();
  });
});

describe("schema changes", () => {
  /** A saved state whose cursor has moved past every cloud row, as after an old build skipped them. */
  const pastEveryRow = (schema?: number) => {
    const saved = JSON.parse(localStorage.getItem(STATE) as string);
    saved.cursor = "2099-01-01T00:00:00.000Z";
    if (schema === undefined) delete saved.schema;
    else saved.schema = schema;
    rawSetItem.call(localStorage, STATE, JSON.stringify(saved));
  };

  it("keeps pulling incrementally while the schema is unchanged", async () => {
    await syncNow("u1");
    const { schema } = JSON.parse(localStorage.getItem(STATE) as string);
    seed("notes", "a", note("a"), "2026-10-01T00:00:00.000Z");
    pastEveryRow(schema);

    await syncNow("u1");
    expect(localNoteIds()).toEqual([]);
  });

  it("pulls everything once when the saved state is from an older schema", async () => {
    await syncNow("u1");
    seed("notes", "a", note("a"), "2026-10-01T00:00:00.000Z");
    pastEveryRow(undefined);

    (pullSince as jest.Mock).mockClear();
    await syncNow("u1");
    expect((pullSince as jest.Mock).mock.calls[0][0]).toBeNull();
    expect(localNoteIds()).toEqual(["a"]);

    (pullSince as jest.Mock).mockClear();
    await syncNow("u1");
    expect((pullSince as jest.Mock).mock.calls[0][0]).not.toBeNull();
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
