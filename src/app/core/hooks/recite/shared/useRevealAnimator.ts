/**
 * REVEAL ANIMATOR — engine-agnostic word-by-word display driver.
 *
 * Deliberately NOT forked per engine (unlike useIdentifySession, which each
 * engine folder has its own copy of): arm(), the manual reveal buttons, and
 * page navigation in useReciteMode.ts all need one true position regardless
 * of which STT engine is active, so this instance is constructed once and
 * shared between both drivers.
 *
 * What IS tunable per engine without touching this file: each driver feeds
 * a "matcher advanced to position X" event in via `advanceTo(pos,
 * holdbackWords)`, passing its own holdback word count, and decides
 * independently *when* to call `confirm()` — that covers every behavior
 * difference described so far (Groq's 2-word chunk-overlap corroboration
 * vs. Deepgram's 1-word final-settles corroboration). Only reach for a
 * change here if the *display/animation mechanism itself* needs to differ
 * per engine, not just its holdback/confirm timing — and if so, prefer
 * adding a new parameter (like `holdbackWords`) over forking this file, so
 * arm/manual-reveal/syncPage don't have to learn about two animators.
 */

import { useCallback, useRef } from "react";
import type { Verse } from "../../../../shared/models/verse.model";
import { cmpPos, nextWordPosition, type RecitePosition } from "./reciteCore";

/** Newly-matched words are not revealed as one batch: the display trails
 *  the matcher and uncovers one word per step, so even a several-second
 *  chunk still *shows* as a word-by-word flow. The matcher's own position
 *  is never delayed by this — only what's on screen. */
const WORD_REVEAL_STEP_MS = 160;

/** The holdback only waits this long. A revised interim changes its last
 *  word within a few hundred ms, so a word that stays the matcher's newest
 *  for this long was really said and is shown without waiting for the next
 *  word (a whole word late in slow recitation) or for the phrase's final
 *  (which comes only after the reciter pauses). */
const HOLDBACK_RELEASE_MS = 300;

export interface RevealAnimatorDeps {
  /** True while recite mode is armed/recording at all. */
  isActive: () => boolean;
  /** The page's verses, plus the next page's once prefetched — the range
   *  the animator is allowed to step across. */
  getCombinedVerses: () => Verse[];
  /** The page's own verses (not combined) — what applyPosition renders
   *  against; matches the boundary rules the rest of recite mode uses. */
  getPageVerses: () => Verse[];
  applyPosition: (verses: Verse[], pos: RecitePosition) => void;
}

export interface RevealAnimator {
  /** The matcher's true position (not the displayed one). */
  getTruePosition: () => RecitePosition | null;
  /** What's currently on screen. */
  getDisplayPosition: () => RecitePosition | null;
  /** Furthest position corroborated (see each driver) — words at or before
   *  it skip the holdback margin entirely. */
  getConfirmedPosition: () => RecitePosition | null;
  /** Hard-resets true+display+confirmed to `pos` (or clears to null) and
   *  stops any running animation. Used on arm/start/stop/disarm and manual
   *  reveal jumps, where the change must be instantaneous. */
  reset: (pos: RecitePosition | null) => void;
  /** Reconciles true/display positions to a page that just loaded under the
   *  session (syncPage) without disturbing confirmed/holdback state when
   *  the existing positions are still valid on the new page. Pass `null`
   *  for either to leave it as-is. */
  reconcile: (truePos: RecitePosition | null, displayPos: RecitePosition | null) => void;
  /** Advances the true position immediately (matching/prompts must not
   *  wait for the animation) and lets the display catch up word by word,
   *  respecting `holdbackWords` until `confirm` releases it or the position
   *  has stood for HOLDBACK_RELEASE_MS. A rewind
   *  (correction, true position moves backward) renders instantly instead
   *  of trickling, but never below the confirmed position: words the reciter
   *  truly said stay on screen when they restart, and only words beyond it
   *  (an interim retracting unconfirmed ones) are hidden. */
  advanceTo: (pos: RecitePosition, holdbackWords: number) => void;
  /** Marks everything up to `pos` as corroborated — the animator may reveal
   *  up to that point with no holdback margin. Called by each driver on its
   *  own corroboration signal (see groqDriver/deepgramDriver). */
  confirm: (pos: RecitePosition) => void;
  /** True landing on a page with words already known-recited (the identify
   *  buffer replay): everything from `landing` up to `pos` was already
   *  recited (it's what identified the page), so it's revealed instantly as
   *  one batch rather than trickled word-by-word — a word-by-word crawl
   *  through text the reciter already spoke reads as lag and is misleading.
   *  Normal word-by-word flow resumes from `pos` on the next `advanceTo`.
   *  When `samePage` is true (re-landing on the page already shown) the
   *  display never moves below the current confirmed position. */
  landOnPage: (
    verses: Verse[],
    landing: RecitePosition,
    pos: RecitePosition,
    samePage: boolean,
  ) => void;
  stop: () => void;
}

