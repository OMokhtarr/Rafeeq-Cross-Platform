import type { Verse, VerseWord } from "../../../../shared/models/verse.model";
import type { RecitePosition } from "../recite-matcher.service";
import {
  alignPhrase,
  createReciteTracker,
  markPositionKeys,
  markSkipped,
  spokenWordsFrom,
  type AlignOptions,
  type TrackerState,
} from "../recite-aligner.service";

// Verse text exactly as the app's page data carries it (Quran.com
// text_uthmani), word-aligned with Quran.com's standard spelling. "|"
// separates words because a word can carry a pause mark after a space.
const FIXTURE: Record<string, { uthmani: string; standard: string }> = {
  "2:1": {
    uthmani: "الٓمٓ",
    standard: "الم",
  },
  "2:2": {
    uthmani: "ذَٰلِكَ|ٱلْكِتَـٰبُ|لَا|رَيْبَ ۛ|فِيهِ ۛ|هُدًۭى|لِّلْمُتَّقِينَ",
    standard: "ذَٰلِكَ|الْكِتَابُ|لَا|رَيْبَ ۛ|فِيهِ ۛ|هُدًى|لِّلْمُتَّقِينَ",
  },
  "2:3": {
    uthmani: "ٱلَّذِينَ|يُؤْمِنُونَ|بِٱلْغَيْبِ|وَيُقِيمُونَ|ٱلصَّلَوٰةَ|وَمِمَّا|رَزَقْنَـٰهُمْ|يُنفِقُونَ",
    standard: "الَّذِينَ|يُؤْمِنُونَ|بِالْغَيْبِ|وَيُقِيمُونَ|الصَّلَاةَ|وَمِمَّا|رَزَقْنَاهُمْ|يُنفِقُونَ",
  },
  "2:4": {
    uthmani: "وَٱلَّذِينَ|يُؤْمِنُونَ|بِمَآ|أُنزِلَ|إِلَيْكَ|وَمَآ|أُنزِلَ|مِن|قَبْلِكَ|وَبِٱلْـَٔاخِرَةِ|هُمْ|يُوقِنُونَ",
    standard: "وَالَّذِينَ|يُؤْمِنُونَ|بِمَا|أُنزِلَ|إِلَيْكَ|وَمَا|أُنزِلَ|مِن|قَبْلِكَ|وَبِالْآخِرَةِ|هُمْ|يُوقِنُونَ",
  },
  "2:5": {
    uthmani: "أُو۟لَـٰٓئِكَ|عَلَىٰ|هُدًۭى|مِّن|رَّبِّهِمْ ۖ|وَأُو۟لَـٰٓئِكَ|هُمُ|ٱلْمُفْلِحُونَ",
    standard: "أُولَٰئِكَ|عَلَىٰ|هُدًى|مِّن|رَّبِّهِمْ ۖ|وَأُولَٰئِكَ|هُمُ|الْمُفْلِحُونَ",
  },
  "2:6": {
    uthmani: "إِنَّ|ٱلَّذِينَ|كَفَرُوا۟|سَوَآءٌ|عَلَيْهِمْ|ءَأَنذَرْتَهُمْ|أَمْ|لَمْ|تُنذِرْهُمْ|لَا|يُؤْمِنُونَ",
    standard: "إِنَّ|الَّذِينَ|كَفَرُوا|سَوَاءٌ|عَلَيْهِمْ|أَأَنذَرْتَهُمْ|أَمْ|لَمْ|تُنذِرْهُمْ|لَا|يُؤْمِنُونَ",
  },
  "2:7": {
    uthmani: "خَتَمَ|ٱللَّهُ|عَلَىٰ|قُلُوبِهِمْ|وَعَلَىٰ|سَمْعِهِمْ ۖ|وَعَلَىٰٓ|أَبْصَـٰرِهِمْ|غِشَـٰوَةٌۭ ۖ|وَلَهُمْ|عَذَابٌ|عَظِيمٌۭ",
    standard: "خَتَمَ|اللَّهُ|عَلَىٰ|قُلُوبِهِمْ|وَعَلَىٰ|سَمْعِهِمْ ۖ|وَعَلَىٰ|أَبْصَارِهِمْ|غِشَاوَةٌ ۖ|وَلَهُمْ|عَذَابٌ|عَظِيمٌ",
  },
  "2:255": {
    uthmani: "ٱللَّهُ|لَآ|إِلَـٰهَ|إِلَّا|هُوَ|ٱلْحَىُّ|ٱلْقَيُّومُ ۚ|لَا|تَأْخُذُهُۥ|سِنَةٌۭ|وَلَا|نَوْمٌۭ ۚ|لَّهُۥ|مَا|فِى|ٱلسَّمَـٰوَٰتِ|وَمَا|فِى|ٱلْأَرْضِ ۗ|مَن|ذَا|ٱلَّذِى|يَشْفَعُ|عِندَهُۥٓ|إِلَّا|بِإِذْنِهِۦ ۚ|يَعْلَمُ|مَا|بَيْنَ|أَيْدِيهِمْ|وَمَا|خَلْفَهُمْ ۖ|وَلَا|يُحِيطُونَ|بِشَىْءٍۢ|مِّنْ|عِلْمِهِۦٓ|إِلَّا|بِمَا|شَآءَ ۚ|وَسِعَ|كُرْسِيُّهُ|ٱلسَّمَـٰوَٰتِ|وَٱلْأَرْضَ ۖ|وَلَا|يَـُٔودُهُۥ|حِفْظُهُمَا ۚ|وَهُوَ|ٱلْعَلِىُّ|ٱلْعَظِيمُ",
    standard: "اللَّهُ|لَا|إِلَٰهَ|إِلَّا|هُوَ|الْحَيُّ|الْقَيُّومُ ۚ|لَا|تَأْخُذُهُ|سِنَةٌ|وَلَا|نَوْمٌ ۚ|لَّهُ|مَا|فِي|السَّمَاوَاتِ|وَمَا|فِي|الْأَرْضِ ۗ|مَن|ذَا|الَّذِي|يَشْفَعُ|عِندَهُ|إِلَّا|بِإِذْنِهِ ۚ|يَعْلَمُ|مَا|بَيْنَ|أَيْدِيهِمْ|وَمَا|خَلْفَهُمْ ۖ|وَلَا|يُحِيطُونَ|بِشَيْءٍ|مِّنْ|عِلْمِهِ|إِلَّا|بِمَا|شَاءَ ۚ|وَسِعَ|كُرْسِيُّهُ|السَّمَاوَاتِ|وَالْأَرْضَ ۖ|وَلَا|يَئُودُهُ|حِفْظُهُمَا ۚ|وَهُوَ|الْعَلِيُّ|الْعَظِيمُ",
  },
  "78:8": {
    uthmani: "وَخَلَقْنَـٰكُمْ|أَزْوَٰجًۭا",
    standard: "وَخَلَقْنَاكُمْ|أَزْوَاجًا",
  },
  "78:9": {
    uthmani: "وَجَعَلْنَا|نَوْمَكُمْ|سُبَاتًۭا",
    standard: "وَجَعَلْنَا|نَوْمَكُمْ|سُبَاتًا",
  },
  "78:10": {
    uthmani: "وَجَعَلْنَا|ٱلَّيْلَ|لِبَاسًۭا",
    standard: "وَجَعَلْنَا|اللَّيْلَ|لِبَاسًا",
  },
  "78:11": {
    uthmani: "وَجَعَلْنَا|ٱلنَّهَارَ|مَعَاشًۭا",
    standard: "وَجَعَلْنَا|النَّهَارَ|مَعَاشًا",
  },
  "78:12": {
    uthmani: "وَبَنَيْنَا|فَوْقَكُمْ|سَبْعًۭا|شِدَادًۭا",
    standard: "وَبَنَيْنَا|فَوْقَكُمْ|سَبْعًا|شِدَادًا",
  },
  "9:113": {
    uthmani: "مَا|كَانَ|لِلنَّبِىِّ|وَٱلَّذِينَ|ءَامَنُوٓا۟|أَن|يَسْتَغْفِرُوا۟|لِلْمُشْرِكِينَ|وَلَوْ|كَانُوٓا۟|أُو۟لِى|قُرْبَىٰ|مِنۢ|بَعْدِ|مَا|تَبَيَّنَ|لَهُمْ|أَنَّهُمْ|أَصْحَـٰبُ|ٱلْجَحِيمِ",
    standard: "مَا|كَانَ|لِلنَّبِيِّ|وَالَّذِينَ|آمَنُوا|أَن|يَسْتَغْفِرُوا|لِلْمُشْرِكِينَ|وَلَوْ|كَانُوا|أُولِي|قُرْبَىٰ|مِن|بَعْدِ|مَا|تَبَيَّنَ|لَهُمْ|أَنَّهُمْ|أَصْحَابُ|الْجَحِيمِ",
  },
  "67:20": {
    uthmani: "أَمَّنْ|هَـٰذَا|ٱلَّذِى|هُوَ|جُندٌۭ|لَّكُمْ|يَنصُرُكُم|مِّن|دُونِ|ٱلرَّحْمَـٰنِ ۚ|إِنِ|ٱلْكَـٰفِرُونَ|إِلَّا|فِى|غُرُورٍ",
    standard: "أَمَّنْ|هَٰذَا|الَّذِي|هُوَ|جُندٌ|لَّكُمْ|يَنصُرُكُم|مِّن|دُونِ|الرَّحْمَٰنِ ۚ|إِنِ|الْكَافِرُونَ|إِلَّا|فِي|غُرُورٍ",
  },
  "10:1": {
    uthmani: "الٓر ۚ|تِلْكَ|ءَايَـٰتُ|ٱلْكِتَـٰبِ|ٱلْحَكِيمِ",
    standard: "الر ۚ|تِلْكَ|آيَاتُ|الْكِتَابِ|الْحَكِيمِ",
  },
  "11:78": {
    uthmani: "وَجَآءَهُۥ|قَوْمُهُۥ|يُهْرَعُونَ|إِلَيْهِ|وَمِن|قَبْلُ|كَانُوا۟|يَعْمَلُونَ|ٱلسَّيِّـَٔاتِ ۚ|قَالَ|يَـٰقَوْمِ|هَـٰٓؤُلَآءِ|بَنَاتِى|هُنَّ|أَطْهَرُ|لَكُمْ ۖ|فَٱتَّقُوا۟|ٱللَّهَ|وَلَا|تُخْزُونِ|فِى|ضَيْفِىٓ ۖ|أَلَيْسَ|مِنكُمْ|رَجُلٌۭ|رَّشِيدٌۭ",
    standard: "وَجَاءَهُ|قَوْمُهُ|يُهْرَعُونَ|إِلَيْهِ|وَمِن|قَبْلُ|كَانُوا|يَعْمَلُونَ|السَّيِّئَاتِ ۚ|قَالَ|يَا قَوْمِ|هَٰؤُلَاءِ|بَنَاتِي|هُنَّ|أَطْهَرُ|لَكُمْ ۖ|فَاتَّقُوا|اللَّهَ|وَلَا|تُخْزُونِ|فِي|ضَيْفِي ۖ|أَلَيْسَ|مِنكُمْ|رَجُلٌ|رَّشِيدٌ",
  },
  "72:16": {
    uthmani: "وَأَلَّوِ|ٱسْتَقَـٰمُوا۟|عَلَى|ٱلطَّرِيقَةِ|لَأَسْقَيْنَـٰهُم|مَّآءً|غَدَقًۭا",
    standard: "وَأَن لَّوِ|اسْتَقَامُوا|عَلَى|الطَّرِيقَةِ|لَأَسْقَيْنَاهُم|مَّاءً|غَدَقًا",
  },
  "20:94": {
    uthmani: "قَالَ|يَبْنَؤُمَّ|لَا|تَأْخُذْ|بِلِحْيَتِى|وَلَا|بِرَأْسِىٓ ۖ|إِنِّى|خَشِيتُ|أَن|تَقُولَ|فَرَّقْتَ|بَيْنَ|بَنِىٓ|إِسْرَٰٓءِيلَ|وَلَمْ|تَرْقُبْ|قَوْلِى",
    standard: "قَالَ|يَا ابْنَ أُمَّ|لَا|تَأْخُذْ|بِلِحْيَتِي|وَلَا|بِرَأْسِي ۖ|إِنِّي|خَشِيتُ|أَن|تَقُولَ|فَرَّقْتَ|بَيْنَ|بَنِي|إِسْرَائِيلَ|وَلَمْ|تَرْقُبْ|قَوْلِي",
  },
};

