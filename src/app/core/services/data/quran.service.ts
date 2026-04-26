/**
 * QURAN SERVICE
 * Main data facade. Handles:
 *  1. First-launch seeding of quran-text.json → IndexedDB
 *  2. Warming the in-memory verse cache (verseCache in ayah.repository.ts)
 *  3. Delegating page/verse lookups to the repository
 *
 * Replaces: direct `import quranText from './quran-text.json'` in quranLoader.js
 *
 * The key change: quran-text.json is NO LONGER in the webpack bundle.
 * It is fetched once, stored in IDB, and loaded from there on every subsequent launch.
 * This cuts the initial JS bundle from ~4.5 MB to ~500 KB.
 */

import { idb } from "../storage/idb.service";
import {
  warmVerseCache,
  getVersesForPage,
  prefetchPage,
  surahNamesArabic,
  getSurahName,
} from "./repositories/ayah.repository";
import type { Verse } from "../../../shared/models/verse.model";

// Re-export helpers so feature components only need to import from this service
export { surahNamesArabic, getSurahName, prefetchPage };

// ─── Seeding ──────────────────────────────────────────────────────────────────

let _seeded = false;
let _seedPromise: Promise<void> | null = null;

/**
 * Ensure quran-text.json has been loaded and stored in IndexedDB.
 * Safe to call multiple times — runs exactly once per browser session
 * (and only once ever after the first run thanks to the 'seeded' meta key).
 *
 * Typical timing:
 *   First launch: 600–1400 ms (fetch 2.8 MB + IDB bulk insert)
 *   Subsequent:   5–15 ms (IDB meta check only)
 */
export async function ensureSeeded(): Promise<void> {
  if (_seeded) return;
  if (_seedPromise) return _seedPromise;

  _seedPromise = _seed();
  await _seedPromise;
}

async function _seed(): Promise<void> {
  await idb.open();

  // Check if already seeded from a previous session
  const meta = await idb.get<{ key: string; value: string }>("meta", "seeded");
  if (meta?.value === "1") {
    // Already seeded — just warm the in-memory cache
    const storedVerses = await idb.getAll<{ id: string; text: string }>(
      "verses",
    );
    warmVerseCache(storedVerses);
    _seeded = true;
    return;
  }

  // First launch: dynamic import so quran-text.json is a separate chunk
  // (webpack / Vite will NOT include it in the main bundle)
  const quranText = await import(
    /* webpackChunkName: "quran-data" */
    "./quran-text.json"
  );

  // Transform to flat { id, text } records for IDB storage
  const verses = Object.entries(quranText.verses as Record<string, string>).map(
    ([id, text]) => ({ id, text }),
  );

  await idb.bulkPut("verses", verses);
  await idb.put("meta", { key: "seeded", value: "1" });

  warmVerseCache(verses);
  _seeded = true;
  console.log(`[QuranService] Seeded ${verses.length} verses into IDB.`);
}

// ─── Public API (same shape as old quranLoader.js functions) ──────────────────

/**
 * Get all verses for a Mushaf page.
 * Drop-in replacement for getVersesForPage(page, pageData) from quranLoader.js.
 * Now async — await it or call from within a useEffect / async function.
 */
export async function getPage(page: number): Promise<Verse[]> {
  await ensureSeeded();
  return getVersesForPage(page);
}

/**
 * Get all verses for a surah.
 * Used by QuizTest.js when quizConfig.type === "surah".
 */
export async function getSurahVersesList(suraIndex: number): Promise<Verse[]> {
  await ensureSeeded();
  const results: Verse[] = [];
  // Walk all 604 pages — surah verses are contiguous
  for (let page = 1; page <= 604; page++) {
    const pageVerses = await getVersesForPage(page);
    for (const v of pageVerses) {
      if (v.sura === suraIndex) results.push(v);
    }
    // Early exit once we've passed the surah
    if (results.length > 0 && pageVerses.some((v) => v.sura > suraIndex)) break;
  }
  return results;
}

/**
 * Get verses across a juz range.
 * Used by QuizTest.js when quizConfig.type === "juz".
 * Each juz ≈ 20 pages (juz 1 = pages 1–20, juz 2 = pages 21–40, etc.)
 */
export async function getJuzVerses(juzNumbers: number[]): Promise<Verse[]> {
  await ensureSeeded();
  const juzSet = new Set(juzNumbers);
  const results: Verse[] = [];
  for (let page = 1; page <= 604; page++) {
    const juz = Math.ceil(page / 20);
    if (juzSet.has(juz)) {
      const verses = await getVersesForPage(page);
      results.push(...verses);
    }
  }
  return results;
}

/**
 * Get verses across a page range.
 * Used by QuizTest.js when quizConfig.type === "page".
 */
export async function getPageRangeVerses(
  pageFrom: number,
  pageTo: number,
): Promise<Verse[]> {
  await ensureSeeded();
  const results: Verse[] = [];
  for (let page = pageFrom; page <= pageTo; page++) {
    const verses = await getVersesForPage(page);
    results.push(...verses);
  }
  return results;
}
