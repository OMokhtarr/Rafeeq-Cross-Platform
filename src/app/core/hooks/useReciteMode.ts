import { useCallback, useEffect, useRef, useState } from "react";
import type { Verse } from "../../shared/models/verse.model";
import { getPage } from "../services/data/quran.service";
import {
  firstWordPosition,
  verseWordCount,
  type RecitePosition,
} from "../services/quran/recite-matcher.service";
import { SILENCE_TIMEOUT_MS, type ReciteDriverDeps } from "./recite/shared/reciteCore";
import { useRevealAnimator } from "./recite/shared/useRevealAnimator";
import { useDeepgramDriver } from "./recite/deepgram/deepgramDriver";

/**
 * USE RECITE MODE
 *
 * Orchestrates Recite Mode: listens to the mic, transcribes recitation via
 * Deepgram's live-streaming STT (./recite/deepgram/deepgramDriver.ts), and
 * fuzzy-matches the running transcript against the current (and, near the
 * bottom, next) page's verses to figure out how far the user has recited.
 * Exposes hide/reveal state in the same shape PageViewer's existing manual
 * hint system already knows how to render (`partialTarget` + a set of fully-
 * hidden verse keys), but kept entirely separate from the persisted Hifz
 * `hidden` state — this is a transient, in-session reveal that must not
 * touch `rafiq_hidden_verses_v1`.
 *
 * This hook itself only owns: session/page state, the shared position/
 * display machinery (./recite/shared/useRevealAnimator.ts — arm, manual
 * reveal buttons, and page navigation), and lifecycle (arm/disarm/start/stop).
 * Everything about *how recognized text turns into a match* — identify-phase
 * timing, re-search patience, and reveal holdback/corroboration tuning —
 * lives in ./recite/deepgram/deepgramDriver.ts + deepgram/useIdentifySession.ts,
 * which still import the position-math helpers and driver contract types
 * from ./recite/shared/reciteCore.ts and drive the shared reveal animator
 * above via the holdback amount passed to `advanceTo`.
 */

/**
 * "armed": recite mode is entered (words hidden, ready to match) but the
 *   mic is not capturing yet.
 * "recording": mic is actively capturing and chunks are being transcribed.
 */
export type ReciteStatus = "idle" | "armed" | "recording" | "mic-error";

export interface RecitePartialTarget {
  sura: number;
  aya: number;
  revealedWordCount: number;
  hiddenPositions: Set<number>;
}

export interface UseReciteModeResult {
  status: ReciteStatus;
  /** Verse keys ("sura:aya") on the current page that are fully hidden (not yet reached). */
  reciteHidden: Set<string>;
  /** Word-level reveal state for the verse currently being recited, or undefined. */
  recitePartialTarget: RecitePartialTarget | undefined;
  micError: string | null;
  /** Seconds elapsed since the current recording started, ticking once per second. 0 when not recording. */
  recordingSeconds: number;
  /** Text recognized from the most recently transcribed chunk. */
  lastChunkText: string;
  /** True once several chunks in a row contained speech that didn't match the expected page/verse. */
  noMatchHint: boolean;
  /** True while recording has started but the starting verse hasn't been located yet. */
  identifying: boolean;
  /** True while the whole-page reveal override is active (toggled by the hide button). */
  showingAll: boolean;
  /** Toggles between showing the whole page and showing only what's been revealed by recitation so far. */
  toggleShowAll: () => void;
  /** Manually advances the reveal position by one word, as if it had just been recited. */
  revealNextWord: () => void;
  /** Manually advances the reveal position to the end of the current verse (or the start of the next). */
  revealNextVerse: () => void;
  /** Enter recite mode: hides page words and gets matching state ready, but does not start the mic. */
  arm: (page: number, verses: Verse[]) => void;
  /** Exit recite mode entirely: stops any recording and clears all reveal state. */
  disarm: () => void;
  /** Start mic capture while armed. */
  startRecording: () => void;
  /** Stop mic capture without leaving recite mode. */
  stopRecording: () => void;
  /**
   * Called when PageViewer's own page-load effect lands on a new page while
   * recite mode is still active (i.e. after `onAdvancePage` triggered a
   * `setCurrentPage`). Keeps the session's verse list in sync with the
   * newly-rendered page without resetting the already-matched position.
   */
  syncPage: (page: number, verses: Verse[]) => void;
}

function verseKey(sura: number, aya: number) {
  return `${sura}:${aya}`;
}

/** Verse keys strictly after `pos.sura:pos.aya` within `verses` (the active verse itself excluded). */
function keysAfterPosition(verses: Verse[], pos: RecitePosition): Set<string> {
  const keys = new Set<string>();
  for (const v of verses) {
    if (v.sura === pos.sura && v.aya === pos.aya) continue;
    const isBefore = v.sura < pos.sura || (v.sura === pos.sura && v.aya < pos.aya);
    if (!isBefore) keys.add(verseKey(v.sura, v.aya));
  }
  return keys;
}

