/**
 * RECITE ALIGNER
 *
 * Tracks a recitation against the verse text and decides, word by word,
 * what was said, missed, or said wrongly. Each spoken phrase is aligned
 * once — by dynamic programming, like scoring a transcript against a
 * reference — from where the previous phrase ended. That replaces the old
 * greedy matcher, which assumed every gap was a recognition error (revealing
 * skipped words as recited) and re-matched Deepgram's cumulative partial
 * results from an already-advanced position (leaping ahead on repeated
 * phrases).
 *
 * Design: docs/superpowers/specs/2026-10-01-recite-mistake-detection-design.md
 */

import type { Verse } from "../../../shared/models/verse.model";
import type { RecitePosition } from "./recite-matcher.service";
import {
  compareWord,
  isUnrecitable,
  joinedSpellings,
  plainLetters,
  spokenLetters,
  uthmaniSkeleton,
  type Skeleton,
  type WordVerdict,
} from "./recite-spelling.service";

// ─── Tuning (starting values from the design spec) ───────────────────────────

export const SOUND_ALIKE_COST = 0.25;
export const WRONG_COST = 1.0;
export const MISSED_COST = 0.8;
export const EXTRA_COST = 0.7;
/** Cost per word of starting a phrase behind the committed position. */
export const RESTART_COST_PER_WORD = 0.15;
/** How far behind the committed position a phrase may restart. */
export const RESTART_WINDOW = 10;
/** How far ahead of the committed position a phrase is aligned — room for a
 *  long phrase Deepgram has not finalized yet. */
export const LOOKAHEAD = 60;
/** Correctly said words needed after a gap before it is marked. */
export const CONFIRM_AFTER = 2;
/** Correctly said words a re-search needs before resuming in place. */
export const RESUME_MIN_SAID = 3;
/** Spoken tokens one lenient word may absorb ("الف لام ميم"). */
const LENIENT_MAX_TOKENS = 5;
/** Per absorbed token — small, so a lenient word never out-competes real
 *  words for the tokens that follow it. */
const LENIENT_TOKEN_COST = 0.05;
/** Added to merged/split steps so one-to-one matches win ties (a phrase
 *  ending "الرحمن إن" must not join the two into الرحمان). */
const JOIN_COST = 0.05;

/** Surahs whose verse 1 opens with muqatta'at; 42:2 (عسق) is added
 *  separately. Defined by position — أَلَمْ (94:1, 105:1, 105:2) shares
 *  الٓمٓ's spelling but is an ordinary word. */
const MUQATTAAT_SURAS = new Set([
  2, 3, 7, 10, 11, 12, 13, 14, 15, 19, 20, 26, 27, 28, 29, 30, 31, 32, 36, 38,
  40, 41, 42, 43, 44, 45, 46, 50, 68,
]);

/** One-off Uthmani spellings no skeleton rule maps to what the recognizer
 *  writes, matched by their required letters: لَتَّخَذْتَ (18:77, written
 *  لاتخذت) and يَبْنَؤُمَّ (20:94, spoken as three words يا ابن أم). Lenient,
 *  so they are never marked. Found by the whole-Quran spelling check. */
const IRREGULAR_SPELLINGS = new Set(["لتخذت", "يبنءم"]);

// ─── Types ───────────────────────────────────────────────────────────────────

/** One recitable verse word, in reading order. */
export interface ExpectedWord {
  sura: number;
  aya: number;
  /** Index among the verse's recitable entries — the RecitePosition convention. */
  wordIndex: number;
  /** VerseWord.position — what MushafPage renders by. */
  position: number;
  /** Uthmani text, for logs. */
  text: string;
  skeleton: Skeleton;
  /** Muqatta'at: never marked, absorbs letter names. */
  lenient: boolean;
}

export interface SpokenWord {
  text: string;
  /** Deepgram's per-word confidence, when known. */
  confidence?: number;
}

export type MarkKind = "missed" | "wrong";

export interface Mark {
  kind: MarkKind;
  /** VerseWord.position of the marked word. */
  position: number;
}

/** Red words, keyed `sura:aya:wordIndex`. */
export type Marks = ReadonlyMap<string, Mark>;

