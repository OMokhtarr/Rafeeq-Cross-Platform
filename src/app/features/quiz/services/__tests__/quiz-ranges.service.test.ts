import type { QuizRange, Verse } from "../../../../shared/models/verse.model";

// The factory forwards to these module-scope mocks rather than carrying
// implementations itself: CRA's jest preset sets resetMocks, which would strip
// an implementation passed straight to jest.fn() inside the factory.
const mockGetSurahVersesList = jest.fn();
const mockGetJuzVerses = jest.fn();
const mockGetPageRangeVerses = jest.fn();

jest.mock("../../../../core/services/data/quran.service", () => ({
  getSurahVersesList: (...a: unknown[]) => mockGetSurahVersesList(...a),
  getJuzVerses: (...a: unknown[]) => mockGetJuzVerses(...a),
  getPageRangeVerses: (...a: unknown[]) => mockGetPageRangeVerses(...a),
}));

// Al-Fatiha is page 1; Al-Baqarah 2–49; juz 1 runs to Al-Baqarah 141, page 21.
jest.mock("../../../../core/services/data/metadata.service", () => ({
  getSurahStartPage: (s: number) => (s === 1 ? 1 : s === 2 ? 2 : 100),
  getSurahEndPage: (s: number) => (s === 1 ? 1 : s === 2 ? 49 : 110),
  getJuzStart: () => ({ sura: 1, aya: 1 }),
  getJuzEnd: () => ({ sura: 2, aya: 141 }),
  estimatePageForVerse: (sura: number) => (sura === 1 ? 1 : 21),
}));

import {
  isValidRange,
  normalizeRanges,
  buildRangeVerses,
  rangePageCount,
  totalPageCount,
} from "../quiz-ranges.service";

const verse = (sura: number, aya: number, page = 1): Verse => ({
  sura,
  aya,
  text: `${sura}:${aya}`,
  page,
  suraNameAr: "س",
});

beforeEach(() => {
  mockGetSurahVersesList.mockReset().mockResolvedValue([]);
  mockGetJuzVerses.mockReset().mockResolvedValue([]);
  mockGetPageRangeVerses.mockReset().mockResolvedValue([]);
});

describe("isValidRange", () => {
  it("accepts in-bounds ranges", () => {
    expect(isValidRange({ kind: "juz", juz: 30 })).toBe(true);
    expect(isValidRange({ kind: "surah", surah: 114 })).toBe(true);
    expect(isValidRange({ kind: "pages", from: 1, to: 604 })).toBe(true);
  });

  it("rejects out-of-bounds juz and surah numbers", () => {
    expect(isValidRange({ kind: "juz", juz: 0 })).toBe(false);
    expect(isValidRange({ kind: "juz", juz: 31 })).toBe(false);
    expect(isValidRange({ kind: "surah", surah: 115 })).toBe(false);
  });

  it("rejects page spans outside the mushaf or running backwards", () => {
    expect(isValidRange({ kind: "pages", from: 0, to: 10 })).toBe(false);
    expect(isValidRange({ kind: "pages", from: 600, to: 605 })).toBe(false);
    expect(isValidRange({ kind: "pages", from: 50, to: 40 })).toBe(false);
  });
});

describe("normalizeRanges", () => {
  it("removes exact duplicates, keeping the first", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 1 },
      { kind: "juz", juz: 1 },
      { kind: "juz", juz: 2 },
    ];
    expect(normalizeRanges(ranges)).toEqual([
      { kind: "juz", juz: 1 },
      { kind: "juz", juz: 2 },
    ]);
  });

  // Overlap is deliberately allowed: the pool dedupes at verse level, and
  // rejecting it would surprise a user who thinks in units, not verses.
  it("keeps overlapping-but-distinct ranges", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 30 },
      { kind: "pages", from: 590, to: 600 },
    ];
    expect(normalizeRanges(ranges)).toHaveLength(2);
  });

  it("drops invalid entries instead of throwing", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 99 },
      { kind: "surah", surah: 2 },
    ];
    expect(normalizeRanges(ranges)).toEqual([{ kind: "surah", surah: 2 }]);
  });
});

