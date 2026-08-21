import "fake-indexeddb/auto";

// Polyfill structuredClone for fake-indexeddb in Jest
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

import { tafsirRowsFrom, readCachedTafsir, hasCachedTafsir } from "./tafsirs.adapter";
import { putRows } from "../sync-store.service";
import { idb } from "../../storage/idb.service";

beforeEach(async () => {
  await idb.clear("content_sync");
});

describe("tafsirRowsFrom", () => {
  it("creates one row per verse for a single-verse record", () => {
    const rows = tafsirRowsFrom(
      [{ verse_key: "1:1", text: "bismillah", group_verse_key_from: "1:1", group_verse_key_to: "1:1" }],
      169,
      7,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("tafsirs:169:tafsir:1:1");
    expect(rows[0].sequence).toBe(7);
  });

  it("expands a grouped record across every verse in its range", () => {
    // One commentary covering 2:1-2:5. Storing only under verse_key would
    // leave 2:2-2:5 blank despite the text being present.
    const rows = tafsirRowsFrom(
      [{ verse_key: "2:1", text: "on the opening", group_verse_key_from: "2:1", group_verse_key_to: "2:5" }],
      169,
      1,
    );
    expect(rows.map((r) => r.recordKey)).toEqual(["2:1", "2:2", "2:3", "2:4", "2:5"]);
    expect(new Set(rows.map((r) => (r.data as { text: string }).text)).size).toBe(1);
  });

  it("falls back to verse_key when the group bounds are missing", () => {
    const rows = tafsirRowsFrom([{ verse_key: "3:7", text: "x" }], 169, 1);
    expect(rows.map((r) => r.recordKey)).toEqual(["3:7"]);
  });

  it("skips records with no usable verse key", () => {
    const rows = tafsirRowsFrom([{ text: "orphan" }], 169, 1);
    expect(rows).toHaveLength(0);
  });
});

describe("readCachedTafsir", () => {
  it("returns the stored text for a verse", async () => {
    await putRows(tafsirRowsFrom([{ verse_key: "1:1", text: "hello" }], 169, 1));
    expect(await readCachedTafsir(169, "1:1")).toBe("hello");
  });

  it("returns null for a verse with no cached row", async () => {
    expect(await readCachedTafsir(169, "9:9")).toBeNull();
  });

  it("hasCachedTafsir reflects whether any rows are present", async () => {
    expect(await hasCachedTafsir(169)).toBe(false);
    await putRows(tafsirRowsFrom([{ verse_key: "1:1", text: "hi" }], 169, 1));
    expect(await hasCachedTafsir(169)).toBe(true);
  });
});
