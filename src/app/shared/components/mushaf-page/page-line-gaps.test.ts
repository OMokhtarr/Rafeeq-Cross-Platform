/**
 * Surah header / bismillah placement derived from page line data.
 *
 * The line sets below are the real `line_number` values returned by the QF
 * content API for the V4 Tajweed layout (mushaf=19), so these lock the
 * behaviour to the printed Mushaf rather than to our own assumptions.
 */
import { findLineGaps, gapBeforeLine, LINES_PER_PAGE } from "./page-line-gaps";

/** Lines carrying verse text on a page, as returned by the API. */
const PAGE_586 = [1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const PAGE_587 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 14, 15];
const PAGE_187 = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
const PAGE_602 = [3, 4, 5, 8, 9, 10, 11, 14, 15];
const PAGE_003 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

describe("findLineGaps", () => {
  it("finds no gaps on a page that is pure verse text", () => {
    expect(findLineGaps(PAGE_003)).toEqual([]);
  });

  it("reads a header+bismillah pair as one 2-line gap", () => {
    // Page 586: At-Takwir opens at line 4, its furniture on lines 2-3.
    expect(findLineGaps(PAGE_586)).toEqual([{ size: 2, beforeLine: 4 }]);
  });

  it("finds every gap on a page with two surah starts", () => {
    // Page 587: Al-Infitar at the top, Al-Mutaffifin from line 14.
    expect(findLineGaps(PAGE_587)).toEqual([
      { size: 2, beforeLine: 3 },
      { size: 2, beforeLine: 14 },
    ]);
  });

  it("reads At-Tawbah's header-only slot as a 1-line gap", () => {
    // Page 187 — At-Tawbah is the one surah with no bismillah, and the layout
    // says so by reserving a single line.
    expect(findLineGaps(PAGE_187)).toEqual([{ size: 1, beforeLine: 2 }]);
  });

  it("handles three surah starts on one page", () => {
    expect(findLineGaps(PAGE_602)).toEqual([
      { size: 2, beforeLine: 3 },
      { size: 2, beforeLine: 8 },
      { size: 2, beforeLine: 14 },
    ]);
  });

  it("ignores empty lines that trail off the bottom of the page", () => {
    // This is the duplicate-header bug: free lines at the end belong to no
    // surah on this page, so they must not be reported as a slot. Page 586
    // fills line 15, but a page that stops early must still yield nothing
    // extra at the bottom.
    const stopsAtLine12 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(findLineGaps(stopsAtLine12)).toEqual([]);
  });

  it("returns nothing for a page with no words", () => {
    expect(findLineGaps([])).toEqual([]);
  });

  it("assumes a 15-line grid", () => {
    expect(LINES_PER_PAGE).toBe(15);
  });
});

describe("gapBeforeLine", () => {
  it("matches a surah's opening line to its own furniture slot", () => {
    const gaps = findLineGaps(PAGE_587);
    expect(gapBeforeLine(gaps, 14)).toEqual({ size: 2, beforeLine: 14 });
  });

  it("returns null for a line that no gap precedes", () => {
    const gaps = findLineGaps(PAGE_587);
    expect(gapBeforeLine(gaps, 7)).toBeNull();
  });
});

describe("furniture decisions (as the renderer makes them)", () => {
  const bismillahFor = (lines: number[], openingLine: number, sura: number) => {
    const gap = gapBeforeLine(findLineGaps(lines), openingLine);
    return sura !== 9 && (gap?.size ?? 0) >= 2;
  };

  it("gives a normal surah its bismillah", () => {
    expect(bismillahFor(PAGE_587, 14, 83)).toBe(true);
  });

  it("withholds the bismillah from At-Tawbah", () => {
    expect(bismillahFor(PAGE_187, 2, 9)).toBe(false);
  });

  it("withholds the bismillah when only one line was reserved", () => {
    // Even for a surah that normally has one — the layout is the authority.
    expect(bismillahFor(PAGE_187, 2, 10)).toBe(false);
  });
});
