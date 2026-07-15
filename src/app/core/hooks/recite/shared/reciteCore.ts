/**
 * RECITE CORE — shared, engine-agnostic types and pure helpers.
 *
 * Used by the Deepgram streaming driver (../deepgram/deepgramDriver.ts) for
 * the position/reveal state machine: the position math, the identify-outcome
 * guard values, and the whole-Quran search entry point.
 */

import type { Verse } from "../../../../shared/models/verse.model";
import {
  verseWordCount,
  type RecitePosition,
} from "../../../services/quran/recite-matcher.service";
import type { RevealAnimator } from "./useRevealAnimator";

export type { RecitePosition, RevealAnimator };

/**
 * Contract the Deepgram driver is built against. `useReciteMode` constructs
 * one of these per recording session and hands it the pieces of session
 * state — the position/reveal machinery, page navigation, and the handful
 * of UI flags — so the driver only has to implement how its transcription
 * source turns into "text was recognized."
 */
export interface ReciteDriverDeps {
  isActive: () => boolean;
  isRecording: () => boolean;
  getPage: () => number;
  setPage: (page: number) => void;
  getPageVerses: () => Verse[];
  setPageVerses: (verses: Verse[]) => void;
  clearNextPageVerses: () => void;
  getCombinedVerses: () => Verse[];
  applyPosition: (verses: Verse[], pos: RecitePosition) => void;
  hideWholePage: (verses: Verse[]) => void;
  reveal: RevealAnimator;
  onNavigateToPage: (page: number) => void;
  prefetchNextPage: (page: number) => void;
  setIdentifying: (v: boolean) => void;
  setLastChunkText: (text: string) => void;
  setNoMatchHint: (v: boolean) => void;
  touchLastSpeechAt: () => void;
  stopRecording: () => void;
}

/** What every driver hook returns — `useReciteMode` only ever talks to a
 *  driver through this shape, regardless of which engine is behind it.
 *  `micError` is a live value (not a snapshot): each driver hook re-renders
 *  its owning component when its own error state changes, same as any
 *  other React hook return. */
export interface ReciteDriver {
  micError: string | null;
  /** Begins a fresh recording session (called once per startRecording). */
  start: () => void;
  /** Ends the session (called from stopRecording/disarm/unmount). */
  stop: () => void;
}

/** The strict (maxSkip: 0) reveal pass can get permanently stuck when the
 *  STT garbles one expected word — no later input can ever advance past it.
 *  A loose fallback pass may skip a couple of expected words, but only when
 *  it matches at least this many spoken words as evidence the recitation
 *  really is past the stuck word. The skipped word *was* recited (just
 *  misheard), so accepting the fallback never reveals ahead of the reciter. */
export const LOOSE_MATCH_MAX_SKIP = 2;
export const LOOSE_MATCH_MIN_CONSUMED = 3;

/** Matched words on the current page (after landing on it) beyond which the
 *  identification is considered confirmed — the recitation has tracked well
 *  past the shared phrasing any near-duplicate could explain. Before this
 *  point, a re-search that resolves to a different page is treated as
 *  correcting a wrong landing (mutashabihat) and relocates; after it, it
 *  means the reciter deliberately moved to another passage, and the session
 *  stops instead of chasing them around the mushaf. */
export const ESTABLISHED_WORDS_ON_PAGE = 15;

/** Stop capturing after this long with no recognized speech — the user has
 *  stopped reciting, so there's no point holding the mic open. */
export const SILENCE_TIMEOUT_MS = 10000;

/** Canonical order: negative when `a` is before `b`, 0 when equal. */
export function cmpPos(a: RecitePosition, b: RecitePosition): number {
  return a.sura - b.sura || a.aya - b.aya || a.wordIndex - b.wordIndex;
}

/** The position one revealed word after `pos` within `verses`, crossing into
 *  the next verse when the current one is fully revealed. Past the last
 *  loaded verse it synthesizes the past-page marker `applyPosition`
 *  understands; returns null only when `pos`'s verse isn't in `verses`. */
export function nextWordPosition(
  verses: Verse[],
  pos: RecitePosition,
): RecitePosition | null {
  const idx = verses.findIndex((v) => v.sura === pos.sura && v.aya === pos.aya);
  if (idx === -1) return null;
  if (pos.wordIndex < verseWordCount(verses[idx])) {
    return { sura: pos.sura, aya: pos.aya, wordIndex: pos.wordIndex + 1 };
  }
  const next = verses[idx + 1];
  if (next) return { sura: next.sura, aya: next.aya, wordIndex: 1 };
  return { sura: pos.sura, aya: pos.aya + 1, wordIndex: 1 };
}

export interface MatchOutcome {
  position: RecitePosition;
  consumed: number;
}

/** Word-count guard applied to every "did this text actually fail to
 *  match" decision — short or garbled fragments (mis-hearings, filler like
 *  "بكم"/"اه"/"نعم") must never build toward a disruptive re-search. Poor
 *  STT on the correct page should just pause the reveal, not tear the
 *  session down. */
export function usableWordCount(text: string, normalizeArabic: (s: string) => string): number {
  return normalizeArabic(text).split(" ").filter((w) => w.length > 2).length;
}
