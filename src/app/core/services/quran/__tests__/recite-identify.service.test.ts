import * as fs from "fs";
import * as path from "path";
import { normalizeArabic, type CorpusToken } from "../recite-matcher.service";
import {
  buildIdentifyCorpus,
  buildIdentifyIndex,
  decideIdentify,
  type IdentifyCorpus,
} from "../recite-identify.service";

// Verse text as the app carries it (Quran.com text_uthmani), "|" between words.
const FIXTURE: Record<string, string> = {
  "2:2": "ذَٰلِكَ|ٱلْكِتَـٰبُ|لَا|رَيْبَ ۛ|فِيهِ ۛ|هُدًۭى|لِّلْمُتَّقِينَ",
  "2:3": "ٱلَّذِينَ|يُؤْمِنُونَ|بِٱلْغَيْبِ|وَيُقِيمُونَ|ٱلصَّلَوٰةَ|وَمِمَّا|رَزَقْنَـٰهُمْ|يُنفِقُونَ",
  "2:4": "وَٱلَّذِينَ|يُؤْمِنُونَ|بِمَآ|أُنزِلَ|إِلَيْكَ|وَمَآ|أُنزِلَ|مِن|قَبْلِكَ|وَبِٱلْـَٔاخِرَةِ|هُمْ|يُوقِنُونَ",
  "2:5": "أُو۟لَـٰٓئِكَ|عَلَىٰ|هُدًۭى|مِّن|رَّبِّهِمْ ۖ|وَأُو۟لَـٰٓئِكَ|هُمُ|ٱلْمُفْلِحُونَ",
  "2:6": "إِنَّ|ٱلَّذِينَ|كَفَرُوا۟|سَوَآءٌ|عَلَيْهِمْ|ءَأَنذَرْتَهُمْ|أَمْ|لَمْ|تُنذِرْهُمْ|لَا|يُؤْمِنُونَ",
  "2:7": "خَتَمَ|ٱللَّهُ|عَلَىٰ|قُلُوبِهِمْ|وَعَلَىٰ|سَمْعِهِمْ ۖ|وَعَلَىٰٓ|أَبْصَـٰرِهِمْ|غِشَـٰوَةٌۭ ۖ|وَلَهُمْ|عَذَابٌ|عَظِيمٌۭ",
  "78:8": "وَخَلَقْنَـٰكُمْ|أَزْوَٰجًۭا",
  "78:9": "وَجَعَلْنَا|نَوْمَكُمْ|سُبَاتًۭا",
  "78:10": "وَجَعَلْنَا|ٱلَّيْلَ|لِبَاسًۭا",
  "78:11": "وَجَعَلْنَا|ٱلنَّهَارَ|مَعَاشًۭا",
};

function buildCorpus(): IdentifyCorpus {
  const tokens: CorpusToken[] = [];
  const verseStarts: number[] = [];
  const startIndexByVerse = new Map<string, number>();
  for (const [key, text] of Object.entries(FIXTURE)) {
    const [sura, aya] = key.split(":").map(Number);
    startIndexByVerse.set(key, tokens.length);
    verseStarts.push(tokens.length);
    text
      .split("|")
      .map(normalizeArabic)
      .filter(Boolean)
      .forEach((token, wordIndex) => tokens.push({ sura, aya, wordIndex, token }));
  }
  return { tokens, verseStarts, startIndexByVerse };
}

const spoken = (key: string) => FIXTURE[key].split("|").join(" ");

