/**
 * ADVANCED RANGE → VERSE POOL
 *
 * Turns a mixed list of ranges into the verse pool a quiz draws from. The
 * per-kind dispatch mirrors what each test page did inline for a single scope;
 * here it runs across every range and unions the results.
 */

import type { QuizRange, Verse } from "../../../shared/models/verse.model";
import {
  getSurahVersesList,
  getJuzVerses,
  getPageRangeVerses,
} from "../../../core/services/data/quran.service";
import {
  getSurahStartPage,
  getSurahEndPage,
  getJuzStart,
  getJuzEnd,
  estimatePageForVerse,
  getPageStart,
  getRubStart,
  getRubEnd,
} from "../../../core/services/data/metadata.service";
import { rangeKey } from "./quiz-range-format";

const MAX_PAGE = 604;

/** Bounds check. One bad entry must not destroy an otherwise usable set. */
export function isValidRange(range: QuizRange): boolean {
  switch (range.kind) {
    case "juz":
      return Number.isInteger(range.juz) && range.juz >= 1 && range.juz <= 30;
    case "surah":
      return (
        Number.isInteger(range.surah) && range.surah >= 1 && range.surah <= 114
      );
    case "pages":
      return (
        Number.isInteger(range.from) &&
        Number.isInteger(range.to) &&
        range.from >= 1 &&
        range.to <= MAX_PAGE &&
        range.from <= range.to
      );
    default:
      return false;
  }
}

/**
 * Drop invalid and duplicate entries, preserving first-seen order.
 *
 * Exact duplicates go; overlapping-but-distinct ranges stay, because the pool
 * dedupes at verse level and blocking overlap would surprise a user who thinks
 * in units rather than in verses.
 */
export function normalizeRanges(ranges: QuizRange[]): QuizRange[] {
  const seen = new Set<string>();
  const out: QuizRange[] = [];
  for (const range of ranges) {
    if (!isValidRange(range)) continue;
    const key = rangeKey(range);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(range);
  }
  return out;
}

/**
 * How many mushaf pages one range spans.
 *
 * Juz boundaries are stored as verses, not pages, so a juz is measured by
 * locating its first and last verse on the page grid. There is no constant to
 * use instead: the 604 pages are not divided evenly across the 30 juz.
 */
export function rangePageCount(range: QuizRange): number {
  if (!isValidRange(range)) return 0;
  switch (range.kind) {
    case "pages":
      return range.to - range.from + 1;
    case "surah": {
      const start = getSurahStartPage(range.surah);
      const end = getSurahEndPage(range.surah);
      return Math.max(1, end - start + 1);
    }
    case "juz": {
      const s = getJuzStart(range.juz);
      const e = getJuzEnd(range.juz);
      const start = estimatePageForVerse(s.sura, s.aya);
      const end = estimatePageForVerse(e.sura, e.aya);
      return Math.max(1, end - start + 1);
    }
  }
}

/**
 * Pages covered by a whole selection, counting a page once however many
 * ranges include it — so "3 questions per page" cannot be inflated by
 * overlapping ranges.
 */
export function totalPageCount(ranges: QuizRange[]): number {
  const pages = new Set<number>();
  for (const range of normalizeRanges(ranges)) {
    let start: number;
    let end: number;
    if (range.kind === "pages") {
      start = range.from;
      end = range.to;
    } else if (range.kind === "surah") {
      start = getSurahStartPage(range.surah);
      end = getSurahEndPage(range.surah);
    } else {
      const s = getJuzStart(range.juz);
      const e = getJuzEnd(range.juz);
      start = estimatePageForVerse(s.sura, s.aya);
      end = estimatePageForVerse(e.sura, e.aya);
    }
    for (let p = start; p <= end; p++) pages.add(p);
  }
  return pages.size;
}

/** Surah of the last verse on `page`: the one before the next page starts. */
function lastSurahOnPage(page: number): number {
  const next = getPageStart(page + 1);
  if (!next) return 114;
  return next.aya === 1 ? next.sura - 1 : next.sura;
}

/**
 * Every surah a selection touches. A juz or page range that crosses a surah
 * boundary counts each surah it reaches, so one range can cover several.
 *
 * Built only from the bundled PAGE_STARTS / RUB_STARTS tables, never the
 * fetched chapter/juz caches: the setup page calls this on render, which can
 * come before metadata loads (first launch offline), and the cache fallbacks
 * would then report all 114 surahs.
 */
export function rangeSurahs(ranges: QuizRange[]): Set<number> {
  const surahs = new Set<number>();
  for (const range of normalizeRanges(ranges)) {
    let first: number;
    let last: number;
    if (range.kind === "surah") {
      first = last = range.surah;
    } else if (range.kind === "juz") {
      // A juz is 8 rubs: rubs 8n-7 … 8n.
      first = getRubStart(range.juz * 8 - 7).sura;
      last = getRubEnd(range.juz * 8).sura;
    } else {
      first = getPageStart(range.from)!.sura;
      last = lastSurahOnPage(range.to);
    }
    for (let s = first; s <= last; s++) surahs.add(s);
  }
  return surahs;
}

async function versesFor(range: QuizRange): Promise<Verse[]> {
  switch (range.kind) {
    case "surah":
      return getSurahVersesList(range.surah);
    case "juz":
      return getJuzVerses([range.juz]);
    case "pages":
      return getPageRangeVerses(range.from, range.to);
  }
}

/** The union of every range, deduped by sura:aya and in mushaf order. */
export async function buildRangeVerses(ranges: QuizRange[]): Promise<Verse[]> {
  const valid = normalizeRanges(ranges);
  if (valid.length === 0) return [];

  const byKey = new Map<string, Verse>();
  for (const range of valid) {
    for (const v of await versesFor(range)) {
      const key = `${v.sura}:${v.aya}`;
      if (!byKey.has(key)) byKey.set(key, v);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    a.sura === b.sura ? a.aya - b.aya : a.sura - b.sura,
  );
}
