/**
 * FEELINGS CONTENT
 * Pure resolvers that turn a Feeling's refs into display-ready verses and
 * duas. Throws on bad data rather than rendering a blank card — the data
 * tests run every feeling through here, so a typo fails CI instead of
 * reaching a user.
 */

import azkarData from "../../../data/azkarData";
import { FEELINGS, Feeling } from "../../../data/feelingsData";
import { FEELING_VERSES } from "../../../data/feelingsVerses.generated";
import { getSurahNameArabic } from "../../core/services/data/metadata.service";

export interface VerseRef {
  surah: number;
  from: number;
  to: number;
}

export interface ResolvedVerse {
  ref: string;
  surah: number;
  surahName: string;
  from: number;
  to: number;
  /** Each ayah's text followed by its number in Arabic-Indic digits. */
  text: string;
  /** Mushaf page of the first ayah — where the viewer deep link lands. */
  page: number;
  firstKey: string;
}

export interface ResolvedDua {
  text: string;
  source: string;
  note?: string;
}

// Ayah count per surah (Madani mushaf) — same table as scripts/build-quran-corpus.mjs.
const AYAH_COUNTS: readonly number[] = [
  0,
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109,
  123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60,
  34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45,
  60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44,
  28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20,
  15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3,
  5, 4, 5, 6,
];

export function parseVerseRef(ref: string): VerseRef {
  const m = /^(\d+):(\d+)(?:-(\d+))?$/.exec(ref);
  if (m) {
    const surah = Number(m[1]);
    const from = Number(m[2]);
    const to = m[3] ? Number(m[3]) : from;
    if (
      surah >= 1 &&
      surah <= 114 &&
      from >= 1 &&
      from <= to &&
      to <= AYAH_COUNTS[surah]
    ) {
      return { surah, from, to };
    }
  }
  throw new Error(`Bad verse ref: ${ref}`);
}

export function expandVerseRef(ref: string): string[] {
  const { surah, from, to } = parseVerseRef(ref);
  const keys: string[] = [];
  for (let ayah = from; ayah <= to; ayah++) keys.push(`${surah}:${ayah}`);
  return keys;
}

export function arabicIndic(n: number): string {
  return String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
}

export function resolveVerses(feeling: Feeling): ResolvedVerse[] {
  return feeling.verses.map((ref) => {
    const { surah, from, to } = parseVerseRef(ref);
    const ayat = expandVerseRef(ref).map((key) => {
      const verse = FEELING_VERSES[key];
      if (!verse) {
        throw new Error(`Missing verse ${key} — re-run scripts/generate-feeling-verses.mjs`);
      }
      return verse;
    });
    return {
      ref,
      surah,
      surahName: getSurahNameArabic(surah),
      from,
      to,
      text: ayat.map((v, i) => `${v.text} (${arabicIndic(from + i)})`).join(" "),
      page: ayat[0].page,
      firstKey: `${surah}:${from}`,
    };
  });
}

export function getFeeling(id: string): Feeling | undefined {
  return FEELINGS.find((f) => f.id === id);
}

export function resolveDuas(feeling: Feeling): ResolvedDua[] {
  return feeling.duas.map((dua) => {
    if ("text" in dua) return dua;
    const zikr = azkarData
      .find((c) => c.id === dua.categoryId)
      ?.azkar.find((z) => z.id === dua.zikrId);
    if (!zikr) throw new Error(`Missing zikr ${dua.categoryId}/${dua.zikrId}`);
    const resolved: ResolvedDua = { text: zikr.text, source: zikr.source };
    if (zikr.note) resolved.note = zikr.note;
    return resolved;
  });
}
