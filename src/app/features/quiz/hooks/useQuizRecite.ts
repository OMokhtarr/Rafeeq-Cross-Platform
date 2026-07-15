import { useCallback, useEffect, useRef, useState } from "react";
import {
  openSttStream,
  type SttStreamHandle,
} from "../../../core/services/audio/speech-to-text-stream.service";
import { getPage } from "../../../core/services/data/quran.service";
import { removeDiacritics } from "../../../core/utils/arabic.util";
import {
  firstWordPosition,
  matchTranscript,
  verseWordCount,
  type RecitePosition,
} from "../../../core/services/quran/recite-matcher.service";
import { matchFromPosition } from "../../../core/hooks/recite/deepgram/matchFromPosition";
import { cmpPos } from "../../../core/hooks/recite/shared/reciteCore";
import { useRevealAnimator } from "../../../core/hooks/recite/shared/useRevealAnimator";
import type { Verse } from "../../../shared/models/verse.model";

/**
 * QUIZ RECITE
 *
 * A quiz question already knows exactly which verse (and which word within
 * it) the user must recite — unlike the main Quran viewer's Recite Mode,
 * there is nothing to *identify* by searching the whole Quran. This talks to
 * Deepgram's live-streaming transcription directly
 * (../../../core/services/audio/speech-to-text-stream.service) and matches
 * every recognized chunk forward from a known position (the same
 * matchFromPosition tracking logic the main viewer's Deepgram driver uses
 * once it has landed), skipping the whole-Quran/page-first identify phase.
 *
 * Recitation is always bounded to the single target verse (whether the
 * Mushaf context is open or closed). The user may recite the whole verse
 * from its start, or jump straight into the hidden continuation they're
 * being tested on. Since there's no way to know up front which they'll do,
 * the first recognized speech is matched against *both* candidate start
 * points (word 0, and the hidden portion's start word) and whichever matches
 * further wins — that becomes the session's tracking anchor for the rest of
 * the recitation. The question is complete once the target verse is fully
 * recited.
 */
export type QuizReciteStatus = "idle" | "armed" | "recording" | "mic-error";

export interface UseQuizReciteResult {
  status: QuizReciteStatus;
  isRecording: boolean;
  isArmed: boolean;
  micError: string | null;
  recordingSeconds: number;
  lastChunkText: string;
  noMatchHint: boolean;
  /** True once the target verse has been fully recited this session. */
  isVerseComplete: boolean;
  /**
   * How many words of the *hidden* continuation the user has recited so far
   * — i.e. words in the target verse past the already-displayed snippet.
   * Zero while the user is still reciting the shown portion. This is the
   * same origin the manual hint level uses (words into `hiddenPortion`), so
   * the two can be combined with `Math.max` without double-counting the
   * snippet.
   */
  revealedWordCount: number;
  /** The matcher's live position within the target verse; null when idle.
   *  Used to drive the green "you said this" highlight. */
  livePosition: RecitePosition | null;
  /**
   * Starts listening: bounded to the single target verse, accepting either a
   * full-verse or hidden-portion-only recitation. `displayedPortion` is the
   * verse text already shown to the user (used to locate where the hidden
   * portion begins).
   */
  startVerseMode: (question: {
    sura: number;
    aya: number;
    page: number;
    displayedPortion: string;
  }) => Promise<void>;
  /** Stops the mic and exits recite mode for this question. */
  stop: () => void;
}

/** Consecutive non-matching finals before surfacing the "didn't catch that"
 *  hint — short enough to feel responsive, long enough that one garbled
 *  word doesn't flash a warning. */
const NO_MATCH_HINT_STREAK = 3;

/** No reveal holdback in the quiz. The main viewer holds the matcher's
 *  newest word back by one until a following window confirms it (guarding
 *  against Deepgram revising a streaming window's last word). But in a quiz
 *  the user is reciting known text and wants the word shown the instant it
 *  matches — waiting for a *next* word to release the current one leaves the
 *  verse's final words stranded when they stop at the end. Immediate reveal
 *  is the explicitly-wanted behavior; the forward-only + confirm-on-match
 *  logic in processMatch already prevents revealing ahead of the voice. */
const REVEAL_HOLDBACK_WORDS = 0;

const SILENCE_TIMEOUT_MS = 10000;

/** Minimum consumed words before trusting which of the two verse-mode seed
 *  points (verse start vs. hidden-portion start) the user actually began
 *  from — enough to rule out a coincidental single-word match while still
 *  resolving within the first couple of recognized words. */
const SEED_MIN_CONSUMED = 2;

