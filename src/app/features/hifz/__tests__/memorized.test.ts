import { addMemorized, editMemorizedRange, pagesUnitSurah, SurahBounds } from "../memorized";
import type { MemorizedUnit } from "../hifz.service";

jest.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => "web" } }));

// Al-Baqarah 2–49, Al-Imran 50–76 (shares no page here), An-Nisa 77–106.
const SURAHS: Record<number, { from: number; to: number }> = {
  1: { from: 1, to: 1 },
  2: { from: 2, to: 49 },
  3: { from: 50, to: 76 },
  4: { from: 77, to: 106 },
};
const bounds: SurahBounds = (s) => SURAHS[s] ?? { from: 999, to: 999 };

const pages = (surah: number, from: number, to: number): MemorizedUnit => ({ type: "pages", surah, from, to });

describe("addMemorized", () => {
  it("widens the existing range of the same surah instead of adding a row", () => {
    const list = [pages(2, 2, 10)];
    expect(addMemorized(list, [pages(2, 8, 15)], bounds)).toEqual([pages(2, 2, 15)]);
  });

  it("joins a range that starts on the page after the existing one", () => {
    expect(addMemorized([pages(2, 2, 10)], [pages(2, 11, 12)], bounds)).toEqual([pages(2, 2, 12)]);
  });

  it("adds nothing for pages already in the list", () => {
    expect(addMemorized([pages(2, 2, 10)], [pages(2, 4, 6)], bounds)).toEqual([pages(2, 2, 10)]);
  });

  it("keeps a separate row for a gap in the same surah", () => {
    const out = addMemorized([pages(2, 2, 10)], [pages(2, 20, 25)], bounds);
    expect(out).toEqual([pages(2, 2, 10), pages(2, 20, 25)]);
  });

  it("merges two rows that a new range bridges, at the first row's place", () => {
    const list = [pages(2, 2, 10), { type: "juz", juz: 30 } as MemorizedUnit, pages(2, 20, 25)];
    expect(addMemorized(list, [pages(2, 9, 21)], bounds)).toEqual([
      pages(2, 2, 25),
      { type: "juz", juz: 30 },
    ]);
  });

  it("turns a range covering the whole surah into a surah row", () => {
    expect(addMemorized([pages(2, 2, 30)], [pages(2, 31, 49)], bounds)).toEqual([
      { type: "surah", surah: 2 },
    ]);
  });

  it("skips pages inside a surah or juz row already in the list", () => {
    const list: MemorizedUnit[] = [{ type: "surah", surah: 2 }];
    expect(addMemorized(list, [pages(2, 5, 6)], bounds)).toEqual(list);
    const juz: MemorizedUnit[] = [{ type: "juz", juz: 1 }]; // pages 1–21
    expect(addMemorized(juz, [pages(2, 5, 6)], bounds)).toEqual(juz);
  });

  it("replaces a surah's ranges when the whole surah is added", () => {
    const list = [pages(2, 2, 10), pages(4, 80, 81)];
    expect(addMemorized(list, [{ type: "surah", surah: 2 }], bounds)).toEqual([
      { type: "surah", surah: 2 },
      pages(4, 80, 81),
    ]);
  });

  it("does not add the same juz or surah twice", () => {
    const list: MemorizedUnit[] = [{ type: "juz", juz: 3 }, { type: "surah", surah: 4 }];
    expect(addMemorized(list, [{ type: "juz", juz: 3 }, { type: "surah", surah: 4 }], bounds)).toEqual(list);
  });

  it("merges with a row saved before the surah was stored", () => {
    const legacy: MemorizedUnit = { type: "pages", from: 2, to: 10 };
    expect(addMemorized([legacy], [pages(2, 10, 12)], bounds)).toEqual([pages(2, 2, 12)]);
  });
});

describe("editMemorizedRange", () => {
  it("changes the row's pages in place", () => {
    const list = [{ type: "juz", juz: 30 } as MemorizedUnit, pages(2, 2, 10)];
    expect(editMemorizedRange(list, 1, { from: 2, to: 14 }, bounds)).toEqual([
      { type: "juz", juz: 30 },
      pages(2, 2, 14),
    ]);
  });

  it("absorbs another row of the surah the edit now reaches", () => {
    const list = [pages(2, 2, 10), pages(2, 20, 25)];
    expect(editMemorizedRange(list, 0, { from: 2, to: 19 }, bounds)).toEqual([pages(2, 2, 25)]);
  });
});

describe("pagesUnitSurah", () => {
  it("finds the surah of a row saved without one", () => {
    expect(pagesUnitSurah({ type: "pages", from: 80, to: 90 }, bounds)).toBe(4);
  });

  it("is null for a range spanning two surahs", () => {
    expect(pagesUnitSurah({ type: "pages", from: 45, to: 55 }, bounds)).toBeNull();
  });
});
