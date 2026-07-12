import { useCallback, useEffect, useRef } from "react";
import { useReciteMode } from "../../../core/hooks/useReciteMode";
import { getPage } from "../../../core/services/data/quran.service";
import { verseWordCount } from "../../../core/services/quran/recite-matcher.service";

/**
 * QUIZ RECITE
 *
 * Adapts the page-scoped `useReciteMode` (built for continuous Hifz
 * practice across a Mushaf page) to a quiz question: the question's whole
 * Mushaf page is armed, so the same mic → STT → word-match pipeline can
 * keep tracking recitation past the target verse if the user keeps going.
 * The question itself is answered automatically the moment the target
 * verse's words have all been matched, but listening continues until
 * either the user stops it or recitation runs off the end of the page.
 */
export interface UseQuizReciteResult {
  /** True while the mic is actively capturing for this question. */
  isRecording: boolean;
  /** True once armed but before the mic has started. */
  isArmed: boolean;
  micError: string | null;
  recordingSeconds: number;
  lastChunkText: string;
  noMatchHint: boolean;
  identifying: boolean;
  rateLimited: boolean;
  /** Number of words recited so far within the target verse. */
  revealedWordCount: number;
  /** Starts listening on the given verse's page (sura/aya mark the target). */
  start: (verse: { sura: number; aya: number; page: number }) => Promise<void>;
  /** Stops the mic and exits recite mode for this question. */
  stop: () => void;
}

export function useQuizRecite(
  /** Called once the target verse has been fully recited (session keeps running). */
  onVerseComplete: () => void,
): UseQuizReciteResult {
  const targetRef = useRef<{ sura: number; aya: number; wordCount: number } | null>(null);
  const verseCompletedRef = useRef(false);
  const onVerseCompleteRef = useRef(onVerseComplete);
  onVerseCompleteRef.current = onVerseComplete;

  // Reaching the end of the armed page means there's nothing left to
  // recite — stop the session entirely. Quizzes have no next-page concept,
  // so both useReciteMode navigation callbacks just mean "page finished."
  const stopRef = useRef<() => void>(() => {});
  const handlePageEnd = useCallback(() => {
    stopRef.current();
  }, []);

  const recite = useReciteMode(handlePageEnd, handlePageEnd);

  const { recitePartialTarget, reciteHidden, status, arm, disarm, startRecording, stopRecording } = recite;

  useEffect(() => {
    const target = targetRef.current;
    if (!target || verseCompletedRef.current) return;

    const key = `${target.sura}:${target.aya}`;
    const stillHidden = reciteHidden.has(key);
    const partial = recitePartialTarget;
    const revealed =
      partial && partial.sura === target.sura && partial.aya === target.aya
        ? partial.revealedWordCount
        : 0;

    if (!stillHidden && revealed >= target.wordCount && target.wordCount > 0) {
      verseCompletedRef.current = true;
      onVerseCompleteRef.current();
    }
  }, [recitePartialTarget, reciteHidden]);

  const start = useCallback(
    async (verse: { sura: number; aya: number; page: number }) => {
      verseCompletedRef.current = false;
      const pageVerses = await getPage(verse.page);
      const target = pageVerses.find(
        (v) => v.sura === verse.sura && v.aya === verse.aya,
      );
      targetRef.current = {
        sura: verse.sura,
        aya: verse.aya,
        wordCount: target ? verseWordCount(target) : 0,
      };
      // Arm under a page number one past the real Mushaf's last page (604)
      // so useReciteMode's next-page prefetch (getPage(page + 1)) resolves
      // to an empty page — matching stays bounded to this question's page
      // only, instead of silently continuing onto the real next page.
      arm(605, pageVerses);
      startRecording();
    },
    [arm, startRecording],
  );

  const stop = useCallback(() => {
    stopRecording();
    disarm();
    targetRef.current = null;
  }, [stopRecording, disarm]);
  stopRef.current = stop;

  // Clean up if the component unmounts mid-recording (e.g. exiting the quiz).
  useEffect(() => () => disarm(), [disarm]);

  const partial = recitePartialTarget;
  const revealedWordCount =
    partial && targetRef.current && partial.sura === targetRef.current.sura && partial.aya === targetRef.current.aya
      ? partial.revealedWordCount
      : 0;

  return {
    isRecording: status === "recording",
    isArmed: status === "armed" || status === "recording",
    micError: recite.micError,
    recordingSeconds: recite.recordingSeconds,
    lastChunkText: recite.lastChunkText,
    noMatchHint: recite.noMatchHint,
    identifying: recite.identifying,
    rateLimited: recite.rateLimited,
    revealedWordCount,
    start,
    stop,
  };
}
