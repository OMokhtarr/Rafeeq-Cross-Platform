import {
  fetchVersesByPage,
  fetchVersesByJuz,
  fetchAudioForAyah as providerAudioForAyah,
  fetchTafsirForAyah as apiFetchTafsirForAyah,
  fetchTafsirResources as apiFetchTafsirResources,
  fetchPagesLookup as apiFetchPagesLookup,
} from "../api/quran-data-provider";
export type { TafsirResource } from "../api/quran-api.client";
import type {
  PagesLookupResult,
  PagesLookupScope,
} from "../api/quran-api.client";
export type {
  PagesLookupResult,
  PagesLookupScope,
  PageBoundary,
} from "../api/quran-api.client";
import { idb } from "../storage/idb.service";
import type { Verse, VerseWord } from "../../../shared/models/verse.model";
import {
  getSurahNameArabic,
  getSurahNameEnglish,
  estimatePageForVerse,
} from "./metadata.service";
import { MUSHAFS, DEFAULT_MUSHAF, mushafIdFor } from "../api/mushaf.config";
import { readPageLayout } from "./page-layout";
import { mergeLayoutIntoVerses } from "./merge-layout";
import { onDerivedPageCacheCleared } from "./page-cache";
import { shouldRefetchPage } from "./page-refresh";
import { isLikelyOffline } from "../api/quran-api.client";
import { removeDiacritics } from "../../utils/arabic.util";
import {
  buildIdentifyCorpus,
  buildIdentifyIndex,
  decideIdentify,
  type IdentifyCorpus,
  type IdentifyIndex,
} from "../quran/recite-identify.service";

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
export function normalizeForSearch(s: string): string {
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

// Clearing the IDB `pages` store is not enough on its own — the LRU above
// holds up to 20 already-merged pages that IDB knows nothing about, and
// memGet() is consulted first. Dropping both keeps a replaced layout from
// being masked by whatever the user happened to be reading.
onDerivedPageCacheCleared(() => pageCache.clear());

// ─── In‑flight dedup ────────────────────────────────────────────────────────
const inflight = new Map<number, Promise<Verse[]>>();

/**
 * Re-fetch one page's word text without making the reader wait.
 *
 * Discharges the refresh duty QF attached to the data Content Sync does not
 * carry (docs/licensing-decisions.md §1a). Failures are silent: the cached
 * page is already on screen and is allowed to stay.
 */
const refreshing = new Set<number>();

/**
 * Fetch one page and store it: API word text, plus the synced V4 layout when
 * one is held.
 *
 * The merge verifies the two sources describe the same page and returns null
 * if not, so a disagreement costs slightly stale line breaks rather than words
 * paired with the wrong glyphs. See merge-layout.ts.
 */
async function fetchAndStorePage(page: number): Promise<Verse[]> {
  const mushaf = readSelectedMushaf();
  const apiVerses: any[] = (await fetchVersesByPage(
    page,
    MUSHAFS[mushaf].wordFields,
    mushafIdFor(mushaf),
  )) as any[];
  const apiPage: Verse[] = apiVerses.map(mapApiVerseToVerse);

  // The layout only describes V4 glyph positions, so it is not applied to the
  // other mushafs (mergeLayoutIntoVerses also refuses a page without codeV2).
  let verses = apiPage;
  if (mushaf === "qpc_v4_tajweed") {
    const layout = await readPageLayout(page);
    if (layout) verses = mergeLayoutIntoVerses(apiPage, layout) ?? apiPage;
  }

  // Best-effort: a failed write (private mode / quota) must not cost the
  // reader the page they already have in hand.
  await idb
    .put("pages", { page, verses, fetchedAt: Date.now() })
    .catch(() => {});
  memSet(page, verses);
  return verses;
}

function refreshPageInBackground(page: number): void {
  if (refreshing.has(page)) return;
  refreshing.add(page);
  fetchAndStorePage(page)
    .catch(() => {
      // Offline or a failed request: the cached copy stands until next time.
    })
    .finally(() => {
      refreshing.delete(page);
    });
}

// ─── Public API ─────────────────────────────────────────────────────────────

export async function getPage(page: number): Promise<Verse[]> {
  if (!Number.isFinite(page) || page < 1 || page > TOTAL_PAGES) return [];
  page = Math.floor(page);

  const memHit = memGet(page);
  if (memHit) return memHit;

  const pending = inflight.get(page);
  if (pending) return pending;

  const work = (async () => {
    const idbHit = await idb.get<{
      page: number;
      verses: Verse[];
      fetchedAt?: number;
    }>("pages", page);
    if (idbHit?.verses?.length) {
      memSet(page, idbHit.verses);
      // The word-level Uthmani text here is QF content that Content Sync does
      // not carry, so it owes a re-fetch at least every 7 days
      // (docs/licensing-decisions.md §1a). Refresh in the BACKGROUND: the
      // reader still gets this page instantly, and a stale page while offline
      // is explicitly allowed rather than withheld.
      if (
        shouldRefetchPage({
          fetchedAt: idbHit.fetchedAt,
          online: !isLikelyOffline(),
        })
      ) {
        refreshPageInBackground(page);
      }
      return idbHit.verses;
    }

    return fetchAndStorePage(page);
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
  const mushaf = readSelectedMushaf();
  const wordFields = MUSHAFS[mushaf].wordFields;
  const mushafId = mushafIdFor(mushaf);
  for (const juz of juzNumbers) {
    const apiVerses: any[] = (await fetchVersesByJuz(
      juz,
      wordFields,
      mushafId,
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
  const mushafId = mushafIdFor(DEFAULT_MUSHAF);
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    const apiVerses = (await fetchVersesByPage(
      page,
      wordFields,
      mushafId,
    )) as any[];
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

// ─── Tafsir ──────────────────────────────────────────────────────────────────
export async function fetchTafsirForAyah(
  sura: number,
  aya: number,
  tafsirId?: string,
): Promise<{ verseKey: string; text: string }> {
  return apiFetchTafsirForAyah(sura, aya, tafsirId);
}

export async function getTafsirResources() {
  return apiFetchTafsirResources();
}

// ─── Page boundaries (pages lookup) ──────────────────────────────────────────
/**
 * Authoritative page boundaries from the API's `/pages/lookup`, cached in IDB
 * per (scope, mushaf) so it works offline after the first call.
 *
 * Relationship to `estimatePageForVerse`: that helper binary-searches the
 * static PAGE_STARTS table, which was checked against this endpoint on all
 * 604 pages for every selectable mushaf (they share one set of page breaks) —
 * so it is exact despite its name, and remains the synchronous fast path used across
 * the UI. Lookup matters when the answer must come from the API rather than a
 * bundled table: a mushaf whose layout differs from PAGE_STARTS, or verifying
 * the table still agrees after an API-side layout change.
 */
const PAGES_LOOKUP_CACHE_VERSION = "v1";

function pagesLookupCacheKey(
  scope: PagesLookupScope,
  mushafId: number | undefined,
): string {
  const parts = Object.entries(scope)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `pages_lookup_${PAGES_LOOKUP_CACHE_VERSION}_${mushafId ?? "default"}_${parts}`;
}

export async function getPagesLookup(
  scope: PagesLookupScope,
): Promise<PagesLookupResult | null> {
  const mushafId = mushafIdFor(readSelectedMushaf());
  const cacheKey = pagesLookupCacheKey(scope, mushafId);

  try {
    const cached = await idb.get<{ key: string; value: PagesLookupResult }>(
      "meta",
      cacheKey,
    );
    if (cached?.value?.pages?.length) return cached.value;
  } catch {}

  try {
    const result = await apiFetchPagesLookup(scope, mushafId);
    if (result.pages.length) {
      idb.put("meta", { key: cacheKey, value: result }).catch(() => {});
    }
    return result;
  } catch {
    // Offline or the endpoint is unavailable — callers fall back to the static
    // PAGE_STARTS table via estimatePageForVerse.
    return null;
  }
}

/**
 * Page containing a verse, preferring the API's layout and falling back to the
 * static table. Async by nature; the synchronous `estimatePageForVerse` stays
 * the right choice inside render paths.
 */
export async function getPageForVerse(
  sura: number,
  aya: number,
): Promise<number> {
  const lookup = await getPagesLookup({ chapterNumber: sura });
  if (lookup) {
    for (const p of lookup.pages) {
      const [ls, la] = p.lastVerseKey.split(":").map(Number);
      if (Number.isFinite(ls) && Number.isFinite(la)) {
        if (ls > sura || (ls === sura && la >= aya)) return p.page;
      }
    }
  }
  return estimatePageForVerse(sura, aya);
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

/** In-memory cache of the corpus with pre-normalized text, built once and
 *  reused across every `findVerseByStartingPhrase` call in a session —
 *  Recite Mode's identify phase calls this once per ~6s chunk, and
 *  re-normalizing all ~6,200 verses from scratch each time is avoidable
 *  work since the bundled corpus never changes at runtime. */
let normalizedCorpusCache: (VerseRow & { normalized: string })[] | null = null;

async function getNormalizedCorpus(): Promise<(VerseRow & { normalized: string })[]> {
  if (normalizedCorpusCache) return normalizedCorpusCache;
  await seedTextCorpus().catch(() => {});
  const rows = await idb.getAll<VerseRow>("verses");
  normalizedCorpusCache = rows.map((r) => ({
    ...r,
    normalized: normalizeForSearch(r.text || ""),
  }));
  return normalizedCorpusCache;
}

/** The whole Quran flattened into one canonical-order token sequence plus
 *  the indices where each verse starts — the shape the sequence-based
 *  identify scorer needs. Built once per session (same rationale as the
 *  normalized-corpus cache) since the bundled text never changes. */
let corpusSequenceCache: IdentifyCorpus | null = null;

async function getCorpusSequence(): Promise<IdentifyCorpus> {
  if (corpusSequenceCache) return corpusSequenceCache;
  corpusSequenceCache = buildIdentifyCorpus(await getNormalizedCorpus());
  return corpusSequenceCache;
}

/** The identify word index (positions + rarity per word) over that corpus,
 *  built once alongside it — about 40 ms on desktop, so it's built on the
 *  first identify call rather than in idle chunks. */
let identifyIndexCache: { corpus: IdentifyCorpus; index: IdentifyIndex } | null = null;

async function getIdentifyIndex(): Promise<{ corpus: IdentifyCorpus; index: IdentifyIndex }> {
  if (identifyIndexCache) return identifyIndexCache;
  const corpus = await getCorpusSequence();
  identifyIndexCache = { corpus, index: buildIdentifyIndex(corpus) };
  return identifyIndexCache;
}

/**
 * Locates the verse a spoken phrase most likely starts from, for Recite
 * Mode's initial "which page am I reciting" detection. Returns null when it
 * can't *confidently* place the recitation — the caller keeps accumulating
 * chunks and retries, and gives up (stops recite mode) if it never becomes
 * confident. It never forces a low-confidence guess: a wrong navigation is
 * worse than admitting "I can't tell yet."
 *
 * Places are found from the rarest spoken words and scored by the rarity
 * of the words the transcript follows in order from there, across verse
 * boundaries (see `decideIdentify`), so a passage started mid-verse is
 * found too and common words alone never decide.
 *
 * Several verses across the Quran open with near-identical phrasing (e.g.
 * many sūrahs open "تنزيل الكتاب…", six open with "الم"), so a short spoken
 * phrase can score two or more verses almost equally. A tied or near-tied
 * top score returns null — the caller accumulates more chunks and calls
 * again, which eliminates the wrong candidates as the recitation continues
 * past the shared opening.
 */
/**
 * Outcome of an identify attempt:
 *  - "found": confidently placed → `match` holds the verse/page.
 *  - "ambiguous": a strong candidate exists but a near-duplicate verse
 *    elsewhere (mutashabihat) scores just as high — the recitation hasn't yet
 *    passed the phrasing they share. Making progress; the caller should keep
 *    going (with more patience than a plain "none").
 *  - "none": no viable candidate at all (silence, noise, non-Quran speech).
 */
export type IdentifyOutcome =
  | {
      status: "found";
      match: SearchResult;
      /** True when the match had no competing near-duplicate elsewhere in
       *  the Quran — the recited words already pin it to exactly one place.
       *  False when a rival existed and was resolved by discriminating words
       *  or position (a mutashabihat passage). Callers use this to decide how
       *  much more recitation is needed before trusting the landing (see
       *  ESTABLISHED_WORDS_ON_PAGE in the recite hooks): a unique landing is
       *  trustworthy almost immediately; an ambiguous one needs the reciter
       *  to get well past the shared phrasing first. */
      unique: boolean;
    }
  | { status: "ambiguous" }
  | { status: "none" };

/** Resolves a chosen sura:aya to a full SearchResult (with page). `unique`
 *  records whether this decision had no competing near-duplicate (see
 *  IdentifyOutcome.unique) — passed by each caller since only they know
 *  whether a rival was in play. */
async function decideVerse(
  sura: number,
  aya: number,
  unique: boolean,
): Promise<IdentifyOutcome> {
  const row = await findVerseByKey(sura, aya);
  if (!row) {
    console.log(`[recite-identify] resolved ${sura}:${aya} but no corpus row found`);
    return { status: "none" };
  }
  console.log(
    `[recite-identify] decided ${row.sura}:${row.aya} (page ${row.page})` +
      `${unique ? " [unique]" : " [has rival]"}`,
  );
  return {
    status: "found",
    match: { verseKey: row.id, sura: row.sura, aya: row.aya, text: row.text, page: row.page },
    unique,
  };
}

export async function findVerseByStartingPhrase(
  spokenText: string,
  options: { minMatched?: number; nearPosition?: { sura: number; aya: number } | null } = {},
): Promise<IdentifyOutcome> {
  const { corpus, index } = await getIdentifyIndex();
  const decision = decideIdentify(
    spokenText,
    corpus,
    { ...options, log: (line) => console.log(`[recite-identify] ${line}`) },
    index,
  );
  if (decision.status !== "found") return decision;
  return decideVerse(decision.sura, decision.aya, decision.unique);
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
export function readSelectedMushaf() {
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