describe("decideIdentify", () => {
  const corpus = buildCorpus();

  it("decides 2:3 from its full text", () => {
    expect(decideIdentify(spoken("2:3"), corpus)).toEqual({
      status: "found",
      sura: 2,
      aya: 3,
      unique: true,
    });
  });

  it("says none for two words", () => {
    expect(decideIdentify("يُؤْمِنُونَ بِٱلْغَيْبِ", corpus)).toEqual({ status: "none" });
  });

  it("does not place the shared وجعلنا opening of 78:9 / 78:10 on the wrong verse", () => {
    const out = decideIdentify("وَجَعَلْنَا وَجَعَلْنَا وَجَعَلْنَا", corpus);
    expect(out.status).not.toBe("found");
  });

  it("lands on the verse the shared وجعلنا opening continues into", () => {
    expect(
      decideIdentify("وجعلنا الليل لباسا وجعلنا النهار معاشا", corpus),
    ).toMatchObject({ status: "found", sura: 78, aya: 10 });
  });

  it("honours a lower minMatched", () => {
    const text = spoken("2:3").split(" ").slice(0, 4).join(" ");
    expect(decideIdentify(text, corpus).status).toBe("none");
    expect(decideIdentify(text, corpus, { minMatched: 4 })).toMatchObject({
      status: "found",
      sura: 2,
      aya: 3,
    });
  });
});

// The app's own bundled corpus: word rarity only means something over the
// whole Quran. Spoken text below is in standard (imlaei) spelling, as STT
// writes it, not the corpus's Uthmani spelling.
describe("decideIdentify over the whole Quran", () => {
  const file = path.join(__dirname, "../../../../../../public/data/quran-text.json");
  const quran = buildIdentifyCorpus(JSON.parse(fs.readFileSync(file, "utf8")).verses);
  const index = buildIdentifyIndex(quran);

  it("finds a passage started mid-verse", () => {
    expect(
      decideIdentify("أنزل من قبلك وبالآخرة هم يوقنون", quran, {}, index),
    ).toMatchObject({ status: "found", sura: 2, aya: 4 });
  });

  it("never decides on common words alone", () => {
    for (const minMatched of [4, 5]) {
      const out = decideIdentify("الله الذين قال إن من", quran, { minMatched }, index);
      expect(out.status).not.toBe("found");
    }
  });

  it("rare words decide sooner than common ones", () => {
    expect(
      decideIdentify("الذين يؤمنون بالغيب ويقيمون", quran, { minMatched: 4 }, index),
    ).toMatchObject({ status: "found", sura: 2, aya: 3 });
  });

  it("waits on a passage shared word for word, unless it knows where the reciter was", () => {
    // 12:22 and 28:14 read the same through "حكما وعلما وكذلك نجزي المحسنين".
    const text = "ولما بلغ أشده آتيناه حكما وعلما";
    expect(decideIdentify(text, quran, { minMatched: 4 }, index).status).toBe("ambiguous");
    expect(
      decideIdentify(text, quran, { minMatched: 4, nearPosition: { sura: 28, aya: 10 } }, index),
    ).toMatchObject({ status: "found", sura: 28, aya: 14, unique: false });
  });

  it("follows a passage into the next sura past the basmalah folded into it", () => {
    expect(
      decideIdentify("وما هو إلا ذكر للعالمين الحاقة ما الحاقة", quran, {}, index),
    ).toMatchObject({ status: "found", sura: 68, aya: 52 });
  });
});

describe("buildIdentifyCorpus", () => {
  it("sorts rows canonically and tokenizes with normalizeArabic", () => {
    const corpus = buildIdentifyCorpus([
      { sura: 10, aya: 1, text: "الٓر" },
      { sura: 2, aya: 2, text: "ذَٰلِكَ ٱلْكِتَـٰبُ" },
      { sura: 2, aya: 1, text: "الٓمٓ" },
      { sura: 3, aya: 1, text: "" },
    ]);
    expect(corpus.tokens.map((t) => `${t.sura}:${t.aya}:${t.wordIndex}:${t.token}`)).toEqual([
      `2:1:0:${normalizeArabic("الٓمٓ")}`,
      `2:2:0:${normalizeArabic("ذَٰلِكَ")}`,
      `2:2:1:${normalizeArabic("ٱلْكِتَـٰبُ")}`,
      `10:1:0:${normalizeArabic("الٓر")}`,
    ]);
    expect(corpus.verseStarts).toEqual([0, 1, 3]);
    expect(corpus.startIndexByVerse.get("10:1")).toBe(3);
    expect(corpus.startIndexByVerse.has("3:1")).toBe(false);
  });
});
