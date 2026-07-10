/**
 * DEEPGRAM DRIVER — live-streaming Recite Mode engine.
 *
 * Owns everything specific to the Deepgram websocket pipeline: opening the
 * stream, handling interim/final events, and the reveal holdback tuned for
 * streaming's failure mode (a settling window's *last* word can still be
 * revised — unlike Whisper, streamed interims don't hallucinate a
 * continuation over silence — so the holdback margin here is much smaller
 * than Groq's). Tune this file freely — it lives in its own folder,
 * entirely separate from ../groq/groqDriver.ts, and cannot affect it.
 *
 * Owns its own `useIdentifySession` instance (rather than sharing one
 * across engines) since only one driver is ever active per recording
 * session, which keeps its "switch to tracking" hook a plain no-op —
 * streaming has no chunk cadence to change.
 */

import { useCallback, useRef, useState } from "react";
import {
  openSttStream,
  type SttStreamEvent,
  type SttStreamHandle,
} from "../../../services/audio/speech-to-text-stream.service";
import { normalizeArabic } from "../../../services/quran/recite-matcher.service";
import {
  usableWordCount,
  type ReciteDriver,
  type ReciteDriverDeps,
} from "../shared/reciteCore";
// Deepgram's own copy of the tracking match — prefers a strong loose match
// over a trivial coincidental-opener strict one (see ./matchFromPosition).
// Groq keeps using the shared one in reciteCore.ts unchanged.
import { matchFromPosition } from "./matchFromPosition";
import { useIdentifySession } from "./useIdentifySession";

/** Consecutive mismatched segments before flagging `noMatchHint` / giving up
 *  and re-searching. Deepgram's own copy of this threshold (see
 *  reciteCore.ts's NO_MATCH_HINT_STREAK/NO_MATCH_REIDENTIFY_STREAK, which
 *  Groq still uses) — set higher than Groq's because interims now count
 *  toward the streak too (throttled to one per MISMATCH_INTERIM_THROTTLE_MS
 *  below), so the same *count* of mismatches represents a much shorter span
 *  of real time here; without raising it, a couple of garbled interim
 *  revisions mid-utterance could trigger a re-search almost instantly. */
const NO_MATCH_HINT_STREAK = 3;
const NO_MATCH_REIDENTIFY_STREAK = 6;

/** Holdback while the streaming engine is driving. Streamed interims don't
 *  hallucinate a continuation the way chunked Whisper does — the only
 *  instability is that a window's last word may still be revised — so one
 *  word of margin suffices, and each final releases it. */
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
  // Tracks whether any event since the last settled window advanced the
  // position — a final that never advanced anything is the streaming
  // analogue of a mismatching chunk and feeds the wrong-page logic.
  const advancedSinceFinalRef = useRef(false);
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
    // A false-alarm re-search resolved back to where tracking already was —
    // resume with the streaming holdback margin, same as a normal interim
    // match (see handleStreamEvent).
    resumeTrackingAt: (pos) => {
      deps.reveal.advanceTo(pos, STREAM_REVEAL_HOLDBACK_WORDS);
    },
    // Streaming corroborates via advancedSinceFinalRef, not a chunk-overlap
    // anchor — nothing to seed on landing.
    onLanded: () => {},
    resetMismatchStreak: () => {
      noMatchStreakRef.current = 0;
    },
    stopRecording: deps.stopRecording,
  });

  // Every Results frame lands here. Interims are cumulative revisions of
  // the current utterance window, arriving a few hundred ms behind the
  // voice — they drive both the near-live reveal AND (unlike Groq, which
  // has no equivalent of "partial text before a chunk boundary") the
  // identify search and wrong-page detection, throttled so the whole-Quran
  // scorer isn't re-run on every single revision. A final still settles the
  // window and always triggers an immediate, unthrottled check — it's the
  // point where the streaming words for that phrase are done changing.
  const handleStreamEvent = useCallback(
    (event: SttStreamEvent) => {
      if (!deps.isActive() || !deps.isRecording()) return;
      const text = event.text.trim();
      if (text) {
        deps.setLastChunkText(text);
        deps.touchLastSpeechAt();
      }

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

      const pos = deps.reveal.getTruePosition();
      if (!pos) return;

      const matched = text ? matchFromPosition(text, deps.getCombinedVerses(), pos) : null;
      if (matched) {
        noMatchStreakRef.current = 0;
        recentTextsRef.current = [];
        deps.setNoMatchHint(false);
        identify.addWordsSinceLanding(matched.consumed);
        advancedSinceFinalRef.current = true;
        deps.reveal.advanceTo(matched.position, STREAM_REVEAL_HOLDBACK_WORDS);
      }

      if (event.isFinal && advancedSinceFinalRef.current) {
        // The settled window advanced the position at some point — those
        // words are confirmed speech; release them from the holdback.
        advancedSinceFinalRef.current = false;
        const truePos = deps.reveal.getTruePosition();
        if (truePos) deps.reveal.confirm(truePos);
        return;
      }
      if (matched) return;

      // No match. A final always counts as one mismatch tick, same as
      // before. An interim counts too — throttled, so a long unmatching
      // utterance doesn't wait for its own final to start building the
      // wrong-page streak — but only once its text has enough real words to
      // be meaningful (mirrors the chunked path's noise guard) and the
      // throttle window has passed, so it isn't scored many times a second.
      if (!text) return;
      if (usableWordCount(text, normalizeArabic) < 3) return;
      if (!event.isFinal) {
        const now = Date.now();
        if (now - lastMismatchCheckAtRef.current < MISMATCH_INTERIM_THROTTLE_MS) return;
        lastMismatchCheckAtRef.current = now;
      }

      // Tracking-phase mismatches are otherwise completely silent — the
      // reveal just freezes with no log line, which is exactly what made a
      // stall impossible to diagnose from the console. Surface it: which
      // final failed to match, and where the true position was stuck.
      if (event.isFinal) {
        const stuckAt = deps.reveal.getTruePosition();
        console.log(
          `[recite-track] no match: "${text}" (stuck at ${
            stuckAt ? `${stuckAt.sura}:${stuckAt.aya}` : "?"
          }, streak ${noMatchStreakRef.current + 1})`,
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
    [deps, identify],
  );

  const start = useCallback(() => {
    noMatchStreakRef.current = 0;
    recentTextsRef.current = [];
    advancedSinceFinalRef.current = false;
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

  return { micError, start, stop };
}
