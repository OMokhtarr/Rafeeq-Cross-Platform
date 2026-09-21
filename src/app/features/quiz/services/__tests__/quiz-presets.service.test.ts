import type { QuizRange } from "../../../../shared/models/verse.model";

// In-memory stand-in for @capacitor/preferences. Declared before the import
// of the service under test so the mock is in place when it loads.
const store: Record<string, string> = {};

jest.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: jest.fn(async ({ key }: { key: string }) => ({
      value: key in store ? store[key] : null,
    })),
    set: jest.fn(async ({ key, value }: { key: string; value: string }) => {
      store[key] = value;
    }),
  },
}));

import {
  PRESETS_KEY,
  listPresets,
  savePreset,
  updatePreset,
  renamePreset,
  deletePreset,
  restorePreset,
} from "../quiz-presets.service";

const juz30: QuizRange[] = [{ kind: "juz", juz: 30 }];
const baqarah: QuizRange[] = [{ kind: "surah", surah: 2 }];

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe("listPresets", () => {
  it("returns an empty list when nothing has been saved", async () => {
    expect(await listPresets()).toEqual([]);
  });

  // A corrupt entry must never white-screen a setup page: losing a saved set
  // is a far smaller failure than losing the screen.
  it("returns an empty list rather than throwing on malformed JSON", async () => {
    store[PRESETS_KEY] = "{not json";
    expect(await listPresets()).toEqual([]);
  });

  it("drops entries that are not shaped like a preset", async () => {
    store[PRESETS_KEY] = JSON.stringify([
      { id: "a", name: "ok", ranges: [], createdAt: 1, updatedAt: 1 },
      { nonsense: true },
      null,
    ]);
    const list = await listPresets();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("a");
  });

  it("orders the newest updated first", async () => {
    const a = await savePreset(juz30, "A");
    const b = await savePreset(baqarah, "B");
    await renamePreset(a.id, "A renamed");
    const list = await listPresets();
    expect(list.map((p) => p.id)).toEqual([a.id, b.id]);
  });
});

describe("savePreset", () => {
  it("stores the ranges under the given name", async () => {
    const saved = await savePreset(juz30, "My Hifz");
    expect(saved.name).toBe("My Hifz");
    expect(saved.ranges).toEqual(juz30);
    const list = await listPresets();
    expect(list).toHaveLength(1);
    expect(list[0].ranges).toEqual(juz30);
  });

  it("gives every preset a distinct id", async () => {
    const a = await savePreset(juz30, "A");
    const b = await savePreset(juz30, "B");
    expect(a.id).not.toBe(b.id);
  });

  it("copies the ranges so later edits to the caller's array do not leak", async () => {
    const mutable: QuizRange[] = [{ kind: "juz", juz: 1 }];
    const saved = await savePreset(mutable, "A");
    mutable.push({ kind: "juz", juz: 2 });
    const list = await listPresets();
    expect(list[0].ranges).toHaveLength(1);
    expect(saved.ranges).toHaveLength(1);
  });
});

describe("updatePreset", () => {
  it("replaces the ranges and bumps updatedAt", async () => {
    const saved = await savePreset(juz30, "A");
    await updatePreset(saved.id, baqarah);
    const list = await listPresets();
    expect(list[0].ranges).toEqual(baqarah);
    expect(list[0].updatedAt).toBeGreaterThanOrEqual(saved.updatedAt);
    expect(list[0].name).toBe("A");
  });

  it("is a no-op for an unknown id", async () => {
    await savePreset(juz30, "A");
    await updatePreset("nope", baqarah);
    const list = await listPresets();
    expect(list[0].ranges).toEqual(juz30);
  });
});

describe("renamePreset", () => {
  it("changes only the name", async () => {
    const saved = await savePreset(juz30, "A");
    await renamePreset(saved.id, "B");
    const list = await listPresets();
    expect(list[0].name).toBe("B");
    expect(list[0].ranges).toEqual(juz30);
  });

  it("ignores a blank name rather than storing an unreadable entry", async () => {
    const saved = await savePreset(juz30, "A");
    await renamePreset(saved.id, "   ");
    const list = await listPresets();
    expect(list[0].name).toBe("A");
  });
});

describe("deletePreset and restorePreset", () => {
  it("removes the preset", async () => {
    const saved = await savePreset(juz30, "A");
    await deletePreset(saved.id);
    expect(await listPresets()).toEqual([]);
  });

  it("restores it with its original id and createdAt intact", async () => {
    const saved = await savePreset(juz30, "A");
    await deletePreset(saved.id);
    await restorePreset(saved);
    const list = await listPresets();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(saved.id);
    expect(list[0].createdAt).toBe(saved.createdAt);
    expect(list[0].name).toBe("A");
  });

  it("does not duplicate when restoring something still present", async () => {
    const saved = await savePreset(juz30, "A");
    await restorePreset(saved);
    expect(await listPresets()).toHaveLength(1);
  });
});
