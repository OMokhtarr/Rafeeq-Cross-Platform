import {
  compareWord,
  isUnrecitable,
  joinedSpellings,
  plainLetters,
  spokenLetters,
  uthmaniSkeleton,
} from "../recite-spelling.service";

const verdict = (uthmani: string, spoken: string, next?: string, confidence?: number) =>
  compareWord(uthmaniSkeleton(uthmani, next), spoken, confidence);

describe("Uthmani spelling vs the recognizer's standard spelling", () => {
  it.each([
    ["ٱلْكِتَـٰبُ", "الكتاب"], // dagger alif (after tatweel) may be written ا
    ["ٱلْكِتَـٰبُ", "الكتب"], // …or left out
    ["ٱلْعَـٰلَمِينَ", "العالمين"],
    ["رَزَقْنَـٰهُمْ", "رزقناهم"],
    ["ٱلصَّلَوٰةَ", "الصلاة"], // و + dagger alif is written ا
    ["هَدَىٰكُمْ", "هداكم"], // ى + dagger alif mid-word is written ا
    ["عَلَىٰ", "على"], // …but a word-final ىٰ stays ى
    ["أُو۟لَـٰٓئِكَ", "أولئك"], // silent-letter mark
    ["مِا۟ئَةَ", "مائة"],
    ["مِا۟ئَةَ", "مئة"],
    ["حَوْلَهُۥ", "حوله"], // small waw
    ["بِهِۦ", "به"], // small yeh
    ["دَاوُۥدُ", "داوود"],
    ["يُحْىِۦ", "يحيي"],
    ["يُحْىِ", "يحيي"], // ى carrying a kasra stands for يي
    ["ٱلنَّبِيِّـۧنَ", "النبيين"], // small high yeh
    ["إِبْرَٰهِـۧمَ", "إبراهيم"],
    ["نُـۨجِى", "ننجي"], // small high noon (21:88)
    ["وَبِٱلْـَٔاخِرَةِ", "وبالآخرة"], // hamza on a tatweel
    ["يَسْـَٔلُونَكَ", "يسألونك"],
    ["ٱلَّيْلِ", "الليل"], // article ل merged with a root ل
    ["ٱلَّذِينَ", "الذين"],
    ["وَبَآءُو", "وباءوا"], // plural و without its alif
    ["ءَامَنُوا۟", "آمنوا"], // ءَا is written آ
    ["وَسْـَٔلُوا۟", "واسألوا"], // connecting alif after و
    ["رَءَا", "رأى"], // final alif written ى
    ["لْـَٔيْكَةِ", "الأيكة"],
    ["يَـٰٓأَيُّهَا", "ياأيها"],
  ])("%s ↔ %s is said", (uthmani, spoken) => {
    expect(verdict(uthmani, spoken)).toBe("said");
  });

  it.each([
    ["يَعْلَمُونَ", "تعلمون"],
    ["رَبُّكَ", "ربكم"],
    ["عَلَيْهِمْ", "عليكم"],
    ["فِيهِ", "فيها"],
    ["قَالَ", "قل"],
    ["عَلِيمٌ", "عظيم"],
    ["وَيُقِيمُونَ", "يقيمون"], // a dropped leading و
    ["ٱلْمُفْلِحُونَ", "الخاسرون"],
  ])("%s vs %s is a real slip", (uthmani, spoken) => {
    expect(verdict(uthmani, spoken)).toBe("wrong");
  });

  it.each([
    ["ٱلصِّرَٰطَ", "السراط"], // ص/س
    ["وَيَبْصُۜطُ", "ويبسط"],
    ["ضَلَّ", "دل"], // ض/د
    ["ٱلْحَمْدُ", "الهمد"], // ح/ه
    ["يَـٰٓأَيُّهَا", "أيها"], // vocative يا heard in the previous phrase
  ])("%s vs %s is sound-alike", (uthmani, spoken) => {
    expect(verdict(uthmani, spoken)).toBe("soundAlike");
  });

  it("forgives a word-final ن assimilated into the next word", () => {
    expect(verdict("مِن", "مر", "رَّبِّهِمْ")).toBe("soundAlike");
    expect(verdict("مِن", "م", "رَّبِّهِمْ")).toBe("soundAlike");
    expect(verdict("مِن", "مر")).toBe("wrong");
  });

  it("gives one real letter change the benefit of the doubt only when Deepgram was unsure", () => {
    expect(verdict("يَعْلَمُونَ", "تعلمون", undefined, 0.4)).toBe("soundAlike");
    expect(verdict("يَعْلَمُونَ", "تعلمون", undefined, 0.9)).toBe("wrong");
    expect(verdict("يَعْلَمُونَ", "تعلمو", undefined, 0.4)).toBe("wrong");
  });

  it("treats ayah markers and bare marks as unrecitable", () => {
    expect(isUnrecitable(uthmaniSkeleton("٢٥٥"))).toBe(true);
    expect(isUnrecitable(uthmaniSkeleton("ۖ"))).toBe(true);
    expect(isUnrecitable(uthmaniSkeleton("ٱللَّهُ"))).toBe(false);
  });

  it("joins two spoken words, also with an assimilated ن", () => {
    expect(joinedSpellings("أن", "لا")).toEqual(["انلا", "الا"]);
    expect(joinedSpellings("يا", "أيها")).toEqual(["ياايها"]);
  });

  it("reduces text to comparison letters", () => {
    expect(spokenLetters("الآخرة، مَالِكِ")).toBe("الاخرهمالك");
    expect(plainLetters(uthmaniSkeleton("يَبْنَؤُمَّ"))).toBe("يبنءم");
  });
});
