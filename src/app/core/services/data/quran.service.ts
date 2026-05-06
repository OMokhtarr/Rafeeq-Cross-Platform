import {
  fetchVersesByPage,
  fetchVersesByJuz,
  fetchAudioForAyah as providerAudioForAyah,
} from "../api/quran-data-provider";
import { idb } from "../storage/idb.service";
import type { Verse, VerseWord } from "../../../shared/models/verse.model";
import {
  getSurahNameArabic,
  getSurahNameEnglish,
  estimatePageForVerse,
} from "./metadata.service";
import { MUSHAFS, DEFAULT_MUSHAF } from "../api/mushaf.config";
import { removeDiacritics } from "../../utils/arabic.util";

/**
 * Aggressive normalization for substring search — strips tashkeel AND
 * folds the common Arabic letter variants so searches match across
 * keyboard quirks:
 *   أ إ آ ٱ → ا   (alef variants)
 *   ى → ي         (alef maksura → yaa)
 *   ة → ه         (taa marbuta → haa)
 *   ؤ ئ → و ي    (hamza on waw / yaa)
 * Also strips the small superscript alef (already handled by
 * removeDiacritics) and the mini-noon / mini-sad markers, then
 * collapses whitespace.
 */
function normalizeForSearch(s: string): string {
  return removeDiacritics(s)
    .replace(/[آأإٱ]/g, "ا") // آ أ إ ٱ → ا
    .replace(/ى/g, "ي") // ى → ي
    .replace(/ة/g, "ه") // ة → ه
    .replace(/ؤ/g, "و") // ؤ → و
    .replace(/ئ/g, "ي") // ئ → ي
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Constants ───────────────────────────────────────────────────────────────
const TOTAL_PAGES = 604;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function mapApiVerseToVerse(av: any): Verse {
  return {
    sura: av.chapter_id ?? av.sura ?? parseInt(av.verse_key?.split(":")[0], 10),
    aya: av.verse_number ?? av.aya ?? parseInt(av.verse_key?.split(":")[1], 10),
    text: av.text_uthmani ?? av.text ?? "",
    page: av.page_number ?? av.page,
    juz: av.juz_number ?? av.juz,
    suraNameAr: getSurahNameArabic(av.chapter_id ?? av.sura),
    suraName: getSurahNameEnglish(av.chapter_id ?? av.sura),
    words: av.words?.map(mapApiWord),
  };
}

function mapApiWord(w: any): VerseWord {
  return {
    position: w.position,
    charType: w.char_type_name === "end" ? "word" : "end",
    text_uthmani: w.text_uthmani ?? w.text ?? "",
    codeV2: w.code_v2 ?? w.codeV2 ?? "",
    lineNumber: w.line_number ?? w.lineNumber ?? 0,
    pageNumber: w.page_number ?? w.pageNumber ?? 0,
  };
}

// ─── In‑memory LRU cache ────────────────────────────────────────────────────
const MAX_MEM_PAGES = 20;
const pageCache = new Map<number, Verse[]>();

function memGet(page: number): Verse[] | null {
  const hit = pageCache.get(page);
  if (!hit) return null;
  pageCache.delete(page);
  pageCache.set(page, hit);
  return hit;
}

function memSet(page: number, verses: Verse[]) {
  if (pageCache.has(page)) pageCache.delete(page);
  pageCache.set(page, verses);
  while (pageCache.size > MAX_MEM_PAGES) {
    const firstKey = pageCache.keys().next().value;
    if (firstKey !== undefined) pageCache.delete(firstKey);
  }
}

// ─── In‑flight dedup ────────────────────────────────────────────────────────
const inflight = new Map<number, Promise<Verse[]>>();

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getPage(page: number): Promise<Verse[]> {
  if (!Number.isFinite(page) || page < 1 || page > TOTAL_PAGES) return [];
  page = Math.floor(page);

  const memHit = memGet(page);
  if (memHit) return memHit;

  const pending = inflight.get(page);
  if (pending) return pending;

  const work = (async () => {
    const idbHit = await idb.get<{ page: number; verses: Verse[] }>(
      "pages",
      page,
    );
    if (idbHit?.verses?.length) {
      memSet(page, idbHit.verses);
      return idbHit.verses;
    }

    const mushaf = readSelectedMushaf();
    const apiVerses: any[] = (await fetchVersesByPage(
      page,
      MUSHAFS[mushaf].wordFields,
    )) as any[];
    const verses: Verse[] = apiVerses.map(mapApiVerseToVerse);

    await idb.put("pages", { page, verses }).catch(() => {});
    memSet(page, verses);
    return verses;
  })();

  inflight.set(page, work);
  try {
    return await work;
  } finally {
    inflight.delete(page);
  }
}

export async function prefetchPage(page: number): Promise<void> {
  if (!Number.isFinite(page) || page < 1 || page > TOTAL_PAGES) return;
  if (memGet(page)) return;
  getPage(page).catch(() => {});
}

export async function getAllVerses(): Promise<Verse[]> {
  // Check if the cached data is incomplete (first verse of page 1 has empty text)
  let needsRepair = false;
  try {
    const firstPage = await getPage(1);
    if (firstPage.length > 0 && !firstPage[0].text) {
      needsRepair = true;
    }
  } catch {
    needsRepair = true;
  }

  if (needsRepair) {
    console.warn(
      "[Quran] Detected incomplete verse data. Running cache repair...",
    );
    await repairPagesCache();
  }

  const result: Verse[] = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    result.push(...(await getPage(p)));
  }
  return result;
}

