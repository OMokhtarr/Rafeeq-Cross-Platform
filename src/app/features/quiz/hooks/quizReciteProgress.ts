import type { RecitePosition } from "../../../core/services/quran/recite-matcher.service";
import type { AlignOptions, TrackerState } from "../../../core/services/quran/recite-aligner.service";

/**
 * Tracker options for a question whose hidden part starts at `hiddenStart`.
 * The shown snippet may be recited or skipped (a free start up to the hidden
 * part), and a word missed inside it is never marked. The reciter may go
 * back anywhere in the verse to fix a red word, even after finishing it.
 */
export function quizAlignOptions(hiddenStart: RecitePosition): AlignOptions {
  return { freeStartUntil: hiddenStart, protectBefore: hiddenStart, restartAnywhere: true };
}

export type CardTokenStyle = "recited" | "mistake" | "hint";

/** Arabic letters — a token without any is a pause mark (ۖ ۗ ۚ ۛ …). */
const LETTER = /[ء-يٱ-ۓ]/;

/**
 * The question card's hidden-part tokens to show, each with its style: words
 * recited (green), skipped or said wrongly (red), or shown by the hint
 * button. `tokens` is the hidden part split on spaces; `hintLevel` counts
 * tokens. The verse text carries each pause mark as a token of its own while
 * recite progress counts words, so a pause mark goes with the word before it
 * (a leading one, with the first word).
 */
export function hiddenCardTokens(
  tokens: string[],
  progress: { revealedWordCount: number; mistakeWordIndexes: Set<number> },
  hintLevel: number,
): { text: string; style: CardTokenStyle }[] {
  const shown: { text: string; style: CardTokenStyle }[] = [];
  let word = -1;
  tokens.forEach((text, i) => {
    if (LETTER.test(text)) word++;
    const owner = Math.max(word, 0);
    const recited = owner < progress.revealedWordCount;
    if (!recited && i >= hintLevel) return;
    shown.push({
      text,
      style: progress.mistakeWordIndexes.has(owner) ? "mistake" : recited ? "recited" : "hint",
    });
  });
  return shown;
}

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
