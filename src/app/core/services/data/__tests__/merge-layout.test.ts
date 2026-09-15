import { mergeLayoutIntoVerses } from "../merge-layout";
import type { Verse, VerseWord } from "../../../../shared/models/verse.model";

/** A word as the API returns it: real Uthmani text, glyph from the API. */
function apiWord(
  position: number,
  uthmani: string,
  codeV2: string,
  line: number,
): VerseWord {
  return {
    position,
    charType: "word",
    text_uthmani: uthmani,
    codeV2,
    lineNumber: line,
    pageNumber: 50,
  };
}

/** A word as the snapshot stores it: glyph + layout, no Uthmani text. */
function layoutWord(codeV2: string, line: number): VerseWord {
  return {
    position: 0,
    charType: "word",
    text_uthmani: "",
    codeV2,
    lineNumber: line,
    pageNumber: 50,
  };
}

function verse(aya: number, words: VerseWord[]): Verse {
  return {
    sura: 3,
    aya,
    text: words.map((w) => w.text_uthmani).join(" "),
    page: 50,
    suraNameAr: "آل عمران",
    words,
  };
}

describe("mergeLayoutIntoVerses", () => {
  it("takes layout from the snapshot and Uthmani text from the API", () => {
    const verses = [
      verse(1, [apiWord(1, "الم", "ﱁ", 9), apiWord(2, "ذلك", "ﱂ", 9)]),
    ];
    // The snapshot disagrees about the line — it is authoritative for layout.
    const layout = [layoutWord("ﱁ", 3), layoutWord("ﱂ", 3)];

    const merged = mergeLayoutIntoVerses(verses, layout);

    expect(merged[0].words![0].lineNumber).toBe(3);
    expect(merged[0].words![0].text_uthmani).toBe("الم");
    expect(merged[0].words![1].lineNumber).toBe(3);
    expect(merged[0].words![1].text_uthmani).toBe("ذلك");
  });

  it("spans verses in page order", () => {
    const verses = [
      verse(1, [apiWord(1, "a", "ﱁ", 9)]),
      verse(2, [apiWord(1, "b", "ﱂ", 9), apiWord(2, "c", "ﱃ", 9)]),
    ];
    const layout = [
      layoutWord("ﱁ", 3),
      layoutWord("ﱂ", 4),
      layoutWord("ﱃ", 5),
    ];

    const merged = mergeLayoutIntoVerses(verses, layout);

    expect(merged[1].words![0].lineNumber).toBe(4);
    expect(merged[1].words![1].lineNumber).toBe(5);
    expect(merged[1].words![1].text_uthmani).toBe("c");
  });

  it("refuses the merge when word counts differ", () => {
    // Counts differing means the two sources disagree about the page. Merging
    // anyway would pair glyphs with the wrong words.
    const verses = [verse(1, [apiWord(1, "a", "ﱁ", 9)])];
    const layout = [layoutWord("ﱁ", 3), layoutWord("ﱂ", 3)];

    expect(mergeLayoutIntoVerses(verses, layout)).toBeNull();
  });

  it("refuses the merge when a glyph does not line up", () => {
    // THE IMPORTANT ONE. Counts match, so a count check passes — but the
    // layout is shifted by one, so every word would get the wrong text.
    // This is what the position_in_line ordering bug looks like downstream.
    const verses = [
      verse(1, [apiWord(1, "a", "ﱁ", 9), apiWord(2, "b", "ﱂ", 9)]),
    ];
    const layout = [layoutWord("ﱂ", 3), layoutWord("ﱃ", 3)];

    expect(mergeLayoutIntoVerses(verses, layout)).toBeNull();
  });

  it("refuses the merge when the layout is empty", () => {
    const verses = [verse(1, [apiWord(1, "a", "ﱁ", 9)])];
    expect(mergeLayoutIntoVerses(verses, [])).toBeNull();
  });

  it("leaves the API verses untouched rather than mutating them", () => {
    const verses = [verse(1, [apiWord(1, "a", "ﱁ", 9)])];
    const layout = [layoutWord("ﱁ", 3)];

    const merged = mergeLayoutIntoVerses(verses, layout);

    expect(merged![0].words![0].lineNumber).toBe(3);
    expect(verses[0].words![0].lineNumber).toBe(9);
  });

  it("keeps verse-level fields from the API", () => {
    const verses = [verse(7, [apiWord(1, "a", "ﱁ", 9)])];
    const layout = [layoutWord("ﱁ", 3)];

    const merged = mergeLayoutIntoVerses(verses, layout)!;

    expect(merged[0].aya).toBe(7);
    expect(merged[0].sura).toBe(3);
    expect(merged[0].text).toBe("a");
    expect(merged[0].suraNameAr).toBe("آل عمران");
  });

  it("accepts a glyph that differs only by internal whitespace", () => {
    // Verified against the live data (2026-09-15): 200 of the 83,665 snapshot
    // words spell a two-glyph word as "X Y" while /verses/by_page/ returns
    // "XY". Same glyphs, different whitespace convention — pages 156 and 526
    // are the two where this actually decides the merge. Treating it as a
    // mismatch would drop the authoritative layout for those pages.
    const verses = [verse(1, [apiWord(1, "a", "ﲁﲂ", 9)])];
    const layout = [layoutWord("ﲁ ﲂ", 3)];

    const merged = mergeLayoutIntoVerses(verses, layout);

    expect(merged).not.toBeNull();
    expect(merged![0].words![0].lineNumber).toBe(3);
    // The API's spelling is kept — only layout is taken from the snapshot.
    expect(merged![0].words![0].codeV2).toBe("ﲁﲂ");
  });

  it("still refuses a genuinely different glyph", () => {
    // The whitespace tolerance must not weaken the real alignment check.
    const verses = [verse(1, [apiWord(1, "a", "ﲁﲂ", 9)])];
    expect(mergeLayoutIntoVerses(verses, [layoutWord("ﲁ ﲙ", 3)])).toBeNull();
  });

  it("refuses a page whose verses carry no words", () => {
    // Uthmani-only mushafs are fetched without code_v2; there is nothing to
    // align against, so the layout must not be forced on.
    const wordless: Verse[] = [
      { sura: 3, aya: 1, text: "الم", page: 50, suraNameAr: "آل عمران" },
    ];
    expect(mergeLayoutIntoVerses(wordless, [layoutWord("ﱁ", 3)])).toBeNull();
  });
});