export async function getAllVersesAsMap(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const verses = await getPage(p);
    for (const v of verses) {
      out[`${v.sura}:${v.aya}`] = v.text;
    }
  }
  return out;
}

export async function getSurahVersesList(suraIndex: number): Promise<Verse[]> {
  const out: Verse[] = [];
  const chapters = await getChaptersFromMeta();
  const ch = chapters.find((c: any) => c.id === suraIndex);
  if (!ch) return out;
  for (let p = ch.pages[0]; p <= ch.pages[1]; p++) {
    const pageVerses = await getPage(p);
    for (const v of pageVerses) {
      if (v.sura === suraIndex) out.push(v);
      else if (v.sura > suraIndex) return out;
    }
  }
  return out;
}

export async function getJuzVerses(juzNumbers: number[]): Promise<Verse[]> {
  const out: Verse[] = [];
  const wordFields = MUSHAFS[readSelectedMushaf()].wordFields;
  for (const juz of juzNumbers) {
    const apiVerses: any[] = (await fetchVersesByJuz(
      juz,
      wordFields,
    )) as any[];
    out.push(...apiVerses.map(mapApiVerseToVerse));
  }
  return out;
}

export async function getPageRangeVerses(
  pageFrom: number,
  pageTo: number,
): Promise<Verse[]> {
  const out: Verse[] = [];
  for (let p = pageFrom; p <= pageTo; p++) {
    out.push(...(await getPage(p)));
  }
  return out;
}

export async function repairPagesCache(): Promise<void> {
  console.log(
    "[Quran] Repairing pages cache - refetching all pages with full word data...",
  );
  // Clear existing pages store to ensure we fetch fresh data
  await idb.clear("pages");
  const wordFields = MUSHAFS[DEFAULT_MUSHAF].wordFields;
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const apiVerses = (await fetchVersesByPage(page, wordFields)) as any[];
    if (!apiVerses || apiVerses.length === 0) {
      console.warn(`[Quran] No verses returned for page ${page}`);
      continue;
    }
    const verses = apiVerses.map(mapApiVerseToVerse);
    await idb.put("pages", { page, verses });
    if (page % 50 === 0) {
      console.log(`[Quran] Repaired page ${page}/${TOTAL_PAGES}`);
    }
  }
  // Also clear the in‑memory cache so subsequent reads pick up the new data
  pageCache.clear();
  console.log("[Quran] Cache repair complete");
}

// ─── Background page preload ─────────────────────────────────────────────────
let preloadPromise: Promise<void> | null = null;

/**
 * Start preloading all 604 pages in the background.
 * Safe to call multiple times – only one preload runs at a time.
 * Returns a promise that resolves when every page is cached.
 */
export function preloadAllPages(
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  if (preloadPromise) return preloadPromise;

  preloadPromise = (async () => {
    const total = TOTAL_PAGES;
    for (let p = 1; p <= total; p++) {
      try {
        await getPage(p); // this automatically caches in IDB
      } catch {
        // skip pages that fail (e.g., not yet available on the API)
      }
      onProgress?.(p, total);
    }
  })();

  return preloadPromise;
}

