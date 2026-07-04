/**
 * RECITE MATCHER
 *
 * Matches a running Arabic transcript (from chunked STT) against the
 * Quran text to find how far the user has recited, word by word. Scans
 * forward from an expected position first — cheap, and correct almost
 * always, since a reciter proceeds verse-by-verse in order — and only
 * widens to a fuller search when the transcript stops lining up with the
 * expected next verse (e.g. the reciter jumped to a different verse).
 */

import { removeDiacritics } from "../../utils/arabic.util";
import type { Verse, VerseWord } from "../../../shared/models/verse.model";

// ─── Normalization ──────────────────────────────────────────────────────────

/** Same letter-variant folding used by Quran search, plus diacritic strip. */
export function normalizeArabic(s: string): string {
  return removeDiacritics(s)
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string): string[] {
  const n = normalizeArabic(text);
  return n.length ? n.split(" ") : [];
}

// ─── Word similarity ────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  const curr = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** True if two normalized words are close enough to count as a spoken match. */
export function wordsMatch(expected: string, spoken: string): boolean {
  if (!expected || !spoken) return false;
  if (expected === spoken) return true;
  const maxLen = Math.max(expected.length, spoken.length);
  if (maxLen <= 2) return false; // too short to fuzzy-match reliably
  const dist = levenshtein(expected, spoken);
  return dist <= Math.max(1, Math.floor(maxLen * 0.3));
}

// ─── Position types ─────────────────────────────────────────────────────────

export interface RecitePosition {
  sura: number;
  aya: number;
  /** Index into that verse's word-only (non "end") entries, 0-based. */
  wordIndex: number;
}

export interface MatchResult {
  /** Furthest position reached by the transcript, or null if nothing matched. */
  position: RecitePosition | null;
  /** Number of trailing spoken tokens that were consumed matching up to `position`. */
  consumedTokens: number;
}

/**
 * NOTE: in this codebase's VerseWord model, `charType` is mapped inverted
 * from the Quran Foundation API's `char_type_name` (see quran.service.ts /
 * quran-api.client.ts): `charType === "end"` is an actual recitable word,
 * while `charType === "word"` is the ayah-end ۝ marker glyph. This matches
 * the filter PageViewer already uses for its manual hint system
 * (`activeWordCount`, `partialTargetForPage`).
 */
function verseWordTokens(verse: Verse): string[] {
  return (verse.words ?? [])
    .filter((w) => w.charType === "end")
    .map((w) => normalizeArabic(w.text_uthmani));
}

/**
 * Builds a flat expected-word sequence starting at `from` (inclusive)
 * across `verses` (assumed in ascending sura:aya order, e.g. one page's
 * worth, optionally with the next page's verses appended for
 * cross-page continuation).
 */
function buildExpectedSequence(
  verses: Verse[],
  from: RecitePosition,
): { sura: number; aya: number; wordIndex: number; token: string }[] {
  const seq: { sura: number; aya: number; wordIndex: number; token: string }[] = [];
  let started = false;
  for (const v of verses) {
    if (!started) {
      if (v.sura === from.sura && v.aya === from.aya) started = true;
      else if (v.sura > from.sura || (v.sura === from.sura && v.aya > from.aya)) {
        started = true;
      } else {
        continue;
      }
    }
    const tokens = verseWordTokens(v);
    const startIdx =
      v.sura === from.sura && v.aya === from.aya ? from.wordIndex : 0;
    for (let i = startIdx; i < tokens.length; i++) {
      seq.push({ sura: v.sura, aya: v.aya, wordIndex: i, token: tokens[i] });
    }
  }
  return seq;
}

/** Runs the sliding forward match against a pre-built expected sequence,
 *  starting the scan at `expected[0]`. Shared by the forward pass and the
 *  rewind-anchor scan so both use identical matching rules. */
function matchAgainstSequence(
  spokenTokens: string[],
  expected: { sura: number; aya: number; wordIndex: number; token: string }[],
  maxSkip: number,
): { lastMatched: (typeof expected)[number] | null; consumedTokens: number } {
  let expectedCursor = 0;
  let lastMatched: (typeof expected)[number] | null = null;
  let consumedTokens = 0;

  for (const spoken of spokenTokens) {
    let found = -1;
    const window = Math.min(maxSkip + 1, expected.length - expectedCursor);
    for (let offset = 0; offset < window; offset++) {
      const candidate = expected[expectedCursor + offset];
      if (wordsMatch(candidate.token, spoken)) {
        found = offset;
        break;
      }
    }
    if (found === -1) continue; // spoken filler/mistake — skip, keep scanning
    expectedCursor += found + 1;
    lastMatched = expected[expectedCursor - 1];
    consumedTokens++;
    if (expectedCursor >= expected.length) break;
  }

  return { lastMatched, consumedTokens };
}