function verse(key: string): Verse {
  const [sura, aya] = key.split(":").map(Number);
  const words: VerseWord[] = FIXTURE[key].uthmani.split("|").map((text, i) => ({
    position: i + 1,
    charType: "end", // recitable word in the app's inverted charType model
    text_uthmani: text,
    codeV2: "",
    lineNumber: 0,
    pageNumber: 0,
  }));
  // The ayah-end marker (charType "word" in the inverted model).
  words.push({ position: words.length + 1, charType: "word", text_uthmani: "", codeV2: "", lineNumber: 0, pageNumber: 0 });
  return { sura, aya, text: "", page: 0, suraNameAr: "", words };
}
const verses = (...keys: string[]) => keys.map(verse);
const standard = (key: string) => FIXTURE[key].standard.replace(/\|/g, " ");
const at = (sura: number, aya: number, wordIndex = 0): RecitePosition => ({ sura, aya, wordIndex });
const pos = (p: RecitePosition) => `${p.sura}:${p.aya}:${p.wordIndex}`;
const marked = (s: TrackerState) => [...s.marks.keys()].sort();

/** Feeds phrases the way Deepgram does: word-by-word partials, then a final. */
function recite(
  vs: Verse[],
  from: RecitePosition,
  phrases: string[],
  options: AlignOptions = {},
  onPartial?: (cursor: RecitePosition) => void,
): TrackerState {
  const tracker = createReciteTracker({ cursor: from, marks: new Map() }, options);
  for (const phrase of phrases) {
    const words = phrase.split(" ").filter(Boolean);
    for (let k = 1; k < words.length; k++) {
      onPartial?.(tracker.onPartial(spokenWordsFrom(words.slice(0, k).join(" ")), vs).state.cursor);
    }
    tracker.onFinal(spokenWordsFrom(phrase), vs);
  }
  return tracker.committed();
}

