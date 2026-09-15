import {
  mushafRowsFrom,
  createMushafRowAccumulator,
  evictMushafLayout,
  MushafPageData,
} from "../mushafs.adapter";
import { clearDerivedPageCache } from "../../../data/page-cache";

jest.mock("../../../data/page-cache", () => ({
  clearDerivedPageCache: jest.fn(),
}));

/**
 * Build one `mushaf_word` record in the live snapshot's shape. Only the
 * fields the adapter reads are set; the rest are present to keep the
 * fixture honest about what the API actually returns.
 */
function w(
  wordId: number,
  line: number,
  positionInLine: number,
  positionInPage: number,
  text: string,
  isEnd: boolean,
) {
  return {
    id: 1900000 + wordId,
    mushaf_id: 19,
    word_id: wordId,
    verse_id: 294,
    text,
    char_type_id: isEnd ? 3 : 1,
    char_type_name: isEnd ? "end" : "word",
    page_number: 50,
    line_number: line,
    position_in_verse: positionInLine,
    position_in_line: positionInLine,
    position_in_page: positionInPage,
    css_class: null,
    css_style: null,
    record_type: "mushaf_word",
  };
}

/**
 * Page 50, lines 3 and 4, copied verbatim from the live `mushafs:19`
 * snapshot (2026-09-11).
 *
 * This page is the ORDERING TRAP. The word at position_in_page 14
 * (U+FC4E, word_id 2242) sits on line 4 but carries position_in_line 14,
 * while the rest of line 4 is numbered 1..9. Sorting by
 * (line_number, position_in_line) therefore throws it to the END of line 4
 * instead of its true place at the start — a one-word shift that silently
 * mis-aligns every following word on the page.
 *
 * 227 of the 604 pages contain at least one word like this.
 */
const PAGE_50_WORDS = [
  w(16, 3, 1, 1, "ﱁ", false),
  w(17, 3, 2, 2, "ﱂ", true),
  w(1183, 3, 3, 3, "ﱃ", false),
  w(1184, 3, 4, 4, "ﱄ", false),
  w(1185, 3, 5, 5, "ﱅ", false),
  w(1186, 3, 6, 6, "ﱆ", false),
  w(1187, 3, 7, 7, "ﱇ", false),
  w(1188, 3, 8, 8, "ﱈ", false),
  w(1189, 3, 9, 9, "ﱉ", false),
  w(1190, 3, 10, 10, "ﱊ", true),
  w(2239, 3, 11, 11, "ﱋ", false),
  w(2240, 3, 12, 12, "ﱌ", false),
  w(2241, 3, 13, 13, "ﱍ", false),
  w(2242, 4, 14, 14, "ﱎ", false),
  w(2243, 4, 1, 15, "ﱏ", false),
  w(2244, 4, 2, 16, "ﱐ", false),
  w(2245, 4, 3, 17, "ﱑ", false),
  w(2246, 4, 4, 18, "ﱒ", false),
  w(2247, 4, 5, 19, "ﱓ", false),
  w(2248, 4, 6, 20, "ﱔ", false),
  w(2249, 4, 7, 21, "ﱕ", false),
  w(2250, 4, 8, 22, "ﱖ", true),
  w(3561, 4, 9, 23, "ﱗ", false),
];

const PAGE_50_RECORD = {
  id: 10480,
  mushaf_id: 19,
  page_number: 50,
  first_verse_id: 294,
  last_verse_id: 302,
  first_word_id: 16,
  last_word_id: 10005,
  verses_count: 9,
  verse_mapping: { "3": "1-9" },
  updated_at: "2026-08-11T23:31:56.405Z",
  record_type: "mushaf_page",
};

function dataFor(rows: ReturnType<typeof mushafRowsFrom>, page: number) {
  const row = rows.find((r) => r.recordKey === String(page));
  if (!row) throw new Error(`no row for page ${page}`);
  return row.data as MushafPageData;
}

