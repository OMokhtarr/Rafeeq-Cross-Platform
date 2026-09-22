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
