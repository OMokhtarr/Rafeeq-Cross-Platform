/**
 * rangeSurahs runs against the real bundled tables with NO metadata loaded —
 * the first-launch-offline state. The setup page calls it on render, so it
 * must not depend on the fetched chapters/juz caches.
 */
import { rangeSurahs } from "../quiz-ranges.service";

const sorted = (s: Set<number>) => [...s].sort((a, b) => a - b);
const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

describe("rangeSurahs (bundled tables, metadata not loaded)", () => {
  it("returns the surah of a surah range", () => {
    expect(sorted(rangeSurahs([{ kind: "surah", surah: 2 }]))).toEqual([2]);
  });

  it("keeps a page range inside one surah to that surah", () => {
    expect(sorted(rangeSurahs([{ kind: "pages", from: 5, to: 10 }]))).toEqual([2]);
  });

  it("counts both surahs when a page range crosses a boundary", () => {
    expect(sorted(rangeSurahs([{ kind: "pages", from: 49, to: 50 }]))).toEqual([2, 3]);
  });

  it("includes every surah on the last page", () => {
    expect(sorted(rangeSurahs([{ kind: "pages", from: 604, to: 604 }]))).toEqual([112, 113, 114]);
  });

  it("spans a juz from its first surah to its last", () => {
    expect(sorted(rangeSurahs([{ kind: "juz", juz: 1 }]))).toEqual([1, 2]);
    expect(sorted(rangeSurahs([{ kind: "juz", juz: 30 }]))).toEqual(span(78, 114));
  });

  it("unions ranges and ignores invalid ones", () => {
    const out = rangeSurahs([
      { kind: "surah", surah: 1 },
      { kind: "surah", surah: 2 },
      { kind: "surah", surah: 999 },
    ]);
    expect(sorted(out)).toEqual([1, 2]);
  });
});
