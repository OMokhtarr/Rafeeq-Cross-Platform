/**
 * GROQ DRIVER — chunked-Whisper Recite Mode engine.
 *
 * Owns everything specific to the Groq chunked pipeline: the mic's
 * speech-gated chunk cadence, the transcription queue, the two-chunk
 * overlap corroboration, and the reveal holdback tuned for Whisper's
 * failure mode (it can *continue* a phrase over trailing silence, since it
 * knows the Quran from training — see REVEAL_HOLDBACK_WORDS). This logic
 * must keep working exactly as before; tune Deepgram's behavior in
 * ../deepgram/deepgramDriver.ts instead of here — that folder is fully
 * separate from this one.
 *
 * Owns its own `useIdentifySession` instance (rather than sharing one
 * across engines) so its cadence callback (`onSwitchToTracking`) can talk
 * straight to the mic's chunk-length setter with no cross-driver wiring —
 * only one driver is ever active per recording session.
 */

import { useCallback, useRef } from "react";
import { transcribeChunk, RateLimitedError } from "../../../services/audio/speech-to-text.service";
import { useMicChunks } from "../../useMicChunks";
import { normalizeArabic, precedingWordsText } from "../../../services/quran/recite-matcher.service";
import {
  NO_MATCH_HINT_STREAK,
  NO_MATCH_REIDENTIFY_STREAK,
  cmpPos,
  matchFromPosition,
  usableWordCount,
  type ReciteDriver,
  type ReciteDriverDeps,
  type RecitePosition,
} from "../shared/reciteCore";
import { useIdentifySession } from "./useIdentifySession";

/** Chunk length while identifying. The very first chunk is longer — one
 *  good look at the opening of the recitation identifies far better than
 *  two fragments of it — and the mic's speech gate keeps pre-recitation
 *  silence from eating into it, so it holds ~6s of actual recitation.
 *  Once the page is known, matching only has to track forward from a known
 *  point, so shorter chunks give near-live word-by-word reveal instead of
 *  waiting for a long chunk. */
const FIRST_IDENTIFY_CHUNK_MS = 6000;
const IDENTIFY_CHUNK_MS = 4000;
const TRACKING_CHUNK_MS = 4000;

/** How many matched words the display holds back from the matcher. Whisper
 *  sometimes *continues* past what was actually said when a chunk trails
 *  off into silence — it knows the Quran and finishes the phrase — so a
 *  chunk's last couple of matched words are treated as unconfirmed until a
 *  newer chunk moves the matcher further (chunks overlap by half, so real
 *  speech at a chunk's tail is re-heard ~2s later). Ghost words therefore
 *  never reach the screen; the matcher itself is not held back and
 *  self-corrects via the rewind check if it overshot. */
const REVEAL_HOLDBACK_WORDS = 2;

/**
 * useReciteMode always calls both engine drivers (React hooks can't be
 * conditional) but only ever invokes `.start()` on the one the user
 * selected — until then this hook is inert (no mic permission prompt, no
 * network activity), so no separate "active" flag is needed.
 */
