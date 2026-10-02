/**
 * DEEPGRAM DRIVER — live-streaming Recite Mode engine.
 *
 * Owns everything specific to the Deepgram websocket pipeline: opening the
 * stream, handling interim/final events, and the reveal holdback tuned for
 * streaming's failure mode (a settling window's *last* word can still be
 * revised, so the newest matched word is held back by one until the window
 * settles).
 *
 * Matching itself lives in the recite aligner
 * (services/quran/recite-aligner.service.ts): every interim of a phrase is
 * aligned from the same committed state — so each spoken word is used once —
 * and a final commits it. The aligner decides which words were said, missed
 * or said wrongly; missed and wrong words come back as marks (red words).
 *
 * Owns its own `useIdentifySession` instance, since only one driver is ever
 * active per recording session.
 */

import { useCallback, useRef, useState } from "react";
import {
  openSttStream,
  type SttStreamEvent,
  type SttStreamHandle,
} from "../../../services/audio/speech-to-text-stream.service";
import { normalizeArabic } from "../../../services/quran/recite-matcher.service";
import {
  RESUME_MIN_SAID,
  createReciteTracker,
  formatAlignLog,
  spokenWordsFrom,
  type ReciteTracker,
  type TrackerState,
} from "../../../services/quran/recite-aligner.service";
import {
  cmpPos,
  usableWordCount,
  type RecitePosition,
  type ReciteDriver,
  type ReciteDriverDeps,
} from "../shared/reciteCore";
import { useIdentifySession } from "./useIdentifySession";

/** Consecutive mismatched segments before flagging `noMatchHint` / giving up
 *  and re-searching. Interims count toward the streak too (throttled to one
 *  per MISMATCH_INTERIM_THROTTLE_MS below), so the same *count* of
 *  mismatches represents a short span of real time; without the higher
 *  re-search count, a couple of garbled interim revisions mid-utterance
 *  could trigger a re-search almost instantly. */
const NO_MATCH_HINT_STREAK = 3;
const NO_MATCH_REIDENTIFY_STREAK = 6;

/** Holdback while the streaming engine is driving. Streamed interims don't
 *  hallucinate a continuation — the only instability is that a window's last
 *  word may still be revised — so one word of margin suffices, and each
 *  final releases it. */
const STREAM_REVEAL_HOLDBACK_WORDS = 1;

/** Minimum gap between whole-Quran identify searches while accumulating
 *  interim text. Deepgram can emit several interim revisions per second;
 *  re-scoring the whole corpus on every single one is wasted work since
 *  consecutive interims usually differ by a word or less. Finals (which
 *  settle a window) always search immediately regardless of this gap. */
const IDENTIFY_INTERIM_THROTTLE_MS = 400;

/** Same throttle, applied to interim-driven wrong-page detection — see
 *  handleStreamEvent's mismatch counting below. */
const MISMATCH_INTERIM_THROTTLE_MS = 400;