describe("mushafRowsFrom", () => {
  it("emits one row per page, keyed by page number", () => {
    const page51Words = PAGE_50_WORDS.slice(0, 3).map((x) => ({
      ...x,
      page_number: 51,
    }));
    const rows = mushafRowsFrom(
      [
        PAGE_50_RECORD,
        { ...PAGE_50_RECORD, id: 10481, page_number: 51, verse_mapping: {} },
        ...PAGE_50_WORDS,
        ...page51Words,
      ],
      19,
      1399,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.recordKey).sort()).toEqual(["50", "51"]);

    const page50 = rows.find((r) => r.recordKey === "50")!;
    expect(page50.id).toBe("mushafs:19:mushaf_page:50");
    expect(page50.resourceGroup).toBe("mushafs");
    expect(page50.resourceId).toBe(19);
    expect(page50.recordType).toBe("mushaf_page");
    expect(page50.sequence).toBe(1399);
  });

  it("emits no row for a page that has a page record but no words", () => {
    // Only words carry the layout, so an empty page row would store nothing
    // useful and would make getPage() believe it had a cached page.
    const rows = mushafRowsFrom([PAGE_50_RECORD], 19, 1399);
    expect(rows).toEqual([]);
  });

  it("orders words by position_in_page, not position_in_line", () => {
    // The regression this exists for: sorting by (line, position_in_line)
    // puts U+FC4E last on line 4 instead of first, shifting every
    // subsequent glyph by one.
    const rows = mushafRowsFrom([PAGE_50_RECORD, ...PAGE_50_WORDS], 19, 1399);
    const glyphs = dataFor(rows, 50).words.map((x) => x.codeV2);

    expect(glyphs.slice(12, 17)).toEqual([
      "ﱍ",
      "ﱎ",
      "ﱏ",
      "ﱐ",
      "ﱑ",
    ]);
    expect(glyphs).toHaveLength(23);
  });

  it("is not fooled by records arriving out of order", () => {
    // Snapshot record order is not guaranteed; the adapter must sort rather
    // than trust arrival order.
    const shuffled = [...PAGE_50_WORDS].reverse();
    const rows = mushafRowsFrom([PAGE_50_RECORD, ...shuffled], 19, 1399);
    const glyphs = dataFor(rows, 50).words.map((x) => x.codeV2);

    expect(glyphs[0]).toBe("ﱁ");
    expect(glyphs[13]).toBe("ﱎ");
    expect(glyphs[22]).toBe("ﱗ");
  });

  it("maps a word onto the renderer's VerseWord shape", () => {
    const rows = mushafRowsFrom([PAGE_50_RECORD, ...PAGE_50_WORDS], 19, 1399);
    const first = dataFor(rows, 50).words[0];

    expect(first.codeV2).toBe("ﱁ");
    expect(first.lineNumber).toBe(3);
    expect(first.pageNumber).toBe(50);
    expect(first.position).toBe(1);
    // The snapshot carries no Uthmani text; it is merged in at read time.
    expect(first.text_uthmani).toBe("");
  });

  it("carries verse_mapping through on the page row", () => {
    const rows = mushafRowsFrom([PAGE_50_RECORD, ...PAGE_50_WORDS], 19, 1399);
    expect(dataFor(rows, 50).verseMapping).toEqual({ "3": "1-9" });
    expect(dataFor(rows, 50).pageNumber).toBe(50);
  });

  it("keeps a page that has words but no page record", () => {
    // A page record could be absent from a partial snapshot; the words are
    // still the layout and must not be silently dropped.
    const rows = mushafRowsFrom(PAGE_50_WORDS, 19, 1399);

    expect(rows).toHaveLength(1);
    expect(dataFor(rows, 50).words).toHaveLength(23);
    expect(dataFor(rows, 50).verseMapping).toEqual({});
  });

  it("ignores the mushaf metadata record", () => {
    const meta = {
      id: 19,
      name: "QCF V4 Tajweed",
      pages_count: 604,
      lines_per_page: 15,
      record_type: "mushaf",
    };
    const rows = mushafRowsFrom([meta, PAGE_50_RECORD, ...PAGE_50_WORDS], 19, 1399);

    expect(rows).toHaveLength(1);
    expect(rows[0].recordKey).toBe("50");
  });
});

describe("createMushafRowAccumulator", () => {
  it("builds the same rows from batches as from one array", async () => {
    const all = [PAGE_50_RECORD, ...PAGE_50_WORDS];
    const oneShot = mushafRowsFrom(all, 19, 1399);

    const acc = createMushafRowAccumulator(19, 1399);
    for (let i = 0; i < all.length; i += 4) acc.add(all.slice(i, i + 4));

    expect(acc.rows()).toEqual(oneShot);
  });

  it("orders correctly when a page's words arrive across batches", async () => {
    // The whole point: a page is split over several network batches, so the
    // sort cannot happen per batch — it has to happen once at the end.
    const acc = createMushafRowAccumulator(19, 1399);
    acc.add([PAGE_50_RECORD]);
    // Feed the words in reverse, split across batches.
    const reversed = [...PAGE_50_WORDS].reverse();
    for (let i = 0; i < reversed.length; i += 5) {
      acc.add(reversed.slice(i, i + 5));
    }

    const data = acc.rows()[0].data as MushafPageData;
    expect(data.words.map((w) => w.codeV2).slice(12, 15)).toEqual([
      "ﱍ",
      "ﱎ",
      "ﱏ",
    ]);
  });

  it("carries the resource id and sequence onto every row", () => {
    const acc = createMushafRowAccumulator(19, 4242);
    acc.add([PAGE_50_RECORD, ...PAGE_50_WORDS]);
    const row = acc.rows()[0];
    expect(row.id).toBe("mushafs:19:mushaf_page:50");
    expect(row.sequence).toBe(4242);
  });
});

describe("evictMushafLayout", () => {
  it("drops the derived page cache so the new layout is picked up", async () => {
    // getPage() reads the `pages` store before the layout row, so replacing
    // the snapshot without clearing it would serve the old layout forever.
    await evictMushafLayout(19);
    expect(clearDerivedPageCache).toHaveBeenCalled();
  });
});
