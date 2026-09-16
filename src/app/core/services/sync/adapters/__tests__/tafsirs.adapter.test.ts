import "fake-indexeddb/auto";

// Polyfill structuredClone for fake-indexeddb in Jest
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

import { tafsirRowsFrom, readCachedTafsir, hasCachedTafsir } from "../tafsirs.adapter";
import { putRows } from "../../sync-store.service";
import { idb } from "../../../storage/idb.service";

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

  it("expands a cross-surah range (104:1 -> 105:5) across both surahs", () => {
    // Real Ibn Kathir (169) data: a single commentary spans the end of
    // Al-Humazah (104, 9 verses) into the start of Al-Fil (105, 5 verses).
    // Every verse of 104 after the anchor, plus 105:1-105:5, must resolve.
    const rows = tafsirRowsFrom(
      [{ verse_key: "104:1", text: "on humazah and fil", group_verse_key_from: "104:1", group_verse_key_to: "105:5" }],
      169,
      1,
    );
    expect(rows).toHaveLength(14);
    expect(rows[0].recordKey).toBe("104:1");
    expect(rows[rows.length - 1].recordKey).toBe("105:5");
    expect(new Set(rows.map((r) => (r.data as { text: string }).text)).size).toBe(1);
  });

  it("degrades a reversed same-surah range to one row without hanging", () => {
    const rows = tafsirRowsFrom(
      [{ verse_key: "2:5", text: "x", group_verse_key_from: "2:5", group_verse_key_to: "2:1" }],
      169,
      1,
    );
    expect(rows.map((r) => r.recordKey)).toEqual(["2:5"]);
  });

  it("degrades a range where the end surah precedes the start surah to one row", () => {
    const rows = tafsirRowsFrom(
      [{ verse_key: "105:1", text: "x", group_verse_key_from: "105:1", group_verse_key_to: "104:1" }],
      169,
      1,
    );
    expect(rows.map((r) => r.recordKey)).toEqual(["105:1"]);
  });

  it("degrades a malformed key to one row without throwing", () => {
    const rows = tafsirRowsFrom(
      [{ verse_key: "2:1", text: "x", group_verse_key_from: "2:1", group_verse_key_to: "notakey" }],
      169,
      1,
    );
    expect(rows.map((r) => r.recordKey)).toEqual(["2:1"]);
  });

  it("keeps the populated record's text when the live QF shape sends one record per verse in a group, only the first carrying text (Ya-Sin 36:1-36:7)", () => {
    // Verified live shape (Ibn Kathir, 169): a group is NOT one record with
    // group bounds — QF emits one record PER VERSE in the group, every one
    // carrying the SAME group_verse_key_from/_to, and only the first has
    // text. Naive expansion makes every record overwrite the same row ids,
    // so the empty ones (arriving after the populated one) blank it out.
    // Measured: 4,328 of 6,236 tafsir records are empty-text records whose
    // range overlaps a populated verse.
    const records = [
      { verse_key: "36:1", text: "on ya-sin", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:2", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:3", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:4", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:5", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:6", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:7", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
    ];
    const rows = tafsirRowsFrom(records, 169, 1);
    const byKey = new Map(rows.map((r) => [r.recordKey, (r.data as { text: string }).text]));
    for (let ayah = 1; ayah <= 7; ayah++) {
      expect(byKey.get(`36:${ayah}`)).toBe("on ya-sin");
    }
  });

  it("keeps the populated record's text even when the empty records arrive BEFORE it (reverse order)", () => {
    const records = [
      { verse_key: "36:7", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:6", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:5", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:4", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:3", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:2", text: "", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
      { verse_key: "36:1", text: "on ya-sin", group_verse_key_from: "36:1", group_verse_key_to: "36:7" },
    ];
    const rows = tafsirRowsFrom(records, 169, 1);
    const byKey = new Map(rows.map((r) => [r.recordKey, (r.data as { text: string }).text]));
    for (let ayah = 1; ayah <= 7; ayah++) {
      expect(byKey.get(`36:${ayah}`)).toBe("on ya-sin");
    }
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
