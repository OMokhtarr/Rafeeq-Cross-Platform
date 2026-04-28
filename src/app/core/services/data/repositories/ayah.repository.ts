/**
 * AYAH REPOSITORY
 *
 * Owns:
 *   - The static surah-name table (Arabic + English helper).
 *   - The in-memory LRU cache of pages already fetched from the API.
 *
 * Page fetching itself lives in quran.service.ts (which calls the Foundation
 * Content API and writes through to IDB). This file is intentionally small.
 */

import type { Verse } from "../../../../shared/models/verse.model";

// pageData (the static page→[sura,aya] boundary table) is still used by
// PageViewer, SurahJuzSelection, VerseContextViewer, and the mutashabihat
// service for navigation logic that doesn't need verse text. Re-exported
// here so existing import paths keep working.
export { pageData } from "../../../../../data/quranData";

// ─── Surah names ──────────────────────────────────────────────────────────────

export const surahNamesArabic: string[] = [
  "", // Index 0 empty
  "الفاتحة",
  "البقرة",
  "آل عمران",
  "النساء",
  "المائدة",
  "الأنعام",
  "الأعراف",
  "الأنفال",
  "التوبة",
  "يونس",
  "هود",
  "يوسف",
  "الرعد",
  "إبراهيم",
  "الحجر",
  "النحل",
  "الإسراء",
  "الكهف",
  "مريم",
  "طه",
  "الأنبياء",
  "الحج",
  "المؤمنون",
  "النور",
  "الفرقان",
  "الشعراء",
  "النمل",
  "القصص",
  "العنكبوت",
  "الروم",
  "لقمان",
  "السجدة",
  "الأحزاب",
  "سبأ",
  "فاطر",
  "يس",
  "الصافات",
  "ص",
  "الزمر",
  "غافر",
  "فصلت",
  "الشورى",
  "الزخرف",
  "الدخان",
  "الجاثية",
  "الأحقاف",
  "محمد",
  "الفتح",
  "الحجرات",
  "ق",
  "الذاريات",
  "الطور",
  "النجم",
  "القمر",
  "الرحمن",
  "الواقعة",
  "الحديد",
  "المجادلة",
  "الحشر",
  "الممتحنة",
  "الصف",
  "الجمعة",
  "المنافقون",
  "التغابن",
  "الطلاق",
  "التحريم",
  "الملك",
  "القلم",
  "الحاقة",
  "المعارج",
  "نوح",
  "الجن",
  "المزمل",
  "المدثر",
  "القيامة",
  "الإنسان",
  "المرسلات",
  "النبأ",
  "النازعات",
  "عبس",
  "التكوير",
  "الإنفطار",
  "المطففين",
  "الإنشقاق",
  "البروج",
  "الطارق",
  "الأعلى",
  "الغاشية",
  "الفجر",
  "البلد",
  "الشمس",
  "الليل",
  "الضحى",
  "الشرح",
  "التين",
  "العلق",
  "القدر",
  "البينة",
  "الزلزلة",
  "العاديات",
  "القارعة",
  "التكاثر",
  "العصر",
  "الهمزة",
  "الفيل",
  "قريش",
  "الماعون",
  "الكوثر",
  "الكافرون",
  "النصر",
  "المسد",
  "الإخلاص",
  "الفلق",
  "الناس",
];

const surahNamesEnglish: Record<number, string> = {};

export function getSurahName(
  suraIndex: number,
  language: "arabic" | "english" = "arabic",
): string {
  if (language === "arabic") {
    return surahNamesArabic[suraIndex] ?? `سورة ${suraIndex}`;
  }
  return surahNamesEnglish[suraIndex] ?? `Surah ${suraIndex}`;
}

/** Optional: feed an English name in once it's known (e.g. from an API call). */
export function setSurahName(
  suraIndex: number,
  language: "english",
  name: string,
): void {
  if (language === "english") surahNamesEnglish[suraIndex] = name;
}

// ─── In-memory page LRU ───────────────────────────────────────────────────────

const MAX_PAGES = 20;
const pageCache = new Map<number, Verse[]>();

export function getCachedPage(page: number): Verse[] | null {
  const hit = pageCache.get(page);
  if (!hit) return null;
  // Refresh recency: delete + re-insert so the entry moves to the end.
  pageCache.delete(page);
  pageCache.set(page, hit);
  return hit;
}

export function setCachedPage(page: number, verses: Verse[]): void {
  if (pageCache.has(page)) pageCache.delete(page);
  pageCache.set(page, verses);
  if (pageCache.size > MAX_PAGES) {
    const firstKey = pageCache.keys().next().value as number | undefined;
    if (firstKey !== undefined) pageCache.delete(firstKey);
  }
}
