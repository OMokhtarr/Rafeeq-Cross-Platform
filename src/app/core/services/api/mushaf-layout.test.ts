/**
 * Mushaf layout selection and page-boundary lookup.
 *
 * Why this exists: the page renderer draws glyphs with a per-page font, but
 * the line breaks come from the API's `line_number`. Those two only agree when
 * the request names the same mushaf layout the font belongs to. Measured
 * against the live API, omitting `mushaf` moved at least one word to a
 * different line on 9 of 16 sampled pages (page 350: 89 of 148 words), so the
 * id must actually reach the query string.
 */
import { MUSHAFS, DEFAULT_MUSHAF, mushafIdFor } from "./mushaf.config";

describe("mushaf id selection", () => {
  it("maps the V4 tajweed renderer to the matching layout id", () => {
    // 19 is the QCF Tajweed V4 layout — the one the per-page V4 fonts render.
    expect(mushafIdFor("qpc_v4_tajweed")).toBe(19);
  });

  it("gives the default mushaf a layout id", () => {
    expect(mushafIdFor(DEFAULT_MUSHAF)).toBeDefined();
  });

  it("maps the other scripted mushafs to their published ids", () => {
    expect(mushafIdFor("uthmani")).toBe(4);
    expect(mushafIdFor("indopak")).toBe(3);
  });

  it("sends no id for imlaei rather than guessing one", () => {
    // No published id for this script; `undefined` makes apiFetch omit the
    // param entirely, letting the API pick its own default.
    expect(mushafIdFor("imlaei")).toBeUndefined();
  });

  it("only uses 604-page layouts, which the font loader assumes", () => {
    // Ids 6 and 7 are the 610- and 548-page IndoPak variants; adopting either
    // would break the 1..604 per-page font mapping and TOTAL_PAGES.
    const ids = Object.values(MUSHAFS)
      .map((m) => m.mushafId)
      .filter((id): id is number => id !== undefined);
    expect(ids).not.toContain(6);
    expect(ids).not.toContain(7);
  });

  it("keeps text_uthmani in every word_fields set", () => {
    // Quizzes and search read this field regardless of the selected mushaf.
    for (const spec of Object.values(MUSHAFS)) {
      expect(spec.wordFields).toContain("text_uthmani");
    }
  });

  it("requests the positioning fields the line layout depends on", () => {
    for (const spec of Object.values(MUSHAFS)) {
      expect(spec.wordFields).toContain("line_number");
      expect(spec.wordFields).toContain("page_number");
    }
  });
});
