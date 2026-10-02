import { useCallback, useEffect, useRef, useState } from "react";
import {
  openSttStream,
  type SttStreamHandle,
  type SttWord,
} from "../../../core/services/audio/speech-to-text-stream.service";
import { getPage } from "../../../core/services/data/quran.service";
import { removeDiacritics } from "../../../core/utils/arabic.util";
import {
  firstWordPosition,
  verseWordCount,
  type RecitePosition,
} from "../../../core/services/quran/recite-matcher.service";
import {
  createReciteTracker,
  markPositionKeys,
  spokenWordsFrom,
  type ReciteTracker,
  type TrackerState,
} from "../../../core/services/quran/recite-aligner.service";
import { useLang } from "../../../core/context/LanguageContext";
import { isNetworkReachable } from "../../../core/services/api/network.service";
import type { Verse } from "../../../shared/models/verse.model";
import { quizAlignOptions, quizProgress } from "./quizReciteProgress";

/**
 * QUIZ RECITE
 *
 * A quiz question already knows exactly which verse (and which word within
 * it) the user must recite — unlike the main Quran viewer's Recite Mode,
 * there is nothing to *identify* by searching the whole Quran. This talks to
 * Deepgram's live-streaming transcription directly
 * (../../../core/services/audio/speech-to-text-stream.service) and tracks the
 * recitation with the same recite aligner the main viewer uses
 * (../../../core/services/quran/recite-aligner.service), skipping the
 * identify phase.
 *
 * Recitation is always bounded to the single target verse. The user may
 * recite the whole verse from its start, or jump straight into the hidden
 * continuation they're being tested on: the shown snippet may be recited or
 * skipped, and a word missed inside it is never marked. Words of the hidden
 * part that are skipped or said wrongly turn red, and the question counts as
 * complete only once the verse end is reached with no red words left.
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
  /** True once the target verse has been recited to its end with no red
   *  words left. */
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
  /** Words of the hidden continuation skipped or said wrongly, as indexes
   *  counted like `revealedWordCount` — shown red on the question card. */
  mistakeWordIndexes: Set<number>;
  /** The same red words as `sura:aya:position` keys, for the Mushaf context
   *  viewer. */
  mistakePositions: Set<string>;
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
  /** Stops the mic. The attempt's green and red words stay (and
   *  isVerseComplete stays readable) until reset() or the next
   *  startVerseMode. */
  stop: () => void;
  /** Stops the mic and clears the attempt — call on Next, Skip, a typed
   *  answer, or any other question change. */
  reset: () => void;
}

/** Consecutive non-matching finals before surfacing the "didn't catch that"
 *  hint — short enough to feel responsive, long enough that one garbled
 *  word doesn't flash a warning. */
const NO_MATCH_HINT_STREAK = 3;

