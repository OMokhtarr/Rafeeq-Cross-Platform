import {
  fetchVersesByPage,
  fetchVersesByJuz,
  searchQuran as apiSearch,
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
    charType: w.char_type_name === "word" ? "word" : "end",
    textUthmani: w.text_uthmani ?? w.text ?? "",
    codeV1: w.code_v1 ?? w.codeV1 ?? "",
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
  for (const juz of juzNumbers) {
    const apiVerses: any[] = (await fetchVersesByJuz(juz)) as any[];
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

// ─── Search ─────────────────────────────────────────────────────────────────
export interface SearchResult {
  verseKey: string;
  sura: number;
  aya: number;
  text: string;
  page: number;
}

export async function searchQuran(query: string): Promise<SearchResult[]> {
  const rows = (await apiSearch(query)) as any[];
  return rows.map((r: any) => {
    const [s, a] = (r.verseKey ?? "").split(":").map(Number);
    return {
      verseKey: r.verseKey,
      sura: s,
      aya: a,
      text: r.text,
      page: estimatePageForVerse(s, a),
    };
  });
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
