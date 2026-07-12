import {
  fetchVersesByPage,
  fetchVersesByJuz,
  fetchAudioForAyah as providerAudioForAyah,
  fetchTranslationsByPage as apiFetchTranslationsByPage,
  fetchTafsirForAyah as apiFetchTafsirForAyah,
  fetchTafsirResources as apiFetchTafsirResources,
} from "../api/quran-data-provider";
export type { TafsirResource } from "../api/quran-api.client";
import { idb } from "../storage/idb.service";
import type { Verse, VerseWord } from "../../../shared/models/verse.model";
import {
  getSurahNameArabic,
  getSurahNameEnglish,
  estimatePageForVerse,
} from "./metadata.service";
import { MUSHAFS, DEFAULT_MUSHAF } from "../api/mushaf.config";
import { removeDiacritics } from "../../utils/arabic.util";
import {
  normalizeArabic,
  scoreCorpusAnchors,
  wordsMatch,
  type CorpusToken,
} from "../quran/recite-matcher.service";

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

// ─── Translation ──────────────────────────────────────────────────────────────
export async function getPageTranslations(
  page: number,
  editionId: string,
): Promise<{ verseKey: string; text: string }[]> {
  return apiFetchTranslationsByPage(page, editionId);
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
let corpusSequenceCache: {
  tokens: CorpusToken[];
  verseStarts: number[];
  startIndexByVerse: Map<string, number>;
} | null = null;

async function getCorpusSequence(): Promise<{
  tokens: CorpusToken[];
  verseStarts: number[];
  startIndexByVerse: Map<string, number>;
}> {
  if (corpusSequenceCache) return corpusSequenceCache;
  const rows = await getNormalizedCorpus();
  // IDB returns rows in string-key order ("10:1" < "2:1"), so sort into true
  // canonical order before flattening — sequence matching depends on it.
  const sorted = [...rows].sort((a, b) => a.sura - b.sura || a.aya - b.aya);

  const tokens: CorpusToken[] = [];
  const verseStarts: number[] = [];
  const startIndexByVerse = new Map<string, number>();
  for (const r of sorted) {
    const words = normalizeArabic(r.text || "")
      .split(" ")
      .filter(Boolean);
    if (!words.length) continue;
    startIndexByVerse.set(`${r.sura}:${r.aya}`, tokens.length);
    verseStarts.push(tokens.length);
    words.forEach((token, wordIndex) => {
      tokens.push({ sura: r.sura, aya: r.aya, wordIndex, token });
    });
  }

  corpusSequenceCache = { tokens, verseStarts, startIndexByVerse };
  return corpusSequenceCache;
}

/**
 * Locates the verse a spoken phrase most likely starts from, for Recite
 * Mode's initial "which page am I reciting" detection. Returns null when it
 * can't *confidently* place the recitation — the caller keeps accumulating
 * chunks and retries, and gives up (stops recite mode) if it never becomes
 * confident. It never forces a low-confidence guess: a wrong navigation is
 * worse than admitting "I can't tell yet."
 *
 * Scores every verse by how much of the spoken transcript matches forward
 * from it as a *contiguous in-order sequence* that flows across verse
 * boundaries (see `scoreCorpusAnchors`). This deliberately replaces the old
 * per-verse bag-of-words count, which gave long verses an unfair edge — a
 * passage spanning several short verses would lose to an unrelated long
 * verse that merely contained the same words scattered inside it (e.g.
 * Yunus 10:37 winning over As-Sajdah 32:2–3).
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

/** Window (in words) used both by the anchor scorer and the head-to-head
 *  disambiguation — a candidate's "continuation" for comparison. */
const IDENTIFY_WINDOW = 30;

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
  const { tokens, verseStarts, startIndexByVerse } = await getCorpusSequence();
  if (!tokens.length) return { status: "none" };

  const ranked = scoreCorpusAnchors(spokenText, tokens, verseStarts);
  if (!ranked.length) {
    console.log(`[recite-identify] no sequence anchor matched — waiting for more`);
    return { status: "none" };
  }

  const best = ranked[0];
  // The highest-scoring rival that's an *independent* competitor — far enough
  // away in the mushaf that its scoring window doesn't overlap the winner's.
  // Judged by canonical token distance, NOT sura/aya: adjacent verses (even
  // straddling a sura boundary, e.g. the last verse of Al-Mulk and the first
  // of Al-Qalam) have overlapping windows and correlated scores, so they must
  // count as the *same* region — otherwise they'd forever tie as fake
  // "duplicates" with no unique words to tell them apart. Only a competitor a
  // full window away means we genuinely can't tell where we are.
  const bestStart = startIndexByVerse.get(`${best.sura}:${best.aya}`) ?? -1;
  const rival = ranked.find((c) => {
    const s = startIndexByVerse.get(`${c.sura}:${c.aya}`);
    return s !== undefined && Math.abs(s - bestStart) > IDENTIFY_WINDOW;
  });
  const rivalScore = rival ? rival.matchedWords : null;

  // Require an absolute number of matched words before trusting an
  // identification — enough that noise or ordinary (non-Quran) speech
  // coinciding with a verse opening won't trip it. A fixed floor, NOT a
  // share of the (ever-growing) transcript: the window only spans ~30 words,
  // so demanding a ratio of a long buffer becomes impossible to satisfy the
  // more the user recites. Callers with a faster/fresher feedback loop
  // (Deepgram's streaming driver — see
  // hooks/recite/deepgram/useIdentifySession.ts) may pass a lower value:
  // they get more attempts per second, so a slightly lower per-attempt bar
  // still keeps false-identification rare while resolving sooner overall.
  const MIN_MATCHED = options.minMatched ?? 5;
  if (best.matchedWords < MIN_MATCHED) {
    console.log(
      `[recite-identify] best=${best.sura}:${best.aya} matched=${best.matchedWords} ` +
        `< min ${MIN_MATCHED} — waiting`,
    );
    return { status: "none" };
  }

  // Ambiguous on the raw score: a near-duplicate verse elsewhere is within a
  // word of the winner. Shared words inflate both equally, so the raw gap is
  // a weak signal. Decide it with a targeted head-to-head instead — compare
  // only each candidate's *unique* window words (in one's continuation but
  // not the other's) against the recitation. Whichever candidate's
  // discriminating words the reciter actually said wins. This keys entirely
  // on the divergence point (e.g. 2:38 "خوف عليهم يحزنون" vs 20:123 "يضل
  // يشقى"), so it resolves as soon as you recite past the shared phrasing and
  // shrugs off STT noise on the shared part.
  const ambiguous = rival !== undefined && rivalScore !== null && best.matchedWords - rivalScore <= 1;
  if (ambiguous && rival) {
    const windowWords = (sura: number, aya: number): string[] => {
      const start = startIndexByVerse.get(`${sura}:${aya}`);
      if (start === undefined) return [];
      return [
        ...new Set(tokens.slice(start, start + IDENTIFY_WINDOW).map((tok) => tok.token)),
      ];
    };
    // "Unique" must be fuzzy, not exact: near-duplicate verses differ in
    // form on shared words too (اهبطوا/اهبطا, تبع/اتبع), and those must NOT
    // count as discriminating — only genuinely different words (خوف/يضل …).
    const bestW = windowWords(best.sura, best.aya);
    const rivalW = windowWords(rival.sura, rival.aya);
    const bestUnique = bestW.filter((w) => !rivalW.some((r) => wordsMatch(r, w)));
    const rivalUnique = rivalW.filter((w) => !bestW.some((b) => wordsMatch(b, w)));

    const spoken = [
      ...new Set(normalizeArabic(spokenText).split(" ").filter((w) => w.length > 2)),
    ];
    const countHits = (unique: string[]) =>
      unique.filter((u) => spoken.some((s) => wordsMatch(u, s))).length;
    const bestHits = countHits(bestUnique);
    const rivalHits = countHits(rivalUnique);

    // Need a clear margin on the discriminating words before committing, so a
    // single garbled/coincidental word can't flip the choice.
    const DECISIVE_MARGIN = 2;
    if (Math.abs(bestHits - rivalHits) < DECISIVE_MARGIN) {
      // The unique-word test can't separate these yet (often 0/0 because the
      // two candidates are word-for-word identical for many verses — e.g.
      // "وإذ قلنا للملائكة اسجدوا لآدم…" is verbatim at 2:34 / 17:61 / 18:50 /
      // 20:116). But this is a *re-identify*, so the caller may already know
      // roughly where the reciter was tracking a moment ago. If so, prefer the
      // candidate whose canonical position is closest to that — a re-identify
      // almost always resumes near where it stalled, not in a distant sura —
      // and decide now instead of waiting for the reciter to reach a
      // distinguishing word. A genuine jump to a far-away duplicate still
      // works: once they recite past the shared text, the normal wrong-page /
      // re-identify path corrects it.
      if (options.nearPosition) {
        const anchor = startIndexByVerse.get(
          `${options.nearPosition.sura}:${options.nearPosition.aya}`,
        );
        const bestIdx = startIndexByVerse.get(`${best.sura}:${best.aya}`);
        const rivalIdx = startIndexByVerse.get(`${rival.sura}:${rival.aya}`);
        if (anchor !== undefined && bestIdx !== undefined && rivalIdx !== undefined) {
          const nearer =
            Math.abs(bestIdx - anchor) <= Math.abs(rivalIdx - anchor) ? best : rival;
          console.log(
            `[recite-identify] ambiguous ${best.sura}:${best.aya} vs ${rival.sura}:${rival.aya}` +
              ` — tie-broken toward last position ${options.nearPosition.sura}:` +
              `${options.nearPosition.aya} → ${nearer.sura}:${nearer.aya}`,
          );
          // A rival existed (these are exact-text duplicates) — not unique.
          return decideVerse(nearer.sura, nearer.aya, false);
        }
      }
      console.log(
        `[recite-identify] ambiguous: ${best.sura}:${best.aya} vs ${rival.sura}:${rival.aya} — ` +
          `unique-word hits ${bestHits}/${rivalHits}, not decisive yet — waiting`,
      );
      return { status: "ambiguous" };
    }
    const winner = bestHits > rivalHits ? best : rival;
    console.log(
      `[recite-identify] head-to-head ${best.sura}:${best.aya}(${bestHits}) vs ` +
        `${rival.sura}:${rival.aya}(${rivalHits}) → ${winner.sura}:${winner.aya}`,
    );
    // A competing near-duplicate existed and was resolved by discriminating
    // words — not unique, so the caller should still wait past shared phrasing.
    return decideVerse(winner.sura, winner.aya, false);
  }

  // No independent rival competed with the winner — the passage is unique.
  return decideVerse(best.sura, best.aya, true);
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
