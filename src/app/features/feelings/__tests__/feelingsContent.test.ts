import { readFileSync } from "fs";
import { join } from "path";
import azkarData from "../../../../data/azkarData";
import { FEELINGS } from "../../../../data/feelingsData";
import { FEELING_VERSES } from "../../../../data/feelingsVerses.generated";
import { estimatePageForVerse } from "../../../core/services/data/metadata.service";
import {
  parseVerseRef,
  expandVerseRef,
  getFeeling,
  resolveDuas,
  resolveVerses,
} from "../feelingsContent";

const IDS = [
  "sad",
  "anxious",
  "afraid",
  "angry",
  "confused",
  "weak-faith",
  "sick",
  "impatient",
  "happy",
  "content",
  "love",
  "lazy",
];

test("exactly the 12 feelings, in order, url-safe", () => {
  expect(FEELINGS.map((f) => f.id)).toEqual(IDS);
  FEELINGS.forEach((f) => expect(f.id).toMatch(/^[a-z]+(-[a-z]+)*$/));
});

test("every feeling has at least one verse and one dua", () => {
  FEELINGS.forEach((f) => {
    expect(f.verses.length).toBeGreaterThanOrEqual(1);
    expect(f.duas.length).toBeGreaterThanOrEqual(1);
  });
});

test("parseVerseRef reads single and range refs", () => {
  expect(parseVerseRef("13:28")).toEqual({ surah: 13, from: 28, to: 28 });
  expect(parseVerseRef("94:5-6")).toEqual({ surah: 94, from: 5, to: 6 });
});

test("parseVerseRef rejects malformed refs", () => {
  ["94:5-", "2:300", "3:10-5", "115:1", "0:1", "13", ""].forEach((r) =>
    expect(() => parseVerseRef(r)).toThrow(`Bad verse ref: ${r}`)
  );
});

test("expandVerseRef lists each ayah key", () => {
  expect(expandVerseRef("89:27-30")).toEqual(["89:27", "89:28", "89:29", "89:30"]);
});

test("every verse ref in the data parses", () => {
  FEELINGS.flatMap((f) => f.verses).forEach((r) =>
    expect(() => parseVerseRef(r)).not.toThrow()
  );
});

test("every reused dua exists in azkarData", () => {
  FEELINGS.forEach((f) => expect(() => resolveDuas(f)).not.toThrow());
});

test("every dua resolves with non-empty text and source", () => {
  FEELINGS.flatMap(resolveDuas).forEach((d) => {
    expect(d.text.trim()).not.toBe("");
    expect(d.source.trim()).not.toBe("");
  });
});

test("no feeling lists the same dua twice", () => {
  FEELINGS.forEach((f) => {
    const texts = resolveDuas(f).map((d) => d.text);
    expect(new Set(texts).size).toBe(texts.length);
  });
});

test("resolveDuas carries the book's source and note", () => {
  const love = resolveDuas(getFeeling("love")!);
  const so2 = azkarData
    .find((c) => c.id === "social")!
    .azkar.find((z) => z.id === "so-2")!;
  expect(love[1]).toEqual({ text: so2.text, source: so2.source, note: so2.note });
});

test("resolveDuas throws on a missing zikr", () => {
  expect(() =>
    resolveDuas({
      ...FEELINGS[0],
      duas: [{ categoryId: "distress", zikrId: "nope" }],
    })
  ).toThrow("Missing zikr distress/nope");
});

test("getFeeling returns undefined for unknown id", () => {
  expect(getFeeling("nope")).toBeUndefined();
});

test("every verse ref has generated text", () => {
  FEELINGS.flatMap((f) => f.verses)
    .flatMap(expandVerseRef)
    .forEach((k) => expect(FEELING_VERSES[k]?.text).toBeTruthy());
});

test("every verse card opens the app's own mushaf page for its first ayah", () => {
  FEELINGS.flatMap(resolveVerses).forEach((v) =>
    expect(v.page).toBe(estimatePageForVerse(v.surah, v.from))
  );
});

test("94:5-6 opens page 597, where the app's layout puts it", () => {
  const v = resolveVerses(getFeeling("sad")!).find((x) => x.ref === "94:5-6")!;
  expect(v.page).toBe(597);
});

test("range joins ayat in order with Arabic-Indic numbers", () => {
  const v = resolveVerses(getFeeling("sad")!).find((x) => x.ref === "94:5-6")!;
  expect(v.text).toBe(
    `${FEELING_VERSES["94:5"].text} (٥) ${FEELING_VERSES["94:6"].text} (٦)`
  );
  expect(v.surahName).toBe("الشرح");
});

test("range uses first ayah's key and page", () => {
  const v = resolveVerses(getFeeling("content")!).find((x) => x.ref === "89:27-30")!;
  expect(v.firstKey).toBe("89:27");
  expect(v.page).toBe(estimatePageForVerse(89, 27));
});

test("verse text keeps the Tanzil copyright notice its licence requires", () => {
  const generated = readFileSync(
    join(__dirname, "../../../../data/feelingsVerses.generated.ts"),
    "utf8"
  );
  expect(generated).toContain("Tanzil Quran Text (Uthmani");
  expect(generated).toContain("CHANGING IT IS NOT ALLOWED");
  expect(generated).not.toContain("api.quran.com");
});