/**
 * Positions `count` words behind `from` (may cross back into earlier
 * verses), earliest-first — candidate rewind points for detecting "the
 * reciter repeated the last few words, treat it as a correction."
 */
function backwardAnchors(verses: Verse[], from: RecitePosition, count: number): RecitePosition[] {
  const anchors: RecitePosition[] = [];
  let sura = from.sura;
  let aya = from.aya;
  let wordIndex = from.wordIndex;

  for (let steps = 0; steps < count; steps++) {
    if (wordIndex > 0) {
      wordIndex -= 1;
    } else {
      const idx = verses.findIndex((v) => v.sura === sura && v.aya === aya);
      const prevVerse = idx > 0 ? verses[idx - 1] : null;
      if (!prevVerse) break;
      const prevWordCount = verseWordTokens(prevVerse).length;
      if (prevWordCount === 0) break;
      sura = prevVerse.sura;
      aya = prevVerse.aya;
      wordIndex = prevWordCount - 1;
    }
    anchors.push({ sura, aya, wordIndex });
  }

  return anchors.reverse(); // earliest (furthest back) first
}

/**
 * Matches `spokenText` (running transcript for the current chunk window)
 * against the expected sequence starting at `from`. Returns the furthest
 * position reached by consecutively matched words, allowing a small
 * number of skipped expected words (stutters / STT drops) but requiring
 * spoken tokens to advance roughly in order.
 *
 * Also checks whether the spoken words match more strongly starting a few
 * words *behind* `from` — if so, the reciter likely repeated a phrase to
 * correct themselves, and the match rewinds there instead of advancing.
 */
export function matchTranscript(
  spokenText: string,
  verses: Verse[],
  from: RecitePosition,
  options: { maxLookahead?: number; maxSkip?: number; maxRewind?: number } = {},
): MatchResult {
  const maxLookahead = options.maxLookahead ?? 60;
  const maxSkip = options.maxSkip ?? 4;
  const maxRewind = options.maxRewind ?? 8;

  const spokenTokens = tokenize(spokenText);
  if (!spokenTokens.length) return { position: null, consumedTokens: 0 };

  const forwardExpected = buildExpectedSequence(verses, from).slice(0, maxLookahead);
  const forward = forwardExpected.length
    ? matchAgainstSequence(spokenTokens, forwardExpected, maxSkip)
    : { lastMatched: null, consumedTokens: 0 };

  // Only worth checking for a rewind if the forward match is weak — a
  // strong forward match means the reciter is just continuing normally.
  const forwardRatio = forward.consumedTokens / spokenTokens.length;
  let best = forward;

  if (forwardRatio < 0.7) {
    for (const anchor of backwardAnchors(verses, from, maxRewind)) {
      const anchorExpected = buildExpectedSequence(verses, anchor).slice(0, maxLookahead);
      if (!anchorExpected.length) continue;
      const candidate = matchAgainstSequence(spokenTokens, anchorExpected, maxSkip);
      const candidateRatio = candidate.consumedTokens / spokenTokens.length;
      // Require a clearly stronger signal than the forward attempt (not
      // just marginally better) before treating it as a correction.
      if (candidateRatio >= 0.7 && candidate.consumedTokens > best.consumedTokens) {
        best = candidate;
      }
    }
  }

  if (!best.lastMatched) return { position: null, consumedTokens: 0 };

  return {
    position: {
      sura: best.lastMatched.sura,
      aya: best.lastMatched.aya,
      wordIndex: best.lastMatched.wordIndex + 1, // one past the last matched word
    },
    consumedTokens: best.consumedTokens,
  };
}

// ─── Whole-Quran identify scoring ────────────────────────────────────────────

/** One recitable word of the whole-Quran corpus, in canonical order. */
export interface CorpusToken {
  sura: number;
  aya: number;
  /** Index of this word within its own verse, 0-based. */
  wordIndex: number;
  /** Pre-normalized (normalizeArabic) word text. */
  token: string;
}

export interface AnchorScore {
  sura: number;
  aya: number;
  /** Distinct spoken words that matched somewhere in this anchor's window. */
  matchedWords: number;
}

