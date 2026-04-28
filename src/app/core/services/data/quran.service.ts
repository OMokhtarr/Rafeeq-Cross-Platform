/**
 * QURAN SERVICE
 * Facade between feature components and the data layer.
 *
 * After the API migration, the data source is the Quran Foundation Content API
 * (via the token-broker for auth). The legacy `quran-text.json` seed is gone.
 *
 * Per-page caching:
 *   - In-memory LRU (20 pages) — repeat flips through nearby pages are instant.
 *   - IDB `pages` store — survives reload, used as the next-fastest tier.
 *   - API — the source of truth. Fetched on first visit to each page.
 *
 * Public functions kept identical to the previous seeded version, so quiz /
 * search / viewer code continues to work without changes.
 */

import { idb } from "../storage/idb.service";
import {
  getCachedPage,
  setCachedPage,
  setSurahName,
  surahNamesArabic,
  getSurahName,
} from "./repositories/ayah.repository";
import {
  fetchVersesByPage,
  QuranApiNotFound,
  type PageVerseDTO,
} from "../api/quran-api.client";
import { MUSHAFS, DEFAULT_MUSHAF, type MushafKind } from "../api/mushaf.config";
import type { Verse } from "../../../shared/models/verse.model";

export { surahNamesArabic, getSurahName };
export type { Verse };

/**
 * Compatibility no-op kept for callers that used to await the JSON seed
 * (App bootstrap, quiz pages). The API path is lazy — there is nothing
 * to seed up-front any more, so this just resolves.
 */
export async function ensureSeeded(): Promise<void> {
  return;
}

/**
 * Build a `{"sura:aya": text}` map for ALL 6,236 verses by walking pages 1..604.
 * Used by the mutashabihat phrase-matching index.
 *
 * First call: heavy — fetches every page from the API (cached after).
 * Subsequent calls: instant if all 604 pages are in IDB.
 */
export async function getAllVersesAsMap(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const verses = await getPage(p);
    for (const v of verses) out[`${v.sura}:${v.aya}`] = v.text;
  }
  return out;
}

const TOTAL_PAGES = 604;
const SETTINGS_KEY = "rafiq_settings_v1";

// The first page number that returned 404. Set once and used to short-circuit
// later requests so we don't slam the API for pages we know aren't served.
// Reset by reload; doesn't persist (prod creds may unlock more pages).
let firstMissingPage: number | null = null;
let ceilingWarned = false;

// ─── Mushaf selection ─────────────────────────────────────────────────────────

function readSelectedMushaf(): MushafKind {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s.mushaf && MUSHAFS[s.mushaf as MushafKind]) return s.mushaf;
    }
  } catch {}
  return DEFAULT_MUSHAF;
}

// ─── Page fetch with three-tier cache ─────────────────────────────────────────

const inflight = new Map<number, Promise<Verse[]>>();

export async function getPage(page: number): Promise<Verse[]> {
  if (!Number.isFinite(page) || page < 1 || page > TOTAL_PAGES) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[quran.service] getPage() rejected page:", page);
    }
    return [];
  }
  page = Math.floor(page);

  // Short-circuit: if we already hit a 404 ceiling this session, don't bother.
  if (firstMissingPage !== null && page >= firstMissingPage) return [];

  const memHit = getCachedPage(page);
  if (memHit) return memHit;

  const pending = inflight.get(page);
  if (pending) return pending;

  const work = (async () => {
    const idbHit = await idb.get<{ page: number; verses: Verse[] }>("pages", page);
    if (idbHit?.verses?.length) {
      setCachedPage(page, idbHit.verses);
      return idbHit.verses;
    }

    const mushaf = readSelectedMushaf();
    let dtos: PageVerseDTO[];
    try {
      dtos = await fetchVersesByPage(page, MUSHAFS[mushaf].wordFields);
    } catch (err) {
      if (err instanceof QuranApiNotFound) {
        if (firstMissingPage === null || page < firstMissingPage) {
          firstMissingPage = page;
        }
        if (!ceilingWarned) {
          ceilingWarned = true;
          console.warn(
            `[quran.service] page ${page} is not served by the current API ` +
              `credentials. The prelive sandbox typically only serves pages 1–49. ` +
              `Production credentials should unlock the full Mushaf.`,
          );
        }
        return [] as Verse[];
      }
      throw err;
    }
    const verses = dtos.map(dtoToVerse);

    await idb.put("pages", { page, verses }).catch(() => {});
    setCachedPage(page, verses);
    return verses;
  })();

  inflight.set(page, work);
  try {
    return await work;
  } finally {
    inflight.delete(page);
  }
}

function dtoToVerse(d: PageVerseDTO): Verse {
  return {
    sura: d.sura,
    aya: d.aya,
    text: d.textUthmani,
    page: d.page,
    juz: d.juz,
    suraNameAr: surahNamesArabic[d.sura] ?? `سورة ${d.sura}`,
    suraName: getSurahName(d.sura, "english"),
    words: d.words,
  };
}

/**
 * Last page known to be available, or `null` if no ceiling has been hit yet.
 * UI can read this to cap page navigation while running on prelive credentials.
 */
export function getKnownPageCeiling(): number | null {
  return firstMissingPage === null ? null : firstMissingPage - 1;
}

/** Background warm-up. Fire-and-forget. */
export function prefetchPage(page: number): void {
  if (!Number.isFinite(page) || page < 1 || page > TOTAL_PAGES) return;
  if (getCachedPage(page)) return;
  getPage(page).catch(() => {});
}

// ─── Aggregations used by quiz code ───────────────────────────────────────────
//
// These walk pages on demand. The first run for a given surah/juz is slow
// (worst case ~30 page fetches over the network), but every page visited
// is cached in IDB, so subsequent runs are instant.

export async function getSurahVersesList(suraIndex: number): Promise<Verse[]> {
  const out: Verse[] = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const pv = await getPage(p);
    if (!pv.length) continue;
    let touched = false;
    for (const v of pv) {
      if (v.sura === suraIndex) {
        out.push(v);
        touched = true;
      } else if (touched && v.sura > suraIndex) {
        return out;
      }
    }
  }
  return out;
}

export async function getJuzVerses(juzNumbers: number[]): Promise<Verse[]> {
  const wanted = new Set(juzNumbers);
  const out: Verse[] = [];
  for (let p = 1; p <= TOTAL_PAGES; p++) {
    const juz = Math.ceil(p / 20);
    if (!wanted.has(juz)) continue;
    out.push(...(await getPage(p)));
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