describe("buildRangeVerses", () => {
  it("returns nothing for an empty list without calling the fetchers", async () => {
    expect(await buildRangeVerses([])).toEqual([]);
    expect(mockGetJuzVerses).not.toHaveBeenCalled();
  });

  it("dispatches each kind to its own fetcher", async () => {
    await buildRangeVerses([
      { kind: "surah", surah: 2 },
      { kind: "juz", juz: 30 },
      { kind: "pages", from: 1, to: 5 },
    ]);
    expect(mockGetSurahVersesList).toHaveBeenCalledWith(2);
    expect(mockGetJuzVerses).toHaveBeenCalledWith([30]);
    expect(mockGetPageRangeVerses).toHaveBeenCalledWith(1, 5);
  });

  it("unions the results across kinds", async () => {
    mockGetSurahVersesList.mockResolvedValue([verse(2, 1)]);
    mockGetJuzVerses.mockResolvedValue([verse(78, 1, 582)]);
    const out = await buildRangeVerses([
      { kind: "surah", surah: 2 },
      { kind: "juz", juz: 30 },
    ]);
    expect(out).toHaveLength(2);
  });

  it("dedupes verses shared by overlapping ranges", async () => {
    mockGetJuzVerses.mockResolvedValue([verse(78, 1, 582), verse(78, 2, 582)]);
    mockGetPageRangeVerses.mockResolvedValue([verse(78, 2, 582), verse(78, 3, 582)]);
    const out = await buildRangeVerses([
      { kind: "juz", juz: 30 },
      { kind: "pages", from: 582, to: 582 },
    ]);
    expect(out.map((v) => `${v.sura}:${v.aya}`)).toEqual([
      "78:1",
      "78:2",
      "78:3",
    ]);
  });

  it("sorts into mushaf order regardless of the order ranges were added", async () => {
    mockGetSurahVersesList.mockResolvedValue([verse(2, 5)]);
    mockGetJuzVerses.mockResolvedValue([verse(1, 3)]);
    const out = await buildRangeVerses([
      { kind: "surah", surah: 2 },
      { kind: "juz", juz: 1 },
    ]);
    expect(out.map((v) => `${v.sura}:${v.aya}`)).toEqual(["1:3", "2:5"]);
  });

  it("skips invalid entries but still fetches the good ones", async () => {
    mockGetSurahVersesList.mockResolvedValue([verse(2, 1)]);
    const out = await buildRangeVerses([
      { kind: "pages", from: 700, to: 800 },
      { kind: "surah", surah: 2 },
    ]);
    expect(mockGetPageRangeVerses).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
  });
});

describe("rangePageCount", () => {
  it("counts a page span inclusively", () => {
    expect(rangePageCount({ kind: "pages", from: 10, to: 12 })).toBe(3);
    expect(rangePageCount({ kind: "pages", from: 7, to: 7 })).toBe(1);
  });

  it("measures a surah from its own start and end pages", () => {
    expect(rangePageCount({ kind: "surah", surah: 2 })).toBe(48);
  });

  it("gives a single-page surah a count of one", () => {
    expect(rangePageCount({ kind: "surah", surah: 1 })).toBe(1);
  });

  // Juz boundaries are stored as verses, so the count comes from locating
  // them on the page grid rather than from a per-juz constant.
  it("measures a juz through its first and last verse", () => {
    expect(rangePageCount({ kind: "juz", juz: 1 })).toBe(21);
  });

  it("counts an invalid range as nothing rather than throwing", () => {
    expect(rangePageCount({ kind: "juz", juz: 99 })).toBe(0);
    expect(rangePageCount({ kind: "pages", from: 50, to: 40 })).toBe(0);
  });
});

describe("totalPageCount", () => {
  it("is zero for an empty selection", () => {
    expect(totalPageCount([])).toBe(0);
  });

  it("adds up ranges that do not overlap", () => {
    expect(
      totalPageCount([
        { kind: "pages", from: 100, to: 104 },
        { kind: "pages", from: 200, to: 201 },
      ]),
    ).toBe(7);
  });

  // The whole point of counting pages rather than summing ranges: three
  // questions per page must not be inflated by ranges that overlap.
  it("counts a shared page once", () => {
    expect(
      totalPageCount([
        { kind: "pages", from: 10, to: 20 },
        { kind: "pages", from: 15, to: 25 },
      ]),
    ).toBe(16);
  });

  it("counts across kinds without double-counting", () => {
    // Al-Fatiha is page 1, and juz 1 spans pages 1–21, so the union is 21.
    expect(
      totalPageCount([
        { kind: "surah", surah: 1 },
        { kind: "juz", juz: 1 },
      ]),
    ).toBe(21);
  });

  it("ignores invalid entries", () => {
    expect(
      totalPageCount([
        { kind: "pages", from: 700, to: 800 },
        { kind: "pages", from: 1, to: 3 },
      ]),
    ).toBe(3);
  });
});