export interface TrackerState {
  /** One past the last word said (the existing RecitePosition convention). */
  cursor: RecitePosition;
  marks: Marks;
}

export type StepKind =
  | "said"
  | "soundAlike"
  | "wrong"
  | "missed"
  | "extra"
  | "merged"
  | "split"
  | "lenient";

export interface AlignStep {
  kind: StepKind;
  /** 0 (extra), 1, or 2 (merged) verse words. */
  expected: ExpectedWord[];
  /** 0 (missed), 1, 2 (split), or 0–5 (lenient) spoken words. */
  spoken: SpokenWord[];
}

export interface AlignResult {
  state: TrackerState;
  /** Correctly said words between the old cursor and the new one. */
  newSaid: number;
  /** Correctly said words anywhere in the alignment, including a restart and
   *  words still pending behind an unconfirmed gap — "the reciter is on this
   *  text", which is what the mismatch streak needs. */
  saidTotal: number;
  /** Keys newly marked. */
  added: string[];
  /** Keys whose marks were cleared by saying the word correctly. */
  cleared: string[];
  steps: AlignStep[];
}

export interface AlignOptions {
  /** The phrase may start anywhere from the cursor up to this position at no
   *  cost and without marks — a reciter starting mid-verse on the first
   *  landing, or skipping a quiz's shown snippet. */
  freeStartUntil?: RecitePosition;
  /** Words before this position are never marked (a quiz's shown snippet). */
  protectBefore?: RecitePosition;
}

// ─── Expected words ──────────────────────────────────────────────────────────

const expectedCache = new WeakMap<Verse, ExpectedWord[]>();

function verseExpectedWords(verse: Verse): ExpectedWord[] {
  const cached = expectedCache.get(verse);
  if (cached) return cached;
  // Inverted charType model: "end" is a recitable word (see recite-matcher.service).
  const words = (verse.words ?? []).filter((w) => w.charType === "end");
  const isMuqattaatVerse =
    (verse.aya === 1 && MUQATTAAT_SURAS.has(verse.sura)) || (verse.sura === 42 && verse.aya === 2);
  const out: ExpectedWord[] = [];
  words.forEach((w, i) => {
    const skeleton = uthmaniSkeleton(w.text_uthmani ?? "", words[i + 1]?.text_uthmani);
    if (isUnrecitable(skeleton)) return;
    out.push({
      sura: verse.sura,
      aya: verse.aya,
      wordIndex: i,
      position: w.position,
      text: w.text_uthmani,
      skeleton,
      lenient: (isMuqattaatVerse && i === 0) || IRREGULAR_SPELLINGS.has(plainLetters(skeleton)),
    });
  });
  expectedCache.set(verse, out);
  return out;
}

/** Every recitable word of `verses` (ascending order), unrecitable tokens removed. */
export function buildExpectedWords(verses: Verse[]): ExpectedWord[] {
  return verses.flatMap(verseExpectedWords);
}

export function wordKey(w: { sura: number; aya: number; wordIndex: number }): string {
  return `${w.sura}:${w.aya}:${w.wordIndex}`;
}

function cmp(a: { sura: number; aya: number; wordIndex: number }, b: RecitePosition): number {
  return a.sura - b.sura || a.aya - b.aya || a.wordIndex - b.wordIndex;
}

/** Index of the first expected word at or after `pos` (length if none). */
function indexAtOrAfter(expected: ExpectedWord[], pos: RecitePosition): number {
  let lo = 0;
  let hi = expected.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cmp(expected[mid], pos) < 0) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function positionAfter(w: ExpectedWord): RecitePosition {
  return { sura: w.sura, aya: w.aya, wordIndex: w.wordIndex + 1 };
}

/** Recognizer output as aligner input — Deepgram's per-word list when present
 *  (it carries confidences), else the transcript split on spaces. */
export function spokenWordsFrom(
  text: string,
  words?: { word: string; confidence: number }[],
): SpokenWord[] {
  const list: SpokenWord[] =
    words && words.length
      ? words.map((w) => ({ text: w.word, confidence: w.confidence }))
      : text.split(/\s+/).map((t) => ({ text: t }));
  return list.filter((w) => spokenLetters(w.text).length > 0);
}

