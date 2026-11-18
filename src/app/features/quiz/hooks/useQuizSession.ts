import { useEffect, useState } from "react";
import {
  clearQuizSession,
  loadQuizSession,
  saveQuizSession,
  QuizKind,
  QuizProgressBase,
} from "../quiz-session";

/**
 * The saved session for this quiz, read once when the page mounts. A page
 * that gets one restores its state from it instead of building new questions.
 */
export function useRestoredQuizSession<Q, P extends QuizProgressBase>(kind: QuizKind) {
  const [restored] = useState(() => loadQuizSession<Q, P>(kind));
  return restored;
}

/**
 * Keep the quiz in progress saved as it changes, and end the session once the
 * quiz is complete (the score screen is not something to come back to).
 */
export function usePersistQuizSession<Q, P extends QuizProgressBase>(
  kind: QuizKind,
  questions: Q[],
  progress: P,
  complete: boolean,
): void {
  // Progress is a fresh object each render; compare it by value.
  const progressKey = JSON.stringify(progress);
  useEffect(() => {
    if (questions.length === 0) return;
    if (complete) {
      clearQuizSession();
      return;
    }
    saveQuizSession(kind, questions, JSON.parse(progressKey) as P);
  }, [kind, questions, progressKey, complete]);
}
