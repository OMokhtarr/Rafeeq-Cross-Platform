import type { QuizRange, Verse } from "../../../../shared/models/verse.model";

jest.mock("../../../../core/services/data/quran.service", () => ({
  getSurahVersesList: jest.fn(),
  getJuzVerses: jest.fn(),
  getPageRangeVerses: jest.fn(),
}));

import {
  isValidRange,
  normalizeRanges,
  buildRangeVerses,
} from "../quiz-ranges.service";
import {
  getSurahVersesList,
  getJuzVerses,
  getPageRangeVerses,
} from "../../../../core/services/data/quran.service";

const mockGetSurahVersesList = getSurahVersesList as jest.Mock;
const mockGetJuzVerses = getJuzVerses as jest.Mock;
const mockGetPageRangeVerses = getPageRangeVerses as jest.Mock;

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