export function useRevealAnimator(deps: RevealAnimatorDeps): RevealAnimator {
  const positionRef = useRef<RecitePosition | null>(null);
  const displayPosRef = useRef<RecitePosition | null>(null);
  const confirmedPosRef = useRef<RecitePosition | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdbackRef = useRef(0);
  // When the true position last moved (Date.now() ms) — how long its newest
  // words have been held back.
  const targetSinceRef = useRef(0);

  const stop = useCallback(() => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** Reveals at most one more word; false once there is nothing to reveal. */
  const step = useCallback((): boolean => {
    const target = positionRef.current;
    const display = displayPosRef.current;
    if (!deps.isActive() || !target || !display || cmpPos(display, target) >= 0) return false;
    const combined = deps.getCombinedVerses();
    const next = nextWordPosition(combined, display);
    // If the display position got orphaned (page changed under it), snap
    // to the target instead of stalling.
    if (!next || cmpPos(next, target) > 0) {
      displayPosRef.current = target;
      deps.applyPosition(deps.getPageVerses(), target);
      return false;
    }
    // Words already corroborated are certainly real — reveal them with no
    // holdback margin. Beyond that, hold the matcher's newest words back
    // until confirm() releases them, the target moves further, they outlast
    // HOLDBACK_RELEASE_MS, or a rewind clears them (they were never said).
    const confirmed = confirmedPosRef.current;
    const fresh = Date.now() - targetSinceRef.current < HOLDBACK_RELEASE_MS;
    if (fresh && (!confirmed || cmpPos(next, confirmed) > 0)) {
      let probe: RecitePosition | null = next;
      for (let i = 0; i < holdbackRef.current && probe; i++) {
        probe = nextWordPosition(combined, probe);
      }
      // Keep ticking: the hold runs out on a later step.
      if (!probe || cmpPos(probe, target) > 0) return true;
    }
    displayPosRef.current = next;
    deps.applyPosition(deps.getPageVerses(), next);
    return cmpPos(next, target) < 0;
  }, [deps]);

  const ensureTimer = useCallback(() => {
    if (timerRef.current !== null) return;
    // The first word shows now; only the words after it trickle.
    if (!step()) return;
    timerRef.current = setInterval(() => {
      if (!step()) stop();
    }, WORD_REVEAL_STEP_MS);
  }, [step, stop]);

  const reset = useCallback(
    (pos: RecitePosition | null) => {
      stop();
      positionRef.current = pos;
      displayPosRef.current = pos;
      confirmedPosRef.current = null;
    },
    [stop],
  );

  const reconcile = useCallback(
    (truePos: RecitePosition | null, displayPos: RecitePosition | null) => {
      stop();
      if (truePos !== null) positionRef.current = truePos;
      if (displayPos !== null) displayPosRef.current = displayPos;
    },
    [stop],
  );

  const advanceTo = useCallback(
    (pos: RecitePosition, holdbackWords: number) => {
      const display = displayPosRef.current;
      if (!positionRef.current || cmpPos(pos, positionRef.current) !== 0) {
        targetSinceRef.current = Date.now();
      }
      positionRef.current = pos;
      holdbackRef.current = holdbackWords;
      if (display && cmpPos(pos, display) >= 0) {
        ensureTimer();
        return;
      }
      // Rewinding: words corroborated by a final were truly said, so a
      // restart behind them hides nothing and leaves confirmed alone. Only
      // words beyond confirmed (an interim that retracted) are hidden.
      const confirmed = confirmedPosRef.current;
      const shown = confirmed && cmpPos(confirmed, pos) > 0 ? confirmed : pos;
      stop();
      displayPosRef.current = shown;
      deps.applyPosition(deps.getPageVerses(), shown);
    },
    [deps, ensureTimer, stop],
  );

  const confirm = useCallback(
    (pos: RecitePosition) => {
      if (!confirmedPosRef.current || cmpPos(pos, confirmedPosRef.current) > 0) {
        confirmedPosRef.current = pos;
      }
      // Restarted so the released word shows now rather than on the next
      // step of a timer that may be running.
      const display = displayPosRef.current;
      if (display && cmpPos(display, pos) < 0) {
        stop();
        ensureTimer();
      }
    },
    [ensureTimer, stop],
  );

  const landOnPage = useCallback(
    (verses: Verse[], landing: RecitePosition, pos: RecitePosition, samePage: boolean) => {
      stop();
      // Everything between landing and pos was already recited (it's what
      // identified this page), so reveal the whole span at once by rendering
      // directly at pos — no word-by-word trickle through text the reciter
      // already said. `pos` itself is corroborated for the same reason, so
      // the reveal that continues from here isn't held back on already-spoken
      // words. The gap is never negative (pos >= landing always), but guard
      // anyway and fall back to landing if it somehow is.
      const target = cmpPos(pos, landing) >= 0 ? pos : landing;
      // Re-landing on the page already shown (the reciter went back): what
      // was confirmed there stays revealed instead of vanishing.
      const confirmed = confirmedPosRef.current;
      const shown = samePage && confirmed && cmpPos(confirmed, target) > 0 ? confirmed : target;
      displayPosRef.current = shown;
      positionRef.current = target;
      confirmedPosRef.current = shown;
      deps.applyPosition(verses, shown);
    },
    [deps, stop],
  );

  return {
    getTruePosition: () => positionRef.current,
    getDisplayPosition: () => displayPosRef.current,
    getConfirmedPosition: () => confirmedPosRef.current,
    reset,
    reconcile,
    advanceTo,
    confirm,
    landOnPage,
    stop,
  };
}
