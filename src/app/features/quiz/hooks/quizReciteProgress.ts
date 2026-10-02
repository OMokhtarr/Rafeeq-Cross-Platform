import type { TrackerState } from "../../../core/services/quran/recite-aligner.service";

export interface QuizReciteProgress {
  /** Words recited past the shown snippet (0 while still in the snippet). */
  revealedWordCount: number;
  /** Red words as indexes into the hidden portion — counted like
   *  revealedWordCount, so the card can style word `i` directly. */
  mistakeWordIndexes: Set<number>;
  /** Verse end reached with no red words left. */
  complete: boolean;
}

/**
 * What a quiz shows for a recite tracker state on its single target verse.
 * `completeAt` is the verse's recitable word count (the ayah-number marker
 * excluded); `wordCount` caps the cursor; `snippetWords` is how many of the
 * verse's words the question already shows.
 */
export function quizProgress(
  state: TrackerState,
  target: { completeAt: number; wordCount: number },
  snippetWords: number,
): QuizReciteProgress {
  const wordsIntoVerse = Math.min(state.cursor.wordIndex, target.wordCount);
  const mistakeWordIndexes = new Set<number>();
  state.marks.forEach((_, key) => {
    mistakeWordIndexes.add(Number(key.split(":")[2]) - snippetWords);
  });
  return {
    revealedWordCount: Math.max(0, wordsIntoVerse - snippetWords),
    mistakeWordIndexes,
    complete:
      target.completeAt > 0 && wordsIntoVerse >= target.completeAt && state.marks.size === 0,
  };
}