export function useDeepgramDriver(deps: ReciteDriverDeps): ReciteDriver {
  const [micError, setMicError] = useState<string | null>(null);
  const streamHandleRef = useRef<SttStreamHandle | null>(null);
  const noMatchStreakRef = useRef(0);
  const recentTextsRef = useRef<string[]>([]);
  // The phrase tracker for the page being recited; null until the first
  // landing (identify phase).
  const trackerRef = useRef<ReciteTracker | null>(null);
  // Per-word confidences of the event being handled — tryResume (called by
  // the identify session with that event's text) reads them from here.
  const eventWordsRef = useRef<SttStreamEvent["words"]>(undefined);
  // Throttle clocks (Date.now() ms) for interim-driven identify/mismatch
  // checks — see the two constants above.
  const lastIdentifyAttemptAtRef = useRef(0);
  const lastMismatchCheckAtRef = useRef(0);
  // The exact text last sent to findVerseByStartingPhrase during identify —
  // an interim that repeats the same words as the last attempt (very common
  // since interims of the same utterance overlap heavily) is skipped even
  // if the throttle window has passed, since re-scoring unchanged text can
  // only produce the same outcome.
  const lastIdentifyTextRef = useRef("");

  // Shows an aligned state: the red words, and the reveal moved to its
  // cursor (forward word by word with the holdback, or snapped back when a
  // revised interim retracted a word).
  const showState = useCallback(
    (state: TrackerState) => {
      deps.setMarks(state.marks);
      const truePos = deps.reveal.getTruePosition();
      if (!truePos || cmpPos(state.cursor, truePos) !== 0) {
        deps.reveal.advanceTo(state.cursor, STREAM_REVEAL_HOLDBACK_WORDS);
      }
    },
    [deps],
  );

  const identify = useIdentifySession({
    isActive: deps.isActive,
    isRecording: deps.isRecording,
    getPage: deps.getPage,
    setPage: deps.setPage,
    getPageVerses: deps.getPageVerses,
    setPageVerses: deps.setPageVerses,
    clearNextPageVerses: deps.clearNextPageVerses,
    getCombinedVerses: deps.getCombinedVerses,
    reveal: deps.reveal,
    hideWholePage: deps.hideWholePage,
    applyPosition: deps.applyPosition,
    onNavigateToPage: deps.onNavigateToPage,
    prefetchNextPage: deps.prefetchNextPage,
    setIdentifying: deps.setIdentifying,
    setNoMatchHint: deps.setNoMatchHint,
    // Streaming has no chunk cadence to switch — one continuous socket
    // carries both phases.
    onSwitchToTracking: () => {},
    tryResume: (text, isFinal) => {
      const tracker = trackerRef.current;
      if (!tracker) return 0;
      const spoken = spokenWordsFrom(text, eventWordsRef.current);
      const verses = deps.getCombinedVerses();
      // Probe without committing — only a strong in-place match resumes.
      const probe = tracker.onPartial(spoken, verses);
      if (probe.newSaid < RESUME_MIN_SAID) return 0;
      const result = isFinal ? tracker.onFinal(spoken, verses) : probe;
      showState(result.state);
      if (isFinal) deps.reveal.confirm(result.state.cursor);
      return result.newSaid;
    },
    getTrackerState: () => trackerRef.current?.committed() ?? null,
    onLanded: (state) => {
      trackerRef.current = state ? createReciteTracker(state) : null;
      if (state) deps.setMarks(state.marks);
    },
    resetMismatchStreak: () => {
      noMatchStreakRef.current = 0;
    },
    stopRecording: deps.stopRecording,
  });

  // Every Results frame lands here. Interims are cumulative revisions of
  // the current utterance window, arriving a few hundred ms behind the
  // voice — they drive both the near-live reveal AND the identify search and
  // wrong-page detection, throttled so the whole-Quran scorer isn't re-run
  // on every single revision. A final settles the window: it commits the
  // tracker, releases the reveal holdback, and always triggers an immediate,
  // unthrottled check.
  const handleStreamEvent = useCallback(
    (event: SttStreamEvent) => {
      if (!deps.isActive() || !deps.isRecording()) return;
      const text = event.text.trim();
      if (text) {
        deps.setLastChunkText(text);
        deps.touchLastSpeechAt();
      }
      eventWordsRef.current = event.words;

      if (identify.isIdentifying()) {
        if (!text) return;
        const now = Date.now();
        const dueByTime =
          now - lastIdentifyAttemptAtRef.current >= IDENTIFY_INTERIM_THROTTLE_MS;
        const textChanged = text !== lastIdentifyTextRef.current;
        // Finals always run (they're the settled, final word of a phrase);
        // interims run only when both the throttle window has passed AND
        // the text actually changed since the last attempt — an unchanged
        // interim can only re-produce the same search outcome.
        if (event.isFinal || (dueByTime && textChanged)) {
          lastIdentifyAttemptAtRef.current = now;
          lastIdentifyTextRef.current = text;
          void identify.handleIdentifyChunk(text, event.isFinal);
        }
        return;
      }

      const tracker = trackerRef.current;
      if (!tracker) return;
      if (!text && !event.isFinal) return;
      const verses = deps.getCombinedVerses();
      const spoken = spokenWordsFrom(text, event.words);
      const result = event.isFinal ? tracker.onFinal(spoken, verses) : tracker.onPartial(spoken, verses);
      // Also on an empty final: it settles the window at the committed
      // state, retracting anything an interim showed that the final dropped.
      showState(result.state);

      if (event.isFinal) {
        // The window settled: its words are confirmed speech — release them
        // from the holdback.
        deps.reveal.confirm(result.state.cursor);
        if (result.newSaid > 0) identify.addWordsSinceLanding(result.newSaid);
        if (text) console.log(`[recite-align] ${formatAlignLog(result)}`);
      }

      // Any correctly said word means the reciter is on this text (a restart
      // over already-revealed words included) — not a mismatch.
      if (result.saidTotal > 0) {
        noMatchStreakRef.current = 0;
        recentTextsRef.current = [];
        deps.setNoMatchHint(false);
        return;
      }

      // No match. A final always counts as one mismatch tick. An interim
      // counts too — throttled, so a long unmatching utterance doesn't wait
      // for its own final to start building the wrong-page streak — but only
      // once its text has enough real words to be meaningful and the
      // throttle window has passed, so it isn't scored many times a second.
      if (!text) return;
      if (usableWordCount(text, normalizeArabic) < 3) return;
      if (!event.isFinal) {
        const now = Date.now();
        if (now - lastMismatchCheckAtRef.current < MISMATCH_INTERIM_THROTTLE_MS) return;
        lastMismatchCheckAtRef.current = now;
      }

      // Tracking-phase mismatches are otherwise silent — the reveal just
      // freezes. Surface which final failed to match, and where tracking was.
      if (event.isFinal) {
        const stuckAt = tracker.committed().cursor;
        console.log(
          `[recite-track] no match: "${text}" (stuck at ${stuckAt.sura}:${stuckAt.aya}, ` +
            `streak ${noMatchStreakRef.current + 1})`,
        );
      }

      recentTextsRef.current = [...recentTextsRef.current, text].slice(-3);
      noMatchStreakRef.current += 1;
      if (noMatchStreakRef.current >= NO_MATCH_REIDENTIFY_STREAK) {
        // Fresh identify phase starting now — the seed text below is new,
        // so the interim-identify throttle must not carry over stale state
        // from before (it would otherwise block the very first search of
        // the re-search until the old throttle window happens to elapse).
        lastIdentifyAttemptAtRef.current = 0;
        lastIdentifyTextRef.current = "";
        identify.reidentify(recentTextsRef.current.join(" "));
        recentTextsRef.current = [];
      } else if (noMatchStreakRef.current >= NO_MATCH_HINT_STREAK) {
        deps.setNoMatchHint(true);
      }
    },
    [deps, identify, showState],
  );

  const start = useCallback(() => {
    noMatchStreakRef.current = 0;
    recentTextsRef.current = [];
    trackerRef.current = null;
    eventWordsRef.current = undefined;
    lastIdentifyAttemptAtRef.current = 0;
    lastMismatchCheckAtRef.current = 0;
    lastIdentifyTextRef.current = "";
    setMicError(null);
    identify.startIdentifying();
    deps.setIdentifying(true);
    // Streaming engine: one continuous socket, words arrive near-live. No
    // speech gate or chunk cadence needed — leading silence just streams
    // until the silence timeout ends the session.
    openSttStream(handleStreamEvent, (message) => {
      // Socket died mid-session (auth rejection, network drop) — no more
      // words will arrive, so surface it instead of sitting there.
      if (!deps.isRecording()) return;
      setMicError(message);
      deps.stopRecording();
    })
      .then((handle) => {
        if (deps.isRecording()) streamHandleRef.current = handle;
        else handle.stop();
      })
      .catch((err) => {
        setMicError(err instanceof Error ? err.message : "Microphone access denied");
        deps.stopRecording();
      });
  }, [deps, handleStreamEvent, identify]);

  const stop = useCallback(() => {
    streamHandleRef.current?.stop();
    streamHandleRef.current = null;
  }, []);

  const moveCursor = useCallback((pos: RecitePosition) => {
    const tracker = trackerRef.current;
    if (tracker) tracker.reset({ cursor: pos, marks: tracker.committed().marks });
  }, []);

  return { micError, start, stop, moveCursor };
}