/** How many of the verse's own words the seed-detection search is allowed
 *  to look across — a whole verse is at most a few dozen words, so this is
 *  generous without risking a runaway scan. */
const SEED_MAX_LOOKAHEAD = 60;

/** How many of the verse's word-tokens are actually recitable — i.e. the
 *  matcher's token count minus the trailing ayah-end marker. That marker is
 *  the last `charType === "end"` entry and its text is the ayah-number glyph
 *  (Arabic-Indic digits, e.g. "٢٦٦"), which the reciter never speaks, so the
 *  matcher's wordIndex tops out one short of `verseWordCount`. Completion
 *  must gate on THIS count, not verseWordCount, or it can never fire. */
function recitableWordCount(verse: Verse): number {
  const words = (verse.words ?? []).filter((w) => w.charType === "end");
  if (words.length === 0) return 0;
  const last = words[words.length - 1];
  // The ayah marker's text is only Arabic-Indic digits (٠-٩) once whitespace
  // is stripped. If so, it's not a spoken word — exclude it.
  const lastText = (last.text_uthmani || "").replace(/\s+/g, "");
  const isAyahMarker = lastText.length > 0 && /^[٠-٩]+$/.test(lastText);
  return isAyahMarker ? words.length - 1 : words.length;
}

/** Finds how many of `verse`'s words the already-displayed `snippet` text
 *  covers, by accumulating the verse's own words (diacritic-stripped) until
 *  their combined length reaches the snippet's — same technique
 *  MushafContextViewer uses to align a hint snippet to word boundaries. */
function snippetWordCount(verse: Verse, snippet: string): number {
  const words = (verse.words ?? []).filter((w) => w.charType === "end");
  const target = removeDiacritics(snippet).replace(/\s+/g, "");
  if (!target) return 0;
  let acc = "";
  for (let i = 0; i < words.length; i++) {
    acc += removeDiacritics(words[i].text_uthmani || "").replace(/\s+/g, "");
    if (acc.length >= target.length) return i + 1;
  }
  return 0;
}