// ─── Tafsir (stub) ──────────────────────────────────────────────────────────
export async function fetchTafsirForAyah(
  sura: number,
  aya: number,
  _tafsirId?: string,
): Promise<{ verseKey: string; text: string }> {
  return { verseKey: `${sura}:${aya}`, text: "" };
}

// ─── Translation ──────────────────────────────────────────────────────────
export async function getPageTranslations(page: number, editionId: string) {
  // Placeholder — no real implementation yet
  return [];
}

// ─── Audio ──────────────────────────────────────────────────────────────────
export async function fetchAudioForAyah(
  sura: number,
  aya: number,
  reciter: string,
): Promise<string> {
  const url = await providerAudioForAyah(sura, aya, reciter);
  return url as string; // provider returns unknown – cast
}

// ─── Bundled text corpus ────────────────────────────────────────────────────
/**
 * `verses` IDB store record shape — one row per ayah, keyed by
 * `${sura}:${aya}`. Seeded from the bundled `public/data/quran-text.json`
 * on first launch so the entire mushaf text is available offline before
 * any API call has succeeded. `page` is computed via
 * `estimatePageForVerse` so the row already knows which Madani page it
 * belongs to.
 */
interface VerseRow {
  id: string;
  sura: number;
  aya: number;
  text: string;
  page: number;
}

/**
 * Meta flag in IDB that records the corpus version we last seeded.
 * Bump CORPUS_VERSION when the bundled JSON changes so existing
 * installs re-seed instead of running on stale text.
 */
const CORPUS_VERSION = 1;
const CORPUS_META_KEY = "corpusVersion";

let seedPromise: Promise<void> | null = null;

/**
 * Ensures the bundled Quran text is materialised into the IDB `verses`
 * store. Idempotent: runs once per app install, then becomes a cheap
 * meta-flag check. Safe to await on app start AND inside any reader
 * (search, findVerseByKey, …) — concurrent callers share one inflight
 * promise.
 */
export function seedTextCorpus(): Promise<void> {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    try {
      const meta = await idb.get<{ key: string; value: number }>(
        "meta",
        CORPUS_META_KEY,
      );
      if (meta?.value === CORPUS_VERSION) {
        // Confirm the verses store actually has data — guards against the
        // case where the meta flag survived a clear of the verses store.
        const count = await idb.count("verses");
        if (count >= 6236) {
          console.debug(`[Quran] corpus already seeded (${count} verses)`);
          return;
        }
        console.warn(
          `[Quran] meta says seeded but only ${count} verses in store — re-seeding`,
        );
      }

      console.debug("[Quran] seeding text corpus from /data/quran-text.json");
      const res = await fetch("/data/quran-text.json", {
        cache: "force-cache",
      });
      if (!res.ok) {
        throw new Error(`corpus fetch failed: ${res.status}`);
      }
      const json = (await res.json()) as {
        verses: { sura: number; aya: number; text: string }[];
      };

      const rows: VerseRow[] = json.verses.map((v) => ({
        id: `${v.sura}:${v.aya}`,
        sura: v.sura,
        aya: v.aya,
        text: v.text,
        page: estimatePageForVerse(v.sura, v.aya),
      }));

      await idb.bulkPut("verses", rows);
      await idb.put("meta", { key: CORPUS_META_KEY, value: CORPUS_VERSION });
      console.debug(`[Quran] seeded ${rows.length} verses`);
    } catch (err) {
      // Non-fatal: search will fall back to whatever is in `pages`.
      console.warn("[Quran] text corpus seed failed", err);
      seedPromise = null; // allow a retry next call
      throw err;
    }
  })();
  return seedPromise;
}

// ─── Search ─────────────────────────────────────────────────────────────────
export interface SearchResult {
  verseKey: string;
  sura: number;
  aya: number;
  text: string;
  page: number;
}

/** Cap on rows returned per query — keeps the UI snappy and matches the
 *  pagination size the previous API path used. */
const SEARCH_RESULT_CAP = 50;

