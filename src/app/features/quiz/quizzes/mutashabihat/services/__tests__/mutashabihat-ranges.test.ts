import { filterGroupsByRanges } from "../mutashabihat.service";
import type {
  QuizRange,
  Verse,
} from "../../../../../../shared/models/verse.model";

const verse = (sura: number, aya: number, page: number, juz: number): Verse => ({
  sura,
  aya,
  text: `${sura}:${aya}`,
  page,
  juz,
  suraNameAr: "س",
});

// Groups carry extra fields the filter never reads, so fixtures supply only
// the verses and borrow the rest through the cast.
const group = (verses: Verse[]) => ({ id: verses[0].text, verses } as any);

describe("filterGroupsByRanges", () => {
  it("keeps a group whose verses all sit in one range", () => {
    const g = group([verse(2, 1, 2, 1), verse(2, 9, 3, 1)]);
    const ranges: QuizRange[] = [{ kind: "surah", surah: 2 }];
    expect(filterGroupsByRanges([g], ranges)).toHaveLength(1);
  });

  // The whole reason this function exists rather than a loop over the three
  // single-scope filters: neither range alone reaches MIN_GROUP_SIZE.
  it("keeps a group whose matching verses are split across two ranges", () => {
    const g = group([verse(2, 1, 2, 1), verse(78, 1, 582, 30)]);
    const ranges: QuizRange[] = [
      { kind: "surah", surah: 2 },
      { kind: "juz", juz: 30 },
    ];
    const out = filterGroupsByRanges([g], ranges);
    expect(out).toHaveLength(1);
    expect(out[0].verses).toHaveLength(2);
  });

  it("drops a group with only one verse in the whole range set", () => {
    const g = group([verse(2, 1, 2, 1), verse(78, 1, 582, 30)]);
    const ranges: QuizRange[] = [{ kind: "surah", surah: 2 }];
    expect(filterGroupsByRanges([g], ranges)).toEqual([]);
  });

  it("narrows a kept group to just the matching verses", () => {
    const g = group([
      verse(2, 1, 2, 1),
      verse(2, 9, 3, 1),
      verse(78, 1, 582, 30),
    ]);
    const ranges: QuizRange[] = [{ kind: "surah", surah: 2 }];
    const out = filterGroupsByRanges([g], ranges);
    expect(out[0].verses.map((v: Verse) => v.sura)).toEqual([2, 2]);
  });

  it("matches a page range by page number", () => {
    const g = group([verse(2, 1, 10, 1), verse(2, 9, 11, 1)]);
    const ranges: QuizRange[] = [{ kind: "pages", from: 10, to: 11 }];
    expect(filterGroupsByRanges([g], ranges)).toHaveLength(1);
  });

  it("counts a verse once when ranges overlap", () => {
    const g = group([verse(78, 1, 582, 30), verse(78, 2, 582, 30)]);
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 30 },
      { kind: "pages", from: 582, to: 582 },
    ];
    const out = filterGroupsByRanges([g], ranges);
    expect(out[0].verses).toHaveLength(2);
  });

  it("returns nothing when the range list is empty", () => {
    const g = group([verse(2, 1, 2, 1), verse(2, 9, 3, 1)]);
    expect(filterGroupsByRanges([g], [])).toEqual([]);
  });

  it("ignores invalid ranges", () => {
    const g = group([verse(2, 1, 2, 1), verse(2, 9, 3, 1)]);
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 99 },
      { kind: "surah", surah: 2 },
    ];
    expect(filterGroupsByRanges([g], ranges)).toHaveLength(1);
  });
});