export function useGroqDriver(deps: ReciteDriverDeps): ReciteDriver {
  const transcribingRef = useRef(false);
  const pendingChunksRef = useRef<Blob[]>([]);
  const noMatchStreakRef = useRef(0);
  const recentTextsRef = useRef<string[]>([]);
  const firstChunkPendingRef = useRef(false);
  // Endpoint of the previous chunk's match — the corroboration anchor:
  // everything reached by both this chunk and the last one has been heard
  // twice (chunks overlap by half), so it's certainly real.
  const prevChunkEndRef = useRef<RecitePosition | null>(null);
  const setChunkMsRef = useRef<(ms: number) => void>(() => {});

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
    onSwitchToTracking: () => setChunkMsRef.current(TRACKING_CHUNK_MS),
    // A false-alarm re-search resolved back to where tracking already was:
    // resume exactly like a normal chunk match (holdback margin, and this
    // position becomes the anchor the *next* chunk corroborates against —
    // it is not itself immediately confirmed).
    resumeTrackingAt: (pos) => {
      prevChunkEndRef.current = pos;
      deps.reveal.advanceTo(pos, REVEAL_HOLDBACK_WORDS);
    },
    // Fresh landing: the replay endpoint stands in as the "previous chunk"
    // so the first tracking chunk can corroborate the replayed tail.
    onLanded: (pos) => {
      prevChunkEndRef.current = pos;
    },
    resetMismatchStreak: () => {
      noMatchStreakRef.current = 0;
    },
    stopRecording: deps.stopRecording,
  });

  const processQueue = useCallback(async () => {
    if (transcribingRef.current) return;
    const blob = pendingChunksRef.current.shift();
    if (!blob) return;
    transcribingRef.current = true;
    try {
      const combinedVerses = deps.getCombinedVerses();
      const truePos = deps.reveal.getTruePosition();
      const prompt =
        !identify.isIdentifying() && truePos
          ? precedingWordsText(combinedVerses, truePos) || undefined
          : undefined;

      const text = await transcribeChunk(blob, { language: "ar", prompt });
      // isRecording too: a chunk that finishes transcribing after the user
      // pressed stop must not keep matching (or worse, navigate pages).
      if (!deps.isActive() || !deps.isRecording()) return;
      deps.setRateLimited(false);
      if (text.trim()) {
        deps.setLastChunkText(text.trim());
        deps.touchLastSpeechAt();
      }

      if (identify.isIdentifying()) {
        await identify.handleIdentifyChunk(text);
        return;
      }

      const pos = deps.reveal.getTruePosition();
      if (!text.trim() || !pos) return;

      const matched = matchFromPosition(text, combinedVerses, pos);
      if (matched) {
        noMatchStreakRef.current = 0;
        recentTextsRef.current = [];
        deps.setNoMatchHint(false);
        identify.addWordsSinceLanding(matched.consumed);
        // Everything reached by both this chunk's match and the previous
        // one's has been heard twice — corroborated, so the display may
        // show it without the holdback margin. This is what releases a
        // phrase's tail words after a pause: the next overlapping chunk
        // re-hears them even though the position itself doesn't advance.
        const prevEnd = prevChunkEndRef.current;
        if (prevEnd) {
          const corroborated =
            cmpPos(prevEnd, matched.position) <= 0 ? prevEnd : matched.position;
          deps.reveal.confirm(corroborated);
        }
        prevChunkEndRef.current = matched.position;
        deps.reveal.advanceTo(matched.position, REVEAL_HOLDBACK_WORDS);
        return;
      }

      // No match. Only a chunk with enough *real* words counts as a "not on
      // this page" signal — short or garbled chunks (mis-hearings, filler
      // like "بكم"/"اه"/"نعم") must never build toward a disruptive
      // re-search. Poor STT on the correct page should just pause the
      // reveal, not tear the session down.
      if (usableWordCount(text, normalizeArabic) < 3) return;

      recentTextsRef.current = [...recentTextsRef.current, text].slice(-3);
      noMatchStreakRef.current += 1;
      if (noMatchStreakRef.current >= NO_MATCH_REIDENTIFY_STREAK) {
        // Several substantial chunks in a row match nowhere on this page —
        // the reciter has genuinely moved. Re-search seeded with the recent
        // context, not just this one chunk.
        identify.reidentify(recentTextsRef.current.join(" "));
        recentTextsRef.current = [];
        setChunkMsRef.current(IDENTIFY_CHUNK_MS);
      } else if (noMatchStreakRef.current >= NO_MATCH_HINT_STREAK) {
        deps.setNoMatchHint(true);
      }
    } catch (err) {
      if (err instanceof RateLimitedError) {
        deps.setRateLimited(true);
        // Drop everything already queued — it would just hit the same
        // cooldown — and stretch the capture cadence so we don't
        // immediately re-trigger the limit once it lifts.
        pendingChunksRef.current = [];
        setChunkMsRef.current(Math.max(TRACKING_CHUNK_MS, err.retryAfterMs));
        // No transcripts arrive during the cooldown, so keep the silence
        // clock alive — the user may well still be reciting, and the
        // auto-stop must not fire just because transcription is paused.
        deps.touchLastSpeechAt();
      }
      // Transcription failure for this chunk — keep listening, try the next one.
    } finally {
      transcribingRef.current = false;
      if (pendingChunksRef.current.length > 0) processQueue();
    }
  }, [deps, identify]);

  const onChunk = useCallback(
    (blob: Blob) => {
      if (!deps.isRecording()) return;
      pendingChunksRef.current.push(blob);
      // The extra-long first chunk has been captured — drop to the regular
      // identify cadence for the rest of the phase.
      if (firstChunkPendingRef.current) {
        firstChunkPendingRef.current = false;
        if (identify.isIdentifying()) setChunkMsRef.current(IDENTIFY_CHUNK_MS);
      }
      processQueue();
    },
    [deps, identify, processQueue],
  );

  const mic = useMicChunks(onChunk, IDENTIFY_CHUNK_MS);
  setChunkMsRef.current = mic.setChunkMs;

  const start = useCallback(() => {
    transcribingRef.current = false;
    pendingChunksRef.current = [];
    noMatchStreakRef.current = 0;
    recentTextsRef.current = [];
    firstChunkPendingRef.current = true;
    prevChunkEndRef.current = null;
    identify.startIdentifying();
    deps.setIdentifying(true);
    mic.setChunkMs(FIRST_IDENTIFY_CHUNK_MS);
    // Speech-gated: the first chunk's clock starts when the reciter
    // actually starts, so pre-recitation silence never eats into it.
    mic.start(true);
  }, [deps, identify, mic]);

  const stop = useCallback(() => {
    mic.stop();
    pendingChunksRef.current = [];
  }, [mic]);

  return {
    micError: mic.error,
    start,
    stop,
  };
}