/**
 * Local, offline-first Quran search.
 *
 * Search runs against the IDB `verses` store, seeded from the bundled
 * `public/data/quran-text.json` on first launch. No API calls, no auth,
 * no CORS, no rate limits. Works the moment the app boots, even on a
 * brand-new install with no network — the corpus ships with the app.
 *
 * Match modes (in order of precedence):
 *   1. Verse key like "2:255" → returns that single verse.
 *   2. Substring match on the verse text after stripping tashkeel.
 */
export async function searchQuran(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  // Make sure the corpus is in IDB before searching. Cheap once seeded.
  try {
    await seedTextCorpus();
  } catch {
    /* fall through — partial pages cache may still serve a result */
  }

  // ── 1. Verse-key shortcut ──────────────────────────────────────────────
  const keyMatch = q.match(/^(\d{1,3})\s*[:\-\s]\s*(\d{1,3})$/);
  if (keyMatch) {
    const sura = parseInt(keyMatch[1], 10);
    const aya = parseInt(keyMatch[2], 10);
    const row = await findVerseByKey(sura, aya);
    if (row) {
      return [
        {
          verseKey: `${sura}:${aya}`,
          sura,
          aya,
          text: row.text,
          page: row.page,
        },
      ];
    }
    return [];
  }

  // ── 2. Substring scan over verse text ─────────────────────────────────
  let rows = await idb.getAll<VerseRow>("verses");
  if (!rows.length) {
    // Corpus seed hasn't completed (or failed) — fall back to whatever
    // pages have been API-cached.
    return searchFromPagesCache(q);
  }

  const qNorm = normalizeForSearch(q);
  if (!qNorm) return [];

  const results: SearchResult[] = [];
  for (const r of rows) {
    const haystack = normalizeForSearch(r.text || "");
    if (!haystack.includes(qNorm)) continue;
    results.push({
      verseKey: r.id,
      sura: r.sura,
      aya: r.aya,
      text: r.text,
      page: r.page,
    });
    if (results.length >= SEARCH_RESULT_CAP) break;
  }

  results.sort((a, b) => a.sura - b.sura || a.aya - b.aya);
  return results;
}

async function findVerseByKey(
  sura: number,
  aya: number,
): Promise<VerseRow | null> {
  const id = `${sura}:${aya}`;
  const direct = await idb.get<VerseRow>("verses", id);
  if (direct) return direct;
  // Fallback to API-cached pages if the corpus seed never ran.
  const page = estimatePageForVerse(sura, aya);
  const cached = await idb.get<{ page: number; verses: Verse[] }>(
    "pages",
    page,
  );
  const hit = cached?.verses?.find((v) => v.sura === sura && v.aya === aya);
  if (hit) {
    return {
      id,
      sura,
      aya,
      text: hit.text,
      page: hit.page ?? page,
    };
  }
  return null;
}

/** Last-resort search path used when the corpus seed hasn't completed —
 *  matches whatever pages have been API-cached so far. */
async function searchFromPagesCache(q: string): Promise<SearchResult[]> {
  const pages = await idb.getAll<{ page: number; verses: Verse[] }>("pages");
  if (!pages.length) return [];
  const qNorm = normalizeForSearch(q);
  if (!qNorm) return [];
  const results: SearchResult[] = [];
  outer: for (const p of pages) {
    for (const v of p.verses ?? []) {
      const haystack = normalizeForSearch(v.text || "");
      if (!haystack.includes(qNorm)) continue;
      results.push({
        verseKey: `${v.sura}:${v.aya}`,
        sura: v.sura,
        aya: v.aya,
        text: v.text,
        page: v.page ?? p.page,
      });
      if (results.length >= SEARCH_RESULT_CAP) break outer;
    }
  }
  results.sort((a, b) => a.sura - b.sura || a.aya - b.aya);
  return results;
}

// ─── Mushaf selection helper ─────────────────────────────────────────────────
function readSelectedMushaf() {
  try {
    const raw = localStorage.getItem("rafiq_settings_v1");
    if (raw) {
      const s = JSON.parse(raw);
      if (s.mushaf && MUSHAFS[s.mushaf]) return s.mushaf;
    }
  } catch {}
  return DEFAULT_MUSHAF;
}

async function getChaptersFromMeta(): Promise<any[]> {
  const { getChapters } = await import("./metadata.service");
  return getChapters();
}

export async function ensureSeeded(): Promise<void> {
  return;
}