const BAQARAH = verses("2:2", "2:3", "2:4", "2:5", "2:6", "2:7");
const S23 = "الذين يؤمنون بالغيب ويقيمون الصلاة ومما رزقناهم ينفقون";

describe("recite aligner: what turns red", () => {
  it("reveals a clean recitation with nothing red", () => {
    const s = recite(BAQARAH, at(2, 3), [S23, standard("2:4")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:4:12");
  });

  it("marks a skipped word", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون ويقيمون الصلاة ومما رزقناهم ينفقون"]);
    expect(marked(s)).toEqual(["2:3:2"]);
    expect(s.marks.get("2:3:2")!.kind).toBe("missed");
    expect(pos(s.cursor)).toBe("2:3:8");
  });

  it("marks two skipped words without revealing the next verse", () => {
    let furthestAya = 0;
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون الصلاة ومما رزقناهم ينفقون"], {}, (c) => {
      furthestAya = Math.max(furthestAya, c.aya);
    });
    expect(marked(s)).toEqual(["2:3:2", "2:3:3"]);
    expect(furthestAya).toBe(3);
  });

  it("marks a wrong word", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون بالحق ويقيمون الصلاة ومما رزقناهم ينفقون"]);
    expect(marked(s)).toEqual(["2:3:2"]);
    expect(s.marks.get("2:3:2")!.kind).toBe("wrong");
  });

  it("marks a word skipped at a pause between phrases", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون", "ويقيمون الصلاة ومما رزقناهم ينفقون"]);
    expect(marked(s)).toEqual(["2:3:2"]);
  });

  it("marks a wrong verse ending once the next verse is recited, across a page boundary", () => {
    const s = recite(BAQARAH, at(2, 5), ["أولئك على هدى من ربهم وأولئك هم الخاسرون", standard("2:6")]);
    expect(marked(s)).toEqual(["2:5:7"]);
    expect(s.cursor.aya).toBe(6);
  });

  it("does not mark an extra word or an immediate self-correction", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون بالحق بالغيب ويقيمون الصلاة"]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:3:5");
  });

  it("clears a red word when the reciter goes back and says it", () => {
    const s = recite(BAQARAH, at(2, 3), [
      "الذين يؤمنون ويقيمون الصلاة ومما",
      "يؤمنون بالغيب ويقيمون الصلاة ومما رزقناهم ينفقون",
    ]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:3:8");
  });

  it("marks nothing when the reciter stops right after a slip", () => {
    const s = recite(BAQARAH, at(2, 3), ["الذين يؤمنون بالحق"]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:3:2");
  });

  it("ignores isti'adha, basmalah and sadaqa", () => {
    const s = recite(BAQARAH, at(2, 3), [
      "أعوذ بالله من الشيطان الرجيم بسم الله الرحمن الرحيم",
      S23,
      "صدق الله العظيم",
    ]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:3:8");
  });

  it("does not mark a word Deepgram was unsure about", () => {
    const tracker = createReciteTracker({ cursor: at(2, 3), marks: new Map() });
    const heard = ["الذين", "يؤمنون", "بالقيب", "ويقيمون", "الصلاة"].map((word) => ({
      word,
      confidence: word === "بالقيب" ? 0.3 : 0.95,
    }));
    tracker.onFinal(spokenWordsFrom("", heard), BAQARAH);
    expect(marked(tracker.committed())).toEqual([]);
    expect(pos(tracker.committed().cursor)).toBe("2:3:5");
  });
});

describe("recite aligner: phrases and partial results", () => {
  it("follows Deepgram revising a partial result, and partials never commit", () => {
    const tracker = createReciteTracker({ cursor: at(2, 3), marks: new Map() });
    expect(pos(tracker.onPartial(spokenWordsFrom("الذين يؤمنون بالغيب ويقيمون"), BAQARAH).state.cursor)).toBe("2:3:4");
    expect(pos(tracker.onPartial(spokenWordsFrom("الذين يؤمنون بالغيب ويقيم"), BAQARAH).state.cursor)).toBe("2:3:3");
    expect(pos(tracker.committed().cursor)).toBe("2:3:0");
  });

  it("commits on a final and keeps marks across a reset to a new cursor", () => {
    const tracker = createReciteTracker({ cursor: at(2, 3), marks: new Map() });
    tracker.onFinal(spokenWordsFrom("الذين يؤمنون ويقيمون الصلاة"), BAQARAH);
    const { marks } = tracker.committed();
    expect([...marks.keys()]).toEqual(["2:3:2"]);
    tracker.reset({ cursor: at(2, 3, 6), marks });
    tracker.onFinal(spokenWordsFrom("رزقناهم ينفقون"), BAQARAH);
    expect(pos(tracker.committed().cursor)).toBe("2:3:8");
    expect(marked(tracker.committed())).toEqual(["2:3:2"]);
  });

  it("leaves the state unchanged for an empty phrase", () => {
    const state: TrackerState = { cursor: at(2, 3, 2), marks: new Map() };
    const result = alignPhrase(state, spokenWordsFrom("  "), BAQARAH);
    expect(result.state).toBe(state);
    expect(result.newSaid).toBe(0);
  });

  it("does not stall on verses that share an opening word (78:9–11)", () => {
    const naba = verses("78:8", "78:9", "78:10", "78:11", "78:12");
    const s = recite(naba, at(78, 9), [standard("78:9"), standard("78:10"), standard("78:11")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("78:11:3");
  });
});

describe("recite aligner: spelling and tajweed joins", () => {
  it("accepts muqatta'at spelled out as letter names", () => {
    const s = recite(verses("2:1", "2:2", "2:3"), at(2, 1), ["الف لام ميم ذلك الكتاب لا ريب فيه هدى للمتقين"]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:2:7");
  });

  it("does not let a muqatta'at word swallow the rest of its verse", () => {
    const s = recite(verses("10:1"), at(10, 1), [standard("10:1")]);
    expect(pos(s.cursor)).toBe("10:1:5");
  });

  it("does not mark a vocative يا heard at the end of the previous phrase (11:78)", () => {
    const words = standard("11:78").split(" ");
    const cut = words.indexOf("يَا") + 1;
    const s = recite(verses("11:78"), at(11, 78), [words.slice(0, cut).join(" "), words.slice(cut).join(" ")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("11:78:26");
  });

  it("does not let a skipped short word vanish into its neighbour (9:113)", () => {
    const words = standard("9:113").split(" ");
    words.splice(5, 1); // skip أَن
    const s = recite(verses("9:113"), at(9, 113), [words.join(" ")]);
    expect(marked(s)).toEqual(["9:113:5"]);
  });

  it("prefers two separate words over joining them (67:20)", () => {
    const words = standard("67:20").split(" ");
    const cut = words.indexOf("إِنِ") + 1;
    const s = recite(verses("67:20"), at(67, 20), [words.slice(0, cut).join(" "), words.slice(cut).join(" ")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("67:20:15");
  });

  it("matches two spoken words joined by idgham to one Uthmani word (72:16)", () => {
    const s = recite(verses("72:16"), at(72, 16), [standard("72:16")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("72:16:7");
  });

  it("never marks a known irregular spelling (20:94)", () => {
    const s = recite(verses("20:94"), at(20, 94), [standard("20:94")]);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("20:94:18");
  });

  it("leaves every fixture verse clean when recited in standard spelling", () => {
    for (const key of Object.keys(FIXTURE)) {
      if (key === "2:1") continue; // a lone muqatta'at verse waits for the next word
      const v = verse(key);
      const words = standard(key).split(" ");
      const phrases: string[] = [];
      for (let k = 0; k < words.length; k += 12) phrases.push(words.slice(k, k + 12).join(" "));
      const s = recite([v], at(v.sura, v.aya), phrases);
      expect({ key, marks: marked(s) }).toEqual({ key, marks: [] });
      expect({ key, cursor: pos(s.cursor) }).toEqual({ key, cursor: `${key}:${v.words!.length - 1}` });
    }
  });
});

describe("recite aligner: quiz options", () => {
  const ayatAlKursi = verses("2:255");
  const hiddenStart = at(2, 255, 6);
  const quiz: AlignOptions = { freeStartUntil: hiddenStart, protectBefore: hiddenStart };
  // Standard words with the separate pause-mark tokens dropped, so index k
  // is verse word k.
  const words = standard("2:255")
    .split(" ")
    .filter((w) => !["ۚ", "ۗ", "ۖ"].includes(w));

  it("lets the reciter start at the hidden part", () => {
    const s = recite(ayatAlKursi, at(2, 255), [words.slice(6, 14).join(" ")], quiz);
    expect(marked(s)).toEqual([]);
    expect(pos(s.cursor)).toBe("2:255:14");
  });

  it("never marks a skipped word of the shown snippet", () => {
    const s = recite(ayatAlKursi, at(2, 255), [[...words.slice(0, 2), ...words.slice(3, 10)].join(" ")], quiz);
    expect(marked(s)).toEqual([]);
  });

  it("marks a skipped word of the hidden part", () => {
    const s = recite(ayatAlKursi, at(2, 255), [[...words.slice(6, 8), ...words.slice(9, 14)].join(" ")], quiz);
    expect(marked(s)).toEqual(["2:255:8"]);
  });
});

describe("recite aligner: helpers", () => {
  it("markSkipped marks every recitable word in [from, to) as missed", () => {
    const marks = markSkipped(new Map(), BAQARAH, at(2, 3, 6), at(2, 4, 1));
    expect([...marks.keys()].sort()).toEqual(["2:3:6", "2:3:7", "2:4:0"]);
    expect([...marks.values()].every((m) => m.kind === "missed")).toBe(true);
  });

  it("markPositionKeys converts to the page's word positions", () => {
    const marks = markSkipped(new Map(), BAQARAH, at(2, 3, 2), at(2, 3, 3));
    expect([...markPositionKeys(marks)]).toEqual(["2:3:3"]); // word index 2 is position 3
  });

  it("spokenWordsFrom prefers Deepgram's word list and drops empty tokens", () => {
    expect(
      spokenWordsFrom("الحمد لله", [
        { word: "الحمد", confidence: 0.9 },
        { word: "لله", confidence: 0.8 },
      ]),
    ).toEqual([
      { text: "الحمد", confidence: 0.9 },
      { text: "لله", confidence: 0.8 },
    ]);
    expect(spokenWordsFrom("الحمد ، لله")).toEqual([{ text: "الحمد" }, { text: "لله" }]);
  });
});