/**
 * Ranks candidate starting verses for Recite Mode's "which verse am I
 * reciting" identification. For each verse it takes a fixed-size forward
 * window of the Quran text starting at that verse (flowing across verse
 * boundaries — `corpus` is the whole Quran flattened in canonical order,
 * `verseStarts` the indices where each verse begins) and counts how many of
 * the distinct spoken words fuzzy-match *some* word in that window.
 *
 * Two failure modes shaped this design:
 *   1. Per-verse bag-of-words counting let a single long verse win just by
 *      containing many words — a passage spanning several short verses lost
 *      to an unrelated long verse (e.g. Yunus 10:37 beating As-Sajdah
 *      32:2–3). A *fixed-size* window makes every candidate compete over the
 *      same amount of text, removing that bias, while still spanning verse
 *      boundaries so a short starting verse gets credit for its
 *      continuation.
 *   2. Strict in-order sequence matching was too brittle for real Whisper
 *      output, which drops and mangles words badly enough to break any
 *      contiguous run — so bag-of-words (order-independent) within the
 *      window is what survives garbled transcription.
 *
 * Every verse is scored (no first-word prefilter): Whisper frequently drops
 * or mangles the opening word of a passage, and requiring the verse's first
 * word to appear in the transcript would exclude the correct verse entirely
 * whenever that happens.
 *
 * Because the window looks forward across verse boundaries, the verse just
 * *before* the true start would otherwise win on raw word-coverage: its
 * window absorbs the recited words (plus a coincidental self-match or two).
 * The primary ranking is therefore a *sequence* follow — how far the
 * recitation tracks this verse's word order starting from its first word.
 * That's high only for the verse the reciter actually began on: a preceding
 * verse whose window merely *contains* the recited words (scattered, out of
 * order) can't follow them in sequence. Bag-of-words coverage (robust to
 * garbled STT) then breaks ties and is what the caller thresholds on.
 */
const SEQUENCE_MAX_SKIP = 3;

export function scoreCorpusAnchors(
  spokenText: string,
  corpus: CorpusToken[],
  verseStarts: number[],
  options: { windowSize?: number } = {},
): AnchorScore[] {
  const windowSize = options.windowSize ?? 30;

  const spokenAll = tokenize(spokenText).filter((t) => t.length > 2);
  if (spokenAll.length < 3) return [];
  const spoken = [...new Set(spokenAll)]; // distinct — buffer accumulation repeats words

  const results: (AnchorScore & { seq: number })[] = [];
  for (let vi = 0; vi < verseStarts.length; vi++) {
    const start = verseStarts[vi];
    const first = corpus[start];
    if (!first) continue;

    const windowTokens = corpus.slice(start, start + windowSize);
    let matchedWords = 0;
    for (const sw of spoken) {
      if (windowTokens.some((wt) => wordsMatch(wt.token, sw))) matchedWords++;
    }
    if (matchedWords === 0) continue;

    // How far the recitation follows THIS verse's word order from its start —
    // ordered tokens (not deduped), so repeats don't inflate. High only for
    // the verse the reciter actually started on.
    const seq = matchAgainstSequence(spokenAll, windowTokens, SEQUENCE_MAX_SKIP)
      .consumedTokens;

    results.push({ sura: first.sura, aya: first.aya, matchedWords, seq });
  }

  // Rank by matched + seq: coverage (robust to garbling) *and* order-follow
  // (pins to the true start). A coincidentally high seq on an unrelated verse
  // won't win without also covering the words, and vice versa.
  results.sort(
    (a, b) =>
      b.matchedWords + b.seq - (a.matchedWords + a.seq) ||
      b.seq - a.seq ||
      a.sura - b.sura ||
      a.aya - b.aya,
  );
  return results.map(({ sura, aya, matchedWords }) => ({ sura, aya, matchedWords }));
}

export function firstWordPosition(verse: Verse): RecitePosition {
  return { sura: verse.sura, aya: verse.aya, wordIndex: 0 };
}

export function verseWordCount(verse: Verse): number {
  return (verse.words ?? []).filter((w: VerseWord) => w.charType === "end").length;
}

/**
 * Diacritic-stripped text of the last `wordCount` words *already recited*
 * before `from`, for use as Whisper's `prompt`. The prompt is Whisper's
 * preceding-context conditioning: passing the words just recited pins the
 * decoding to the right passage and vocabulary. It must NOT contain the
 * upcoming (not-yet-recited) words — Whisper echoes prompt text into its
 * output whenever the audio trails off into silence, which used to reveal
 * words the reciter never said (it would even "finish the verse" for them).
 * Tashkeel is removed because Whisper transcribes Arabic inconsistently
 * vocalized, and everything downstream matches on diacritic-free text
 * anyway — an un-vocalized prompt keeps the hint in the same shape as what
 * we compare against.
 */
export function precedingWordsText(
  verses: Verse[],
  from: RecitePosition,
  wordCount: number = 12,
): string {
  const seq: string[] = [];
  for (const v of verses) {
    const isFromVerse = v.sura === from.sura && v.aya === from.aya;
    const isBefore =
      v.sura < from.sura || (v.sura === from.sura && v.aya < from.aya);
    if (!isBefore && !isFromVerse) break;
    const words = (v.words ?? []).filter((w) => w.charType === "end");
    const end = isFromVerse ? Math.min(from.wordIndex, words.length) : words.length;
    for (let i = 0; i < end; i++) seq.push(removeDiacritics(words[i].text_uthmani));
    if (isFromVerse) break;
  }
  return seq.slice(-wordCount).join(" ");
}