// ─── Alignment ───────────────────────────────────────────────────────────────

const OP_DIAG = 1;
const OP_MERGED = 2;
const OP_SPLIT = 3;
const OP_LENIENT = 4;
const OP_MISSED = 5;
const OP_EXTRA = 6;
const OP_START = 7;

function verdictCost(v: WordVerdict): number {
  return v === "said" ? 0 : v === "soundAlike" ? SOUND_ALIKE_COST : WRONG_COST;
}

function isCorrect(kind: StepKind): boolean {
  return kind === "said" || kind === "soundAlike" || kind === "merged" || kind === "split";
}

/**
 * Aligns one spoken phrase against the verse text from `state.cursor` and
 * returns the resulting state. Pure — the caller decides whether the result
 * is tentative (a partial result) or committed (a final).
 */
export function alignPhrase(
  state: TrackerState,
  spoken: SpokenWord[],
  verses: Verse[],
  options: AlignOptions = {},
): AlignResult {
  const all = buildExpectedWords(verses);
  const cursorIdx = indexAtOrAfter(all, state.cursor);
  const freeIdx = options.freeStartUntil
    ? Math.max(cursorIdx, indexAtOrAfter(all, options.freeStartUntil))
    : cursorIdx;
  const from = Math.max(0, cursorIdx - RESTART_WINDOW);
  const to = Math.min(all.length, freeIdx + LOOKAHEAD);
  const E = all.slice(from, to);
  const S = spoken;
  const n = S.length;
  const m = E.length;
  const r = cursorIdx - from; // window index of the committed cursor
  const f = freeIdx - from; // a start up to here is free
  if (n === 0 || m === 0) {
    return { state, newSaid: 0, saidTotal: 0, added: [], cleared: [], steps: [] };
  }

  const width = m + 1;
  const cost = new Float64Array((n + 1) * width).fill(Infinity);
  const op = new Uint8Array((n + 1) * width);
  const opK = new Uint8Array((n + 1) * width);
  const at = (i: number, j: number) => i * width + j;

  const diagCache = new Map<number, WordVerdict>();
  const diag = (i: number, j: number): WordVerdict => {
    const key = at(i, j);
    let v = diagCache.get(key);
    if (v === undefined) {
      v = compareWord(E[j].skeleton, S[i].text, S[i].confidence);
      diagCache.set(key, v);
    }
    return v;
  };
  // Merges and splits bridge pure spelling joins (يا أيها ↔ يٰٓأيها), so they
  // must match exactly — a sound-alike join let a skipped short word vanish
  // into its neighbour (ءامنوا + أن ≈ "آمنوا").
  const merged = (i: number, j: number): boolean => {
    const a = E[j];
    const b = E[j + 1];
    if (a.lenient || b.lenient || a.sura !== b.sura || a.aya !== b.aya) return false;
    return compareWord([...a.skeleton, ...b.skeleton], S[i].text) === "said";
  };
  const split = (i: number, j: number): boolean => {
    if (E[j].lenient) return false;
    return joinedSpellings(S[i].text, S[i + 1].text).some(
      (joined) => compareWord(E[j].skeleton, joined) === "said",
    );
  };

  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      let best = Infinity;
      let bestOp = 0;
      let bestK = 0;
      const consider = (c: number, o: number, k = 0) => {
        if (c < best - 1e-9) {
          best = c;
          bestOp = o;
          bestK = k;
        }
      };
      const ej = j > 0 ? E[j - 1] : null;
      if (i > 0 && ej && !ej.lenient) {
        consider(cost[at(i - 1, j - 1)] + verdictCost(diag(i - 1, j - 1)), OP_DIAG);
      }
      if (i > 0 && j > 1 && merged(i - 1, j - 2)) {
        consider(cost[at(i - 1, j - 2)] + JOIN_COST, OP_MERGED);
      }
      if (i > 1 && ej && split(i - 2, j - 1)) {
        consider(cost[at(i - 2, j - 1)] + JOIN_COST, OP_SPLIT);
      }
      if (ej && ej.lenient) {
        for (let k = 0; k <= Math.min(LENIENT_MAX_TOKENS, i); k++) {
          consider(cost[at(i - k, j - 1)] + LENIENT_TOKEN_COST * k, OP_LENIENT, k);
        }
      }
      if (ej && !ej.lenient) consider(cost[at(i, j - 1)] + MISSED_COST, OP_MISSED);
      if (i > 0) consider(cost[at(i - 1, j)] + EXTRA_COST, OP_EXTRA);
      if (i === 0 && j <= f) consider(j <= r ? RESTART_COST_PER_WORD * (r - j) : 0, OP_START);
      cost[at(i, j)] = best;
      op[at(i, j)] = bestOp;
      opK[at(i, j)] = bestK;
    }
  }

  // Open end: verse words after the last spoken word are not reached yet.
  let endJ = 0;
  for (let j = 1; j <= m; j++) if (cost[at(n, j)] < cost[at(n, endJ)] - 1e-9) endJ = j;

  // Backtrace into reading-order steps.
  const steps: AlignStep[] = [];
  const stepWindow: number[] = []; // window index of each step's first verse word (-1 for extra)
  let i = n;
  let j = endJ;
  while (!(i === 0 && op[at(i, j)] === OP_START)) {
    const o = op[at(i, j)];
    if (o === OP_DIAG) {
      const v = diag(i - 1, j - 1);
      steps.push({ kind: v, expected: [E[j - 1]], spoken: [S[i - 1]] });
      stepWindow.push(j - 1);
      i -= 1;
      j -= 1;
    } else if (o === OP_MERGED) {
      steps.push({ kind: "merged", expected: [E[j - 2], E[j - 1]], spoken: [S[i - 1]] });
      stepWindow.push(j - 2);
      i -= 1;
      j -= 2;
    } else if (o === OP_SPLIT) {
      steps.push({ kind: "split", expected: [E[j - 1]], spoken: [S[i - 2], S[i - 1]] });
      stepWindow.push(j - 1);
      i -= 2;
      j -= 1;
    } else if (o === OP_LENIENT) {
      const k = opK[at(i, j)];
      steps.push({ kind: "lenient", expected: [E[j - 1]], spoken: S.slice(i - k, i) });
      stepWindow.push(j - 1);
      i -= k;
      j -= 1;
    } else if (o === OP_MISSED) {
      steps.push({ kind: "missed", expected: [E[j - 1]], spoken: [] });
      stepWindow.push(j - 1);
      j -= 1;
    } else {
      steps.push({ kind: "extra", expected: [], spoken: [S[i - 1]] });
      stepWindow.push(-1);
      i -= 1;
    }
  }
  steps.reverse();
  stepWindow.reverse();

  // ─── Result rules ───
  // One outcome per verse word, in reading order. Lenient words are
  // transparent: they neither count as said nor confirm or break a gap.
  type Outcome = { idx: number; ok: boolean; kind: StepKind };
  const outcomes: Outcome[] = [];
  steps.forEach((step, s) => {
    if (step.kind === "extra" || step.kind === "lenient") return;
    step.expected.forEach((_, k) => {
      outcomes.push({ idx: stepWindow[s] + k, ok: isCorrect(step.kind), kind: step.kind });
    });
  });

  const protectIdx = options.protectBefore
    ? indexAtOrAfter(all, options.protectBefore) - from
    : -1;
  const markableFrom = Math.max(r, protectIdx);
  const relevantGap = (o: Outcome) => !o.ok && o.idx >= markableFrom;

  let lastOkBeforeBlock = -1;
  const toMark: Outcome[] = [];
  for (let k = 0; k < outcomes.length; k++) {
    const o = outcomes[k];
    if (o.ok) {
      lastOkBeforeBlock = o.idx;
      continue;
    }
    if (!relevantGap(o)) continue;
    // A gap: the run of relevant wrong/missed words starting here.
    let end = k;
    while (end + 1 < outcomes.length && relevantGap(outcomes[end + 1])) end++;
    let okAfter = 0;
    for (let q = end + 1; q < outcomes.length && !relevantGap(outcomes[q]); q++) {
      if (outcomes[q].ok) okAfter++;
    }
    if (okAfter < CONFIRM_AFTER) break; // unconfirmed: pending, the cursor stops here
    for (let q = k; q <= end; q++) toMark.push(outcomes[q]);
    k = end;
  }

  const cursorWindowIdx = Math.max(r, lastOkBeforeBlock + 1);
  const cursor = cursorWindowIdx > r ? positionAfter(E[cursorWindowIdx - 1]) : state.cursor;

  const marks = new Map(state.marks);
  const cleared: string[] = [];
  const added: string[] = [];
  let newSaid = 0;
  let saidTotal = 0;
  for (const o of outcomes) {
    if (!o.ok) continue;
    saidTotal++;
    if (o.idx >= r && o.idx < cursorWindowIdx) newSaid++;
    const key = wordKey(E[o.idx]);
    if (marks.delete(key)) cleared.push(key);
  }
  for (const o of toMark) {
    const w = E[o.idx];
    const key = wordKey(w);
    marks.set(key, { kind: o.kind === "missed" ? "missed" : "wrong", position: w.position });
    added.push(key);
  }

  return { state: { cursor, marks }, newSaid, saidTotal, added, cleared, steps };
}

