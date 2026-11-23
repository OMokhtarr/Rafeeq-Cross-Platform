/**
 * SIMILAR VERSES
 *
 * Finds the verses that share a phrase with a given verse: any run of
 * MIN_SHARED_WORDS or more consecutive words, wherever it sits in either
 * verse. Words are compared without diacritics and with letter variants
 * folded (normalizeArabic), so ٱلْكِتَٰبُ and الكتب count as one word.
 *
 * Runs on the bundled text corpus, so it works offline. The phrase index is
 * built once per corpus and reused.
 */

import { idb } from "../storage/idb.service";
import { seedTextCorpus } from "../data/quran.service";
import { normalizeArabic } from "./recite-matcher.service";

export const MIN_SHARED_WORDS = 3;

export interface CorpusVerse {
  sura: number;
  aya: number;
  text: string;
  page: number;
}

export interface SimilarVerse {
  key: string;
  sura: number;
  aya: number;
  page: number;
  /** The verse's words as written, for display. */
  words: string[];
  /** Indexes into `words` that are part of a phrase shared with the verse. */
  shared: number[];
  /** Length of the longest run of words shared with the verse. */
  longestRun: number;
}

interface IndexedVerse extends CorpusVerse {
  words: string[];
  /** Normalized words, aligned with `words`. */
  norm: string[];
}

interface PhraseIndex {
  verses: IndexedVerse[];
  byKey: Map<string, number>;
  /** Phrase of MIN_SHARED_WORDS words → indexes of the verses containing it. */
  phrases: Map<string, number[]>;
}

const indexes = new WeakMap<CorpusVerse[], PhraseIndex>();

function phrasesOf(norm: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + MIN_SHARED_WORDS <= norm.length; i++) {
    out.push(norm.slice(i, i + MIN_SHARED_WORDS).join(" "));
  }
  return out;
}

function buildIndex(corpus: CorpusVerse[]): PhraseIndex {
  const verses: IndexedVerse[] = [];
  const byKey = new Map<string, number>();
  const phrases = new Map<string, number[]>();
  corpus.forEach((v, i) => {
    const words = v.text.split(/\s+/).filter(Boolean);
    const norm = words.map((w) => normalizeArabic(w));
    verses.push({ ...v, words, norm });
    byKey.set(`${v.sura}:${v.aya}`, i);
    for (const p of new Set(phrasesOf(norm))) {
      const list = phrases.get(p);
      if (list) list.push(i);
      else phrases.set(p, [i]);
    }
  });
  return { verses, byKey, phrases };
}

function indexFor(corpus: CorpusVerse[]): PhraseIndex {
  let index = indexes.get(corpus);
  if (!index) {
    index = buildIndex(corpus);
    indexes.set(corpus, index);
  }
  return index;
}

/** Longest run of consecutive words the two verses have in common. */
function longestCommonRun(a: string[], b: string[]): number {
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      }
    }
    prev = curr;
  }
  return best;
}

/**
 * Verses sharing a phrase with `key`, longest shared run first, then in
 * mushaf order. The verse itself is left out.
 */
export function findSimilarInCorpus(corpus: CorpusVerse[], key: string): SimilarVerse[] {
  const index = indexFor(corpus);
  const self = index.byKey.get(key);
  if (self === undefined) return [];
  const target = index.verses[self];
  const targetPhrases = new Set(phrasesOf(target.norm));

  const candidates = new Set<number>();
  for (const p of targetPhrases) {
    for (const i of index.phrases.get(p) ?? []) if (i !== self) candidates.add(i);
  }

  const results: SimilarVerse[] = [];
  for (const i of candidates) {
    const v = index.verses[i];
    const shared = new Set<number>();
    phrasesOf(v.norm).forEach((p, start) => {
      if (!targetPhrases.has(p)) return;
      for (let k = start; k < start + MIN_SHARED_WORDS; k++) shared.add(k);
    });
    results.push({
      key: `${v.sura}:${v.aya}`,
      sura: v.sura,
      aya: v.aya,
      page: v.page,
      words: v.words,
      shared: Array.from(shared).sort((a, b) => a - b),
      longestRun: longestCommonRun(target.norm, v.norm),
    });
  }

  return results.sort(
    (a, b) => b.longestRun - a.longestRun || a.sura - b.sura || a.aya - b.aya,
  );
}

let corpusPromise: Promise<CorpusVerse[]> | null = null;

/** The whole text corpus in mushaf order, loaded once. */
function loadCorpus(): Promise<CorpusVerse[]> {
  if (!corpusPromise) {
    corpusPromise = (async () => {
      await seedTextCorpus();
      const rows = await idb.getAll<CorpusVerse>("verses");
      return rows.sort((a, b) => a.sura - b.sura || a.aya - b.aya);
    })();
    // A failed load (seed or IDB) is retried on the next call.
    corpusPromise.catch(() => {
      corpusPromise = null;
    });
  }
  return corpusPromise;
}

/** Verses sharing a phrase with `key` ("sura:aya"), from the bundled text. */
export async function findSimilarVerses(key: string): Promise<SimilarVerse[]> {
  return findSimilarInCorpus(await loadCorpus(), key);
}