/** Positions of `activeVerse`'s words not yet reached by `wordIndex`. */
function unrevealedWordPositions(activeVerse: Verse, wordIndex: number): Set<number> {
  const words = (activeVerse.words ?? []).filter((w) => w.charType === "end");
  const positions = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    if (i >= wordIndex) positions.add(words[i].position);
  }
  return positions;
}

export function useReciteMode(
  onAdvancePage: (fromPage: number) => void,
  onNavigateToPage: (page: number) => void,
): UseReciteModeResult {
  const [status, setStatus] = useState<ReciteStatus>("idle");
  const [reciteHidden, setReciteHidden] = useState<Set<string>>(new Set());
  const [recitePartialTarget, setRecitePartialTarget] = useState<
    RecitePartialTarget | undefined
  >(undefined);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastChunkText, setLastChunkText] = useState("");
  const [showingAll, setShowingAll] = useState(false);
  const [noMatchHint, setNoMatchHint] = useState(false);
  const [identifying, setIdentifying] = useState(false);

  // Mutable session state — avoids re-subscribing driver callbacks on every match.
  const versesRef = useRef<Verse[]>([]);
  const pageRef = useRef<number>(0);
  const nextPageVersesRef = useRef<Verse[] | null>(null);
  // True once armed (recite mode entered), independent of whether the mic is recording.
  const activeRef = useRef(false);
  // True only while the mic is actively capturing.
  const recordingRef = useRef(false);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Timestamp (ms) of the last chunk that produced real transcript text —
  // drives the "stopped talking" auto-stop.
  const lastSpeechAtRef = useRef(0);
  // Holds the latest stopRecording — lets the silence timer and driver
  // error callbacks auto-stop without a forward reference to a function
  // declared later.
  const stopRecordingRef = useRef<() => void>(() => {});
  // Holds the driver's .stop() — stopRecording needs to stop it, but the
  // driver itself is constructed from driverDeps.stopRecording (via
  // stopRecordingRef above), so it can't be constructed before stopRecording
  // exists. Broken via the same ref-indirection pattern as stopRecordingRef.
  const driverStopRef = useRef<() => void>(() => {});

  // Position has moved past the last verse on this page (matched across the
  // page boundary within one chunk) — reveal the whole page and ask
  // PageViewer to advance; syncPage() re-derives state once the new page's
  // verses land.
  const advancePastPage = useCallback(
    (verses: Verse[], pos: RecitePosition) => {
      const last = verses[verses.length - 1];
      const isAfterPage =
        pos.sura > last.sura || (pos.sura === last.sura && pos.aya > last.aya);
      if (!isAfterPage) return false;
      setReciteHidden(new Set());
      setRecitePartialTarget(undefined);
      onAdvancePage(pageRef.current);
      return true;
    },
    [onAdvancePage],
  );

  const applyPosition = useCallback(
    (verses: Verse[], pos: RecitePosition) => {
      if (!verses.length) return;

      const activeVerse = verses.find(
        (v) => v.sura === pos.sura && v.aya === pos.aya,
      );
      if (!activeVerse) {
        advancePastPage(verses, pos);
        return;
      }

      setReciteHidden(keysAfterPosition(verses, pos));
      setRecitePartialTarget({
        sura: pos.sura,
        aya: pos.aya,
        revealedWordCount: pos.wordIndex,
        hiddenPositions: unrevealedWordPositions(activeVerse, pos.wordIndex),
      });
    },
    [advancePastPage],
  );

  const hideWholePage = useCallback((verses: Verse[]) => {
    setReciteHidden(new Set(verses.map((v) => verseKey(v.sura, v.aya))));
    setRecitePartialTarget(undefined);
  }, []);

  const toggleShowAll = useCallback(() => {
    setShowingAll((v) => !v);
  }, []);

  const getCombinedVerses = useCallback(
    () =>
      nextPageVersesRef.current
        ? [...versesRef.current, ...nextPageVersesRef.current]
        : versesRef.current,
    [],
  );

  const reveal = useRevealAnimator({
    isActive: () => activeRef.current,
    getCombinedVerses,
    getPageVerses: () => versesRef.current,
    applyPosition,
  });

  // Moves the reveal position to the verse after `activeIndex` (or, if it
  // was the last verse on the page, synthesizes a position that satisfies
  // applyPosition's "past the last verse" check to trigger the
  // page-advance flow via advancePastPage).
  const advanceToNextVerse = useCallback(
    (verses: Verse[], activeIndex: number, activePos: RecitePosition) => {
      const nextVerse = verses[activeIndex + 1];
      const nextPos: RecitePosition = nextVerse
        ? firstWordPosition(nextVerse)
        : { sura: activePos.sura, aya: activePos.aya + 1, wordIndex: 0 };
      reveal.reset(nextPos);
      applyPosition(verses, nextPos);
    },
    [applyPosition, reveal],
  );

  // Manually advances the reveal position by one word — same effect as if
  // that word had just been recited, so subsequent speech matching picks up
  // seamlessly from the new position. Once the active verse is fully
  // revealed, further calls advance into the next verse (matches the
  // manual Hifz reveal-next-word control's behavior).
  const revealNextWord = useCallback(() => {
    if (!activeRef.current) return;
    const pos = reveal.getTruePosition();
    if (!pos) return;
    const verses = versesRef.current;
    const activeIndex = verses.findIndex((v) => v.sura === pos.sura && v.aya === pos.aya);
    if (activeIndex === -1) return;

    const total = verseWordCount(verses[activeIndex]);
    if (pos.wordIndex < total) {
      const nextPos: RecitePosition = { sura: pos.sura, aya: pos.aya, wordIndex: pos.wordIndex + 1 };
      reveal.reset(nextPos);
      applyPosition(verses, nextPos);
      return;
    }

    advanceToNextVerse(verses, activeIndex, pos);
  }, [applyPosition, advanceToNextVerse, reveal]);

  // Manually advances the reveal position to the end of the active verse
  // (if not already there) or into the verse after it — mirrors the manual
  // Hifz reveal-next-verse control's "finish current verse before moving on."
  const revealNextVerse = useCallback(() => {
    if (!activeRef.current) return;
    const pos = reveal.getTruePosition();
    if (!pos) return;
    const verses = versesRef.current;
    const activeIndex = verses.findIndex((v) => v.sura === pos.sura && v.aya === pos.aya);
    if (activeIndex === -1) return;

    const total = verseWordCount(verses[activeIndex]);
    if (pos.wordIndex < total) {
      const nextPos: RecitePosition = { sura: pos.sura, aya: pos.aya, wordIndex: total };
      reveal.reset(nextPos);
      applyPosition(verses, nextPos);
      return;
    }

    advanceToNextVerse(verses, activeIndex, pos);
  }, [applyPosition, advanceToNextVerse, reveal]);

  // Best-effort prefetch of the page after `page`, for cross-page
  // continuation matching. Stores into nextPageVersesRef only if the
  // session is still active and hasn't since moved to another page.
  const prefetchNextPage = useCallback((page: number) => {
    getPage(page + 1)
      .then((nextVerses) => {
        if (activeRef.current && pageRef.current === page) {
          nextPageVersesRef.current = nextVerses;
        }
      })
      .catch(() => {});
  }, []);

  const touchLastSpeechAt = useCallback(() => {
    lastSpeechAtRef.current = Date.now();
  }, []);

  const stopRecording = useCallback(() => {
    if (!recordingRef.current) return;
    recordingRef.current = false;
    driverStopRef.current();
    if (durationTimerRef.current !== null) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    setRecordingSeconds(0);
    setIdentifying(false);
    // Deliberately NOT flushed to the matcher's position: the matcher's
    // newest words are exactly the ones that may be an STT hallucination
    // over trailing silence (a session usually ends with silence), and
    // revealing unrecited words is the one thing this mode must never do.
    // The held word or two — if genuinely recited — is a tap on the reveal
    // button away.
    reveal.stop();
    // Recording no longer owns the page's visibility (the toolbar falls
    // back to the persisted Hifz hide state once armed) — clear recite's
    // own hidden/partial state so it can't linger stale into the next
    // recording, and reset the toggle so the eye icon matches the
    // now-visible page instead of showing "hidden" from mid-recitation.
    setReciteHidden(new Set());
    setRecitePartialTarget(undefined);
    setShowingAll(false);
    if (activeRef.current) setStatus("armed");
  }, [reveal]);
  stopRecordingRef.current = stopRecording;

  const driverDeps: ReciteDriverDeps = {
    isActive: () => activeRef.current,
    isRecording: () => recordingRef.current,
    getPage: () => pageRef.current,
    setPage: (page) => {
      pageRef.current = page;
    },
    getPageVerses: () => versesRef.current,
    setPageVerses: (verses) => {
      versesRef.current = verses;
    },
    clearNextPageVerses: () => {
      nextPageVersesRef.current = null;
    },
    getCombinedVerses,
    applyPosition,
    hideWholePage,
    reveal,
    onNavigateToPage,
    prefetchNextPage,
    setIdentifying,
    setLastChunkText: (text) => setLastChunkText(text),
    setNoMatchHint,
    touchLastSpeechAt,
    stopRecording: () => stopRecordingRef.current(),
  };

  const deepgramDriver = useDeepgramDriver(driverDeps);
  driverStopRef.current = deepgramDriver.stop;

  const clearDurationTimer = useCallback(() => {
    if (durationTimerRef.current !== null) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const arm = useCallback(
    (page: number, verses: Verse[]) => {
      activeRef.current = true;
      pageRef.current = page;
      versesRef.current = verses;
      nextPageVersesRef.current = null;
      reveal.reset(verses.length ? firstWordPosition(verses[0]) : null);
      // Populate the hidden set so the hide button has something to reveal
      // against, but start *shown*: arming (before recording) must not hide
      // the page — visibility is the hide/show button's job until the user
      // actually starts reciting.
      hideWholePage(verses);
      setShowingAll(true);
      setLastChunkText("");
      setNoMatchHint(false);
      setStatus("armed");
      prefetchNextPage(page);
    },
    [hideWholePage, prefetchNextPage, reveal],
  );

  const startRecording = useCallback(() => {
    if (!activeRef.current || recordingRef.current) return;
    recordingRef.current = true;
    setLastChunkText("");
    setRecordingSeconds(0);
    setNoMatchHint(false);
    setIdentifying(true);
    // Starting to recite: hide the page and reveal word-by-word as matched.
    reveal.reset(versesRef.current.length ? firstWordPosition(versesRef.current[0]) : null);
    hideWholePage(versesRef.current);
    setShowingAll(false);
    setStatus("recording");
    lastSpeechAtRef.current = Date.now();

    deepgramDriver.start();

    durationTimerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
      // Auto-stop if the user has gone quiet — no recognized speech for a
      // while means they've stopped reciting.
      if (Date.now() - lastSpeechAtRef.current >= SILENCE_TIMEOUT_MS) {
        stopRecordingRef.current();
      }
    }, 1000);
  }, [deepgramDriver, hideWholePage, reveal]);

  const syncPage = useCallback(
    (page: number, verses: Verse[]) => {
      if (!activeRef.current || pageRef.current === page) return;
      pageRef.current = page;
      versesRef.current = verses;
      nextPageVersesRef.current = null;

      // If the matched position isn't actually on this new page (matching
      // hasn't reached it yet — shouldn't normally happen since we only
      // advance once the previous page's last verse is fully matched, but
      // guard anyway), fall back to the new page's first word. Same
      // reconciliation for the display position: keep it (and any running
      // reveal animation state) when it's already on this page, otherwise
      // snap it to the matcher's position.
      const fallback = verses.length ? firstWordPosition(verses[0]) : null;
      const pos = reveal.getTruePosition();
      const posOnPage =
        pos && verses.some((v) => v.sura === pos.sura && v.aya === pos.aya);
      const dPos = reveal.getDisplayPosition();
      const dOnPage =
        dPos && verses.some((v) => v.sura === dPos.sura && v.aya === dPos.aya);

      reveal.reconcile(posOnPage ? null : fallback, dOnPage ? null : (posOnPage ? pos : fallback));

      const displayPos = reveal.getDisplayPosition();
      if (displayPos) applyPosition(verses, displayPos);
      else hideWholePage(verses);

      prefetchNextPage(page);
    },
    [applyPosition, hideWholePage, prefetchNextPage, reveal],
  );

  const disarm = useCallback(() => {
    activeRef.current = false;
    recordingRef.current = false;
    deepgramDriver.stop();
    clearDurationTimer();
    reveal.reset(null);
    setReciteHidden(new Set());
    setRecitePartialTarget(undefined);
    setRecordingSeconds(0);
    setLastChunkText("");
    setNoMatchHint(false);
    setShowingAll(false);
    setIdentifying(false);
    setStatus("idle");
  }, [clearDurationTimer, deepgramDriver, reveal]);

  const micError = deepgramDriver.micError;
  useEffect(() => {
    if (micError) setStatus("mic-error");
  }, [micError]);

  // Stop cleanly on unmount (navigating away mid-recitation). Driver stops
  // are read via driverStopRef (kept current above) so this effect doesn't
  // need to depend on the (stable but hook-identity-changing) driver objects.
  useEffect(() => {
    return () => {
      activeRef.current = false;
      recordingRef.current = false;
      clearDurationTimer();
      driverStopRef.current();
    };
  }, [clearDurationTimer]);

  return {
    status,
    reciteHidden,
    recitePartialTarget,
    micError,
    recordingSeconds,
    lastChunkText,
    noMatchHint,
    identifying,
    showingAll,
    toggleShowAll,
    revealNextWord,
    revealNextVerse,
    arm,
    disarm,
    startRecording,
    stopRecording,
    syncPage,
  };
}
