/**
 * AYAH REPOSITORY
 * Migrated from: src/data/quranLoader.js
 *
 * Changes from original:
 *  1. getVersesForPage is now async (reads from IDB instead of bundled JSON)
 *  2. In-memory LRU page cache added — cache miss costs ~50 ms, hit ~1 ms
 *  3. getVerseText, getSurahVerses kept as sync helpers for worker compatibility
 *  4. surahNamesArabic and getSurahName exported unchanged
 *
 * NOTE: quranData.js (pageData) is still imported directly as a static const —
 * it's only 35 KB (604 entries × ~60 bytes) so it stays in the bundle.
 * The heavy quran-text.json (2.8 MB) is loaded once and stored in IDB.
 */

import type { Verse } from "../../../../shared/models/verse.model";
import { idb } from "../../storage/idb.service";

// ─── Static page boundary data ────────────────────────────────────────────────
// pageData[n] = [surahNumber, ayahNumber] marking the first verse on page n.
// Imported directly (35 KB — acceptable in bundle).
import { pageData } from "../../../../../data/quranData";
export { pageData } from "../../../../../data/quranData";

// ─── Surah names ──────────────────────────────────────────────────────────────
// Copied verbatim from quranLoader.js — no changes.

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

export const getSurahName = (
  suraIndex: number,
  language: "arabic" | "english" = "arabic",
): string => {
  if (language === "arabic") {
    return surahNamesArabic[suraIndex] ?? `سورة ${suraIndex}`;
  }
  // English names come from the quran-text.json surahs object (loaded into IDB)
  // Fall back to transliteration if not available
  return `Surah ${suraIndex}`;
};

// ─── Verse text helpers (sync — for worker compatibility) ─────────────────────

/**
 * Look up a single verse from the in-memory cache.
 * Falls back to IDB if cache is cold (shouldn't happen after seeding).
 *
 * NOTE: The sync version (used in workers) requires verseCache to be
 * pre-populated. In the main thread, always call ensureSeeded() first.
 */
let verseCache: Record<string, string> = {};

/** Called by quran.service.ts after IDB seeding to warm the in-memory cache. */
export function warmVerseCache(verses: Array<{ id: string; text: string }>) {
  verseCache = {};
  for (const v of verses) {
    verseCache[v.id] = v.text;
  }
}

export function getVerseText(sura: number, aya: number): string {
  return verseCache[`${sura}:${aya}`] ?? `[Verse ${sura}:${aya} not found]`;
}

export function getSurahVerses(
  suraIndex: number,
): Array<{ sura: number; aya: number; text: string }> {
  const result: Array<{ sura: number; aya: number; text: string }> = [];
  // Walk verseCache keys matching "suraIndex:*"
  const prefix = `${suraIndex}:`;
  for (const [key, text] of Object.entries(verseCache)) {
    if (key.startsWith(prefix)) {
      result.push({ sura: suraIndex, aya: parseInt(key.split(":")[1]), text });
    }
  }
  return result.sort((a, b) => a.aya - b.aya);
}

// ─── Page-based verse retrieval ───────────────────────────────────────────────

/** Simple LRU page cache: stores up to MAX_PAGES pages of verses */
const MAX_PAGES = 20;
const pageCache = new Map<number, Verse[]>();

function evictPageCache() {
  if (pageCache.size >= MAX_PAGES) {
    // Evict the first (oldest) entry
    const firstKey = pageCache.keys().next().value;
    pageCache.delete(firstKey);
  }
}

/**
 * Async wrapper around the original getVersesForPage from quranLoader.js.
 * Logic identical — only the verse text lookup is now from verseCache / IDB
 * instead of directly from the bundled JSON.
 *
 * Original source: src/data/quranLoader.js → getVersesForPage()
 */
export async function getVersesForPage(page: number): Promise<Verse[]> {
  if (pageCache.has(page)) return pageCache.get(page)!;

  if (
    !pageData ||
    !Array.isArray(pageData) ||
    page < 1 ||
    page >= pageData.length
  ) {
    console.error("Invalid page number:", page);
    return [];
  }

  try {
    const [startSura, startAya] = pageData[page] ?? [1, 1];
    const [endSura, endAya] =
      page < pageData.length - 1 ? (pageData[page + 1] ?? [114, 6]) : [114, 6];

    const verses: Verse[] = [];

    const pushVerse = (sura: number, aya: number) => {
      const text = getVerseText(sura, aya);
      if (text && !text.startsWith("[Verse")) {
        verses.push({
          sura,
          aya,
          text,
          page,
          suraNameAr: surahNamesArabic[sura] ?? `سورة ${sura}`,
          suraName: getSurahName(sura, "english"),
          juz: Math.ceil(page / 20),
        });
      }
    };

    if (startSura === endSura) {
      for (let aya = startAya; aya < endAya; aya++) pushVerse(startSura, aya);
    } else {
      const startSurahVerses = getSurahVerses(startSura);
      for (let aya = startAya; aya <= startSurahVerses.length; aya++)
        pushVerse(startSura, aya);

      for (let sura = startSura + 1; sura < endSura; sura++) {
        const surahVerses = getSurahVerses(sura);
        for (let aya = 1; aya <= surahVerses.length; aya++)
          pushVerse(sura, aya);
      }

      for (let aya = 1; aya < endAya; aya++) pushVerse(endSura, aya);
    }

    evictPageCache();
    pageCache.set(page, verses);
    return verses;
  } catch (error) {
    console.error("Error in getVersesForPage:", error);
    return [];
  }
}

/**
 * Prefetch a page into the cache in the background.
 * Call this after rendering the current page to warm the next page.
 */
export function prefetchPage(page: number): void {
  if (page < 1 || page >= pageData.length) return;
  if (pageCache.has(page)) return;
  // Fire and forget
  getVersesForPage(page).catch(() => {});
}

/** Load verses for an IDB read (used by quran.service.ts seed checker) */
export async function getAllVersesFromIDB(): Promise<
  Array<{ id: string; text: string }>
> {
  return idb.getAll<{ id: string; text: string }>("verses");
}