export function useQuizRecite(
  /** Called once the target verse has been fully recited (session keeps running). */
  onVerseComplete: () => void,
): UseQuizReciteResult {
  const [status, setStatus] = useState<QuizReciteStatus>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastChunkText, setLastChunkText] = useState("");
  const [noMatchHint, setNoMatchHint] = useState(false);
  const [revealedWordCount, setRevealedWordCount] = useState(0);
  const [livePosition, setLivePosition] = useState<RecitePosition | null>(null);
  const [isVerseComplete, setIsVerseComplete] = useState(false);

  const targetRef = useRef<{
    sura: number;
    aya: number;
    /** Total tokens the matcher sees for this verse, INCLUDING the trailing
     *  ayah-end marker (which is a token but is never spoken/matched). */
    wordCount: number;
    /** Words the reciter can actually say = wordCount minus the ayah marker.
     *  Completion is measured against this — the matcher tops out at
     *  wordIndex === completeAt (never reaching wordCount, since the marker
     *  is unmatchable), so gating on wordCount would never fire. */
    completeAt: number;
  } | null>(null);
  // Word count of the already-displayed snippet within the target verse —
  // recited words up to here are the shown prompt and reveal nothing new.
  const snippetWordsRef = useRef(0);
  const verseRef = useRef<Verse[]>([]);
  const verseCompletedRef = useRef(false);
  const onVerseCompleteRef = useRef(onVerseComplete);
  onVerseCompleteRef.current = onVerseComplete;

  // Candidate seed positions (verse start / hidden-portion start) not yet
  // resolved to one. Cleared once the first real match picks a winner.
  const pendingSeedsRef = useRef<RecitePosition[] | null>(null);
  // Furthest position ever reported to applyPosition — keeps trailing crawl
  // applies from moving the reveal/progress backward (see applyPosition).
  const appliedHighWaterRef = useRef<RecitePosition | null>(null);

  const activeRef = useRef(false);
  const recordingRef = useRef(false);
  const streamRef = useRef<SttStreamHandle | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechAtRef = useRef(0);
  const noMatchStreakRef = useRef(0);
  const stopRef = useRef<() => void>(() => {});

  const applyPosition = useCallback((verses: Verse[], pos: RecitePosition) => {
    const target = targetRef.current;
    if (!target) return;
    // Monotonic guard: processMatch applies the true (matched) position
    // immediately, while the reveal animator's crawl may later call this
    // with earlier, trailing display positions. Never let a trailing apply
    // move the reported position backward.
    const hw = appliedHighWaterRef.current;
    if (hw && cmpPos(pos, hw) < 0) return;
    appliedHighWaterRef.current = pos;
    const wordsIntoVerse = Math.min(pos.wordIndex, target.wordCount);
    // Report hidden-portion-relative progress: words recited past the
    // already-shown snippet. Reciting through the visible prompt reveals
    // nothing new, so this stays 0 until the user reaches the hidden part.
    setRevealedWordCount(Math.max(0, wordsIntoVerse - snippetWordsRef.current));
    setLivePosition(pos);
    if (wordsIntoVerse >= target.completeAt && target.completeAt > 0 && !verseCompletedRef.current) {
      verseCompletedRef.current = true;
      setIsVerseComplete(true);
      onVerseCompleteRef.current();
    }
  }, []);

  const reveal = useRevealAnimator({
    isActive: () => activeRef.current,
    getCombinedVerses: () => verseRef.current,
    getPageVerses: () => verseRef.current,
    applyPosition,
  });

  /** Matches one recognized segment forward from the current true position
   *  and advances the reveal — but only on a real, forward, multi-word
   *  match. Returns true if it advanced. Shared by both modes once tracking
   *  has begun (verse mode only reaches here after its seed is resolved). */
  const processMatch = useCallback(
    (text: string, isFinal: boolean): boolean => {
      const pos = reveal.getTruePosition();
      if (!pos) return false;
      const matched = text ? matchFromPosition(text, verseRef.current, pos) : null;
      // Guard — forward only: the quiz never moves backward through the
      //   page, so a match that lands at/behind the current position is a
      //   coincidental word triggering the matcher's rewind. Ignore it (this
      //   was the stall: a lone "وله" rewound onto the previous verse's tail
      //   and every later final then failed to match forward from there).
      //   A single word is enough to advance as long as it's genuinely
      //   forward: strict matching only advances by the words actually said,
      //   in order, so it can't leap ahead — and revealing the one word you
      //   just recited immediately is exactly the wanted behavior. There is
      //   no reveal holdback here (0): a matched word shows the instant it's
      //   recognized rather than waiting for a following word to confirm it,
      //   so the verse's last words never stay stuck behind the matcher.
      if (matched && cmpPos(matched.position, pos) > 0) {
        noMatchStreakRef.current = 0;
        setNoMatchHint(false);
        reveal.advanceTo(matched.position, REVEAL_HOLDBACK_WORDS);
        reveal.confirm(matched.position);
        // Deepgram already delivers words one-at-a-time as they're spoken,
        // so the reveal should follow the matched (true) position directly.
        // The animator's own word-by-word crawl would only add a second,
        // slower trickle on top — and because reveal/completion are driven
        // off the *display* position the crawl lags behind, the verse's last
        // words never showed (crawl killed on stop) and page mode never
        // rolled into the next verse (crawl stuck on the previous one's
        // tail). Apply the true position immediately instead.
        applyPosition(verseRef.current, matched.position);
        return true;
      }
      if (!text || !isFinal) return false;
      noMatchStreakRef.current += 1;
      if (noMatchStreakRef.current >= NO_MATCH_HINT_STREAK) setNoMatchHint(true);
      return false;
    },
    [reveal, applyPosition],
  );

  const clearDurationTimer = useCallback(() => {
    if (durationTimerRef.current !== null) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (!activeRef.current) return;
    activeRef.current = false;
    recordingRef.current = false;
    streamRef.current?.stop();
    streamRef.current = null;
    clearDurationTimer();
    reveal.reset(null);
    setRecordingSeconds(0);
    setLastChunkText("");
    setNoMatchHint(false);
    setRevealedWordCount(0);
    setLivePosition(null);
    targetRef.current = null;
    snippetWordsRef.current = 0;
    verseRef.current = [];
    pendingSeedsRef.current = null;
    appliedHighWaterRef.current = null;
    // NB: isVerseComplete is intentionally NOT reset here — the quiz reads it
    // right after calling stop() to decide correct/incorrect. It's reset when
    // the next session starts (startVerseMode).
    setStatus("idle");
  }, [clearDurationTimer, reveal]);
  stopRef.current = stop;

  /** Shared session bring-up once the armed verses/target/seed position are
   *  set: opens the Deepgram stream and wires it to `handleEvent`. */
  const beginSession = useCallback(
    async (handleEvent: (text: string, isFinal: boolean) => void) => {
      recordingRef.current = true;
      setRecordingSeconds(0);
      lastSpeechAtRef.current = Date.now();
      setStatus("recording");

      try {
        const handle = await openSttStream(
          (event) => {
            if (!activeRef.current || !recordingRef.current) return;
            const text = event.text.trim();
            if (text) {
              setLastChunkText(text);
              lastSpeechAtRef.current = Date.now();
            }
            handleEvent(text, event.isFinal);
          },
          (message) => {
            if (!recordingRef.current) return;
            setMicError(message);
            stopRef.current();
          },
        );
        if (!activeRef.current) {
          handle.stop();
          return;
        }
        streamRef.current = handle;
      } catch (err) {
        setMicError(err instanceof Error ? err.message : "Microphone access denied");
        setStatus("mic-error");
        activeRef.current = false;
        recordingRef.current = false;
        return;
      }

      durationTimerRef.current = setInterval(() => {
        setRecordingSeconds((s) => s + 1);
        if (Date.now() - lastSpeechAtRef.current >= SILENCE_TIMEOUT_MS) {
          stopRef.current();
        }
      }, 1000);
    },
    [],
  );

  const startVerseMode = useCallback(
    async (question: { sura: number; aya: number; page: number; displayedPortion: string }) => {
      verseCompletedRef.current = false;
      appliedHighWaterRef.current = null;
      setIsVerseComplete(false);
      noMatchStreakRef.current = 0;
      setNoMatchHint(false);
      setMicError(null);

      const pageVerses = await getPage(question.page);
      const target = pageVerses.find(
        (v) => v.sura === question.sura && v.aya === question.aya,
      );
      if (!target) return;

      activeRef.current = true;
      verseRef.current = [target];
      targetRef.current = {
        sura: question.sura,
        aya: question.aya,
        wordCount: verseWordCount(target),
        completeAt: recitableWordCount(target),
      };

      const hiddenStart = snippetWordCount(target, question.displayedPortion);
      snippetWordsRef.current = hiddenStart;
      const verseStartPos = firstWordPosition(target);
      const hiddenStartPos: RecitePosition = {
        sura: question.sura,
        aya: question.aya,
        wordIndex: hiddenStart,
      };
      // Two live candidates until the first real match resolves which one
      // the user actually started from. Display starts at the verse's
      // beginning (nothing revealed yet either way).
      pendingSeedsRef.current =
        hiddenStart > 0 ? [verseStartPos, hiddenStartPos] : [verseStartPos];
      reveal.reset(verseStartPos);
      setRevealedWordCount(0);
      setLivePosition(verseStartPos);
      setStatus("armed");

      await beginSession((text, isFinal) => {
        const seeds = pendingSeedsRef.current;
        if (seeds) {
          // Still resolving which start point the user is reciting from —
          // try the text against every candidate seed and commit to
          // whichever tracks furthest, in order, requiring the same margin
          // as the main viewer's loose-match tolerance so a single
          // coincidental word can't decide it.
          if (!text) return;
          let best: { pos: RecitePosition; consumed: number } | null = null;
          for (const seed of seeds) {
            const result = matchTranscript(text, verseRef.current, seed, {
              maxLookahead: SEED_MAX_LOOKAHEAD,
            });
            if (
              result.position &&
              result.consumedTokens >= SEED_MIN_CONSUMED &&
              (!best || result.consumedTokens > best.consumed)
            ) {
              best = { pos: result.position, consumed: result.consumedTokens };
            }
          }
          if (!best) {
            if (!isFinal) return;
            noMatchStreakRef.current += 1;
            if (noMatchStreakRef.current >= NO_MATCH_HINT_STREAK) setNoMatchHint(true);
            return;
          }
          pendingSeedsRef.current = null;
          noMatchStreakRef.current = 0;
          setNoMatchHint(false);
          reveal.advanceTo(best.pos, REVEAL_HOLDBACK_WORDS);
          reveal.confirm(best.pos);
          applyPosition(verseRef.current, best.pos);
          return;
        }

        processMatch(text, isFinal);
      });
    },
    [beginSession, reveal, processMatch, applyPosition],
  );

  // Clean up if the component unmounts mid-recording (e.g. exiting the quiz).
  const stopOnUnmountRef = useRef(stop);
  stopOnUnmountRef.current = stop;
  useEffect(() => () => stopOnUnmountRef.current(), []);

  useEffect(() => {
    if (micError) setStatus("mic-error");
  }, [micError]);

  return {
    status,
    isRecording: status === "recording",
    isArmed: status === "armed" || status === "recording",
    micError,
    recordingSeconds,
    lastChunkText,
    noMatchHint,
    isVerseComplete,
    revealedWordCount,
    livePosition,
    startVerseMode,
    stop,
  };
}
