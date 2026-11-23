import fs from "fs";
import path from "path";
import { findSimilarInCorpus, CorpusVerse } from "../similar-verses.service";

jest.mock("../../storage/idb.service", () => ({ idb: {} }));
jest.mock("../../data/quran.service", () => ({ seedTextCorpus: jest.fn() }));

const v = (sura: number, aya: number, text: string): CorpusVerse => ({ sura, aya, text, page: 1 });

describe("findSimilarInCorpus", () => {
  const corpus = [
    v(1, 1, "إِنَّ ٱللَّهَ غَفُورٌ رَّحِيمٌ"),
    v(1, 2, "وَٱتَّقُوا۟ ٱللَّهَ إِنَّ ٱللَّهَ غَفُورٌ رَّحِيمٌ"),
    v(1, 3, "قُلْ إِنَّ ٱللَّهَ غَفُورٌ"),
    v(1, 4, "إِنَّ ٱللَّهَ عَلِيمٌ"),
    v(1, 5, "غَفُورٌ رَّحِيمٌ"),
  ];

  it("finds verses sharing a run of three or more words, longest first", () => {
    const hits = findSimilarInCorpus(corpus, "1:1");
    expect(hits.map((h) => [h.key, h.longestRun])).toEqual([
      ["1:2", 4],
      ["1:3", 3],
    ]);
  });

  it("ignores diacritics and marks which words are shared", () => {
    const [first] = findSimilarInCorpus(corpus, "1:1");
    expect(first.shared).toEqual([2, 3, 4, 5]);
  });

  it("leaves out the verse itself and verses sharing fewer than three words", () => {
    const keys = findSimilarInCorpus(corpus, "1:1").map((h) => h.key);
    expect(keys).not.toContain("1:1");
    expect(keys).not.toContain("1:4");
    expect(keys).not.toContain("1:5");
  });

  it("returns nothing for an unknown verse", () => {
    expect(findSimilarInCorpus(corpus, "9:999")).toEqual([]);
  });

  // The real corpus: 2:5 (أُو۟لَـٰٓئِكَ عَلَىٰ هُدًى مِّن رَّبِّهِمْ ۖ وَأُو۟لَـٰٓئِكَ هُمُ ٱلْمُفْلِحُونَ)
  // is repeated word for word in 31:5.
  it("finds the repeated verse in the bundled text", () => {
    const file = path.join(__dirname, "../../../../../../public/data/quran-text.json");
    const { verses } = JSON.parse(fs.readFileSync(file, "utf8")) as { verses: CorpusVerse[] };
    const hits = findSimilarInCorpus(verses, "2:5");
    expect(hits[0].key).toBe("31:5");
  });
});