// ─── Tracker ─────────────────────────────────────────────────────────────────

/**
 * Phrase handling shared by the Mushaf driver and the quiz. Every partial
 * result of a phrase is aligned from the same committed state (so each
 * spoken word is used once, and a revised word just changes the tentative
 * result); a final commits.
 */
export interface ReciteTracker {
  committed: () => TrackerState;
  onPartial: (spoken: SpokenWord[], verses: Verse[]) => AlignResult;
  onFinal: (spoken: SpokenWord[], verses: Verse[]) => AlignResult;
  reset: (state: TrackerState, options?: AlignOptions) => void;
}

export function createReciteTracker(initial: TrackerState, options: AlignOptions = {}): ReciteTracker {
  let committed = initial;
  let opts = options;
  return {
    committed: () => committed,
    onPartial: (spoken, verses) => alignPhrase(committed, spoken, verses, opts),
    onFinal: (spoken, verses) => {
      const result = alignPhrase(committed, spoken, verses, opts);
      committed = result.state;
      return result;
    },
    reset: (state, nextOptions = {}) => {
      committed = state;
      opts = nextOptions;
    },
  };
}

// ─── Helpers for callers ─────────────────────────────────────────────────────

/** Marks every recitable word in [from, to) as missed — used when a re-search
 *  relocates forward past words the reciter skipped. */
