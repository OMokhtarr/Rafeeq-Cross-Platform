import {
  installWriteHook,
  markDirty,
  onLocalChange,
  suppressHook,
  dirtyTime,
  clearDirty,
  diffAgainstSnapshot,
  stableStringify,
} from "../local-changes";
import { PRESETS_KEY } from "../../../../features/quiz/services/quiz-presets.service";

jest.mock("@capacitor/preferences", () => ({
  Preferences: { get: jest.fn(), set: jest.fn() },
}));
jest.mock("../../../../features/hifz/hifz.service", () => ({}));

beforeEach(() => {
  localStorage.clear();
  installWriteHook();
});

describe("write hook", () => {
  it("records synced keys but not unsynced ones", () => {
    localStorage.setItem("rafiq_notes_v1", "[]");
    localStorage.setItem("rafiq_pro_v1", "x");
    expect(dirtyTime("notes")).not.toBeNull();
    expect(Object.keys(JSON.parse(localStorage.getItem("rafiq_sync_dirty_v1")!))).toEqual(["notes"]);
  });

  it("counts removeItem as an edit", () => {
    localStorage.setItem("rafiq_bookmarks_v1", "{}");
    localStorage.removeItem("rafiq_sync_dirty_v1");
    localStorage.removeItem("rafiq_bookmarks_v1");
    expect(dirtyTime("bookmarks")).not.toBeNull();
  });

  it("does not record writes inside suppressHook, even nested or when fn throws", async () => {
    await suppressHook(async () => {
      await suppressHook(async () => {
        localStorage.setItem("rafiq_hidden_verses_v1", "{}");
      });
      localStorage.setItem("rafiq_hidden_verses_v1", "{\"a\":1}");
    });
    expect(dirtyTime("hiddenVerses")).toBeNull();
    await expect(
      suppressHook(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    localStorage.setItem("rafiq_hidden_verses_v1", "{}");
    expect(dirtyTime("hiddenVerses")).not.toBeNull();
  });

  it("installing twice does not double-wrap", () => {
    installWriteHook();
    installWriteHook();
    const cb = jest.fn();
    const off = onLocalChange(cb);
    localStorage.setItem("rafiq_notes_v1", "[]");
    expect(cb).toHaveBeenCalledTimes(1);
    off();
    localStorage.setItem("rafiq_notes_v1", "[1]");
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("markDirty", () => {
  it("records quizPresets for the Preferences key", () => {
    markDirty(PRESETS_KEY);
    expect(dirtyTime("quizPresets")).not.toBeNull();
  });

  it("ignores unknown keys", () => {
    markDirty("nope");
    expect(localStorage.getItem("rafiq_sync_dirty_v1")).toBeNull();
  });
});

describe("clearDirty", () => {
  it("keeps a newer dirty time and clears an equal or older one", () => {
    markDirty("rafiq_notes_v1");
    const t = dirtyTime("notes")!;
    clearDirty("notes", new Date(Date.parse(t) - 1000).toISOString());
    expect(dirtyTime("notes")).toBe(t);
    clearDirty("notes", t);
    expect(dirtyTime("notes")).toBeNull();
  });
});

describe("diffAgainstSnapshot", () => {
  it("finds changed and removed keys and ignores key order", () => {
    const snapshot = {
      same: stableStringify({ a: 1, b: 2 }),
      edited: stableStringify({ a: 1 }),
      gone: stableStringify("x"),
    };
    const current = { same: { b: 2, a: 1 }, edited: { a: 2 }, added: 1 };
    const d = diffAgainstSnapshot(current, snapshot);
    expect(d.changed.sort()).toEqual(["added", "edited"]);
    expect(d.removed).toEqual(["gone"]);
  });
});

describe("persistence", () => {
  it("survives a module reload", () => {
    markDirty("rafiq_notes_v1");
    const t = dirtyTime("notes");
    jest.isolateModules(() => {
      const fresh = require("../local-changes");
      expect(fresh.dirtyTime("notes")).toBe(t);
    });
  });
});