const SILENCE_TIMEOUT_MS = 10000;

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
  const { t } = useLang();
  const [status, setStatus] = useState<QuizReciteStatus>("idle");
  const [micError, setMicError] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [lastChunkText, setLastChunkText] = useState("");
  const [noMatchHint, setNoMatchHint] = useState(false);
  const [revealedWordCount, setRevealedWordCount] = useState(0);
  const [mistakeWordIndexes, setMistakeWordIndexes] = useState<Set<number>>(new Set());
  const [mistakePositions, setMistakePositions] = useState<Set<string>>(new Set());
  const [livePosition, setLivePosition] = useState<RecitePosition | null>(null);
  const [isVerseComplete, setIsVerseComplete] = useState(false);

  const targetRef = useRef<{
    sura: number;
    aya: number;
    /** Total tokens the matcher sees for this verse, INCLUDING the trailing
     *  ayah-end marker (which is a token but is never spoken/matched). */
    wordCount: number;
    /** Words the reciter can actually say = wordCount minus the ayah marker.
     *  Completion is measured against this. */
    completeAt: number;
  } | null>(null);
  // Word count of the already-displayed snippet within the target verse —
  // recited words up to here are the shown prompt and reveal nothing new.
  const snippetWordsRef = useRef(0);
  const verseRef = useRef<Verse[]>([]);
  const trackerRef = useRef<ReciteTracker | null>(null);
  const verseCompletedRef = useRef(false);
  const onVerseCompleteRef = useRef(onVerseComplete);
  onVerseCompleteRef.current = onVerseComplete;

  const activeRef = useRef(false);
  const recordingRef = useRef(false);
  const streamRef = useRef<SttStreamHandle | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSpeechAtRef = useRef(0);
  const noMatchStreakRef = useRef(0);
  const stopRef = useRef<() => void>(() => {});

  // Shows a tracker state. Interims show immediately, with no holdback: in a
  // quiz the user recites known text and wants each word the instant it
  // matches — the aligner itself never reveals past the last word said.
  const showState = useCallback((state: TrackerState) => {
    const target = targetRef.current;
    if (!target) return;
    const progress = quizProgress(state, target, snippetWordsRef.current);
    setRevealedWordCount(progress.revealedWordCount);
    setMistakeWordIndexes(progress.mistakeWordIndexes);
    setMistakePositions(markPositionKeys(state.marks));
    setLivePosition(state.cursor);
    if (progress.complete !== verseCompletedRef.current) {
      verseCompletedRef.current = progress.complete;
      setIsVerseComplete(progress.complete);
      if (progress.complete) onVerseCompleteRef.current();
    }
  }, []);

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
    trackerRef.current = null;
    setRecordingSeconds(0);
    setLastChunkText("");
    setNoMatchHint(false);
    // NB: the attempt's revealed words, red words and isVerseComplete are
    // intentionally kept — the quiz reads isVerseComplete right after
    // stopping to decide correct/open, and the card keeps showing the
    // attempt. reset() (or the next startVerseMode) clears them.
    setStatus("idle");
  }, [clearDurationTimer]);
  stopRef.current = stop;

  const reset = useCallback(() => {
    stop();
    targetRef.current = null;
    snippetWordsRef.current = 0;
    verseRef.current = [];
    verseCompletedRef.current = false;
    setIsVerseComplete(false);
    setRevealedWordCount(0);
    setMistakeWordIndexes(new Set());
    setMistakePositions(new Set());
    setLivePosition(null);
  }, [stop]);

  /** Shared session bring-up once the target verse is set: opens the
   *  Deepgram stream and wires it to `handleEvent`. */
  const beginSession = useCallback(
    async (handleEvent: (text: string, isFinal: boolean, words?: SttWord[]) => void) => {
      // Recite matching runs on a live streaming STT service. Check before
      // asking for the microphone, so an offline user gets a clear reason
      // instead of a mic prompt followed by a socket failure.
      if (!(await isNetworkReachable())) {
        setMicError(t.offline.recite);
        setStatus("mic-error");
        activeRef.current = false;
        recordingRef.current = false;
        return;
      }

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
            handleEvent(text, event.isFinal, event.words);
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
    [t],
  );

  const startVerseMode = useCallback(
    async (question: { sura: number; aya: number; page: number; displayedPortion: string }) => {
      reset();
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
      const verseStart = firstWordPosition(target);
      const hiddenStartPos: RecitePosition = {
        sura: question.sura,
        aya: question.aya,
        wordIndex: hiddenStart,
      };
      trackerRef.current = createReciteTracker(
        { cursor: verseStart, marks: new Map() },
        quizAlignOptions(hiddenStartPos),
      );
      setLivePosition(verseStart);
      setStatus("armed");

      await beginSession((text, isFinal, words) => {
        const tracker = trackerRef.current;
        if (!tracker || (!text && !isFinal)) return;
        const spoken = spokenWordsFrom(text, words);
        const result = isFinal
          ? tracker.onFinal(spoken, verseRef.current)
          : tracker.onPartial(spoken, verseRef.current);
        showState(result.state);
        if (result.saidTotal > 0) {
          noMatchStreakRef.current = 0;
          setNoMatchHint(false);
          return;
        }
        if (!text || !isFinal) return;
        noMatchStreakRef.current += 1;
        if (noMatchStreakRef.current >= NO_MATCH_HINT_STREAK) setNoMatchHint(true);
      });
    },
    [beginSession, reset, showState],
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
    mistakeWordIndexes,
    mistakePositions,
    livePosition,
    startVerseMode,
    stop,
    reset,
  };
}