export function markSkipped(
  marks: Marks,
  verses: Verse[],
  from: RecitePosition,
  to: RecitePosition,
): Marks {
  const next = new Map(marks);
  for (const w of buildExpectedWords(verses)) {
    if (w.lenient) continue;
    if (cmp(w, from) >= 0 && cmp(w, to) < 0) {
      next.set(wordKey(w), { kind: "missed", position: w.position });
    }
  }
  return next;
}

/** Marks as `sura:aya:position` keys — what MushafPage's `mistakes` prop takes. */
export function markPositionKeys(marks: Marks): Set<string> {
  const keys = new Set<string>();
  marks.forEach((mark, key) => {
    const [sura, aya] = key.split(":");
    keys.add(`${sura}:${aya}:${mark.position}`);
  });
  return keys;
}

/** One-line summary for the `[recite-align]` console log. */
export function formatAlignLog(result: AlignResult): string {
  const parts = result.steps.map((s) => {
    const exp = s.expected.map((w) => w.text).join("+");
    const spk = s.spoken
      .map((w) => (w.confidence !== undefined ? `${w.text}(${w.confidence.toFixed(2)})` : w.text))
      .join("+");
    if (s.kind === "extra") return `+${spk}`;
    if (s.kind === "missed") return `-${exp}`;
    if (s.kind === "said") return exp;
    return `${s.kind}:${exp}=${spk}`;
  });
  const c = result.state.cursor;
  return (
    `${parts.join(" ")} → ${c.sura}:${c.aya}:${c.wordIndex} ` +
    `(+${result.newSaid} said, ${result.added.length} marked, ${result.cleared.length} cleared)`
  );
}
