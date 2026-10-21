import { normalizeArabic, type CorpusToken } from "../recite-matcher.service";
import { decideIdentify, type IdentifyCorpus } from "../recite-identify.service";

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
