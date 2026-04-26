/**
 * QUIZ ENGINE SERVICE
 * Migrated from: src/shared/utils/verseSplitter.js
 *
 * All logic preserved exactly. Changes:
 *  1. TypeScript types added
 *  2. Moved into a service class so it can be injected / mocked in tests
 *  3. measureTextWidth guard added for worker environments (no DOM)
 *  4. createQuizQuestion renamed to createQuestion (original name kept as alias)
 */

import type { Verse, QuizQuestion } from "../../../shared/models/verse.model";

// ─── Text measurement ─────────────────────────────────────────────────────────

/**
 * Measure the visual pixel width of an Arabic string.
 * Uses a temporary canvas — identical to the original verseSplitter.js.
 * Falls back to character count × 12 in worker / non-DOM environments.
 *
 * Original source: verseSplitter.js → measureTextWidth()
 */
function measureTextWidth(text: string): number {
  if (!text) return 0;

  // Guard: canvas is not available in Web Workers
  if (typeof document === "undefined") {
    return text.length * 12; // rough px-per-char estimate
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return text.length * 12;

  ctx.font = '1.2rem "Traditional Arabic", "Amiri", "Scheherazade New", serif';
  return ctx.measureText(text).width;
}

// ─── Split strategies ─────────────────────────────────────────────────────────

/**
 * Split verse into two halves by word count.
 * Original source: verseSplitter.js → getFirstHalf()
 */
function getFirstHalf(text: string) {
  if (!text) return { displayedPortion: "", hiddenPortion: "", splitPoint: 0 };

  const words = text.split(" ");
  const midpoint = Math.floor(words.length / 2);

  return {
    displayedPortion: words.slice(0, midpoint).join(" "),
    hiddenPortion: words.slice(midpoint).join(" "),
    splitPoint: midpoint,
    isFirstHalf: true as const,
    wordCount: words.length,
  };
}

/**
 * Split verse to fit within a pixel-width constraint.
 * Original source: verseSplitter.js → getWidthConstrainedPortion()
 */
function getWidthConstrainedPortion(text: string, maxWidth = 750) {
  if (!text) return { displayedPortion: "", hiddenPortion: "", splitPoint: 0 };

  const words = text.split(" ");
  const displayed: string[] = [];
  const minWords = Math.max(2, Math.floor(words.length / 4));

  for (let i = 0; i < words.length; i++) {
    const testText = [...displayed, words[i]].join(" ");
    if (measureTextWidth(testText) <= maxWidth) {
      displayed.push(words[i]);
    } else {
      if (displayed.length < minWords) displayed.push(words[i]);
      break;
    }
  }

  const hidden = words.slice(displayed.length);

  return {
    displayedPortion: displayed.join(" "),
    hiddenPortion: hidden.join(" "),
    splitPoint: displayed.length,
    isWidthConstrained: true as const,
    wordCount: words.length,
    displayedWordCount: displayed.length,
    hiddenWordCount: hidden.length,
  };
}

// ─── Public split function ────────────────────────────────────────────────────

/**
 * Intelligently split a verse for quiz question display.
 * Original source: verseSplitter.js → splitVerseForQuiz()
 */
export function splitVerseForQuiz(
  verseText: string,
  containerWidth = 750,
):
  | ReturnType<typeof getFirstHalf>
  | ReturnType<typeof getWidthConstrainedPortion> {
  if (!verseText)
    return { displayedPortion: "", hiddenPortion: "", splitPoint: 0 };

  const words = verseText.split(" ");

  if (words.length <= 10) {
    return getFirstHalf(verseText);
  }

  const firstHalf = getFirstHalf(verseText);
  if (measureTextWidth(firstHalf.displayedPortion) <= containerWidth) {
    return firstHalf;
  }

  return getWidthConstrainedPortion(verseText, containerWidth);
}

// ─── Context helpers ──────────────────────────────────────────────────────────

/**
 * Get up to 3 verses before the target verse on the same page.
 * Original source: verseSplitter.js → getPreviousVersesContext()
 */
export function getPreviousVersesContext(
  pageVerses: Verse[],
  targetVerse: Pick<Verse, "sura" | "aya">,
): Verse[] {
  if (!pageVerses || !Array.isArray(pageVerses)) return [];
  const targetIndex = pageVerses.findIndex(
    (v) => v.sura === targetVerse.sura && v.aya === targetVerse.aya,
  );
  if (targetIndex <= 0) return [];
  const contextCount = Math.min(3, targetIndex);
  return pageVerses.slice(Math.max(0, targetIndex - contextCount), targetIndex);
}

/**
 * Get up to `count` verses after the target verse on the same page.
 * Original source: verseSplitter.js → getNextVersesForProgression()
 */
export function getNextVersesForProgression(
  pageVerses: Verse[],
  targetVerse: Pick<Verse, "sura" | "aya">,
  count = 3,
): Verse[] {
  if (!pageVerses || !Array.isArray(pageVerses)) return [];
  const targetIndex = pageVerses.findIndex(
    (v) => v.sura === targetVerse.sura && v.aya === targetVerse.aya,
  );
  if (targetIndex === -1 || targetIndex >= pageVerses.length - 1) return [];
  return pageVerses.slice(
    targetIndex + 1,
    Math.min(targetIndex + 1 + count, pageVerses.length),
  );
}

// ─── Question factory ─────────────────────────────────────────────────────────

/**
 * Create a quiz question with smart verse splitting.
 * Original source: verseSplitter.js → createQuizQuestion()
 * Renamed to createQuestion; original name exported as alias for compatibility.
 */
export function createQuestion(
  verse: Verse & { pageVerses?: Verse[] },
  difficulty: QuizQuestion["difficulty"] = "medium",
): QuizQuestion {
  const splitResult = splitVerseForQuiz(verse.text);

  const previousVersesContext = verse.pageVerses
    ? getPreviousVersesContext(verse.pageVerses, verse)
    : [];

  const nextVersesForProgression = verse.pageVerses
    ? getNextVersesForProgression(verse.pageVerses, verse)
    : [];

  return {
    id: `${verse.sura}:${verse.aya}`,
    sura: verse.sura,
    aya: verse.aya,
    suraName: verse.suraName ?? `Surah ${verse.sura}`,
    suraNameAr: verse.suraNameAr ?? `سورة ${verse.sura}`,
    page: verse.page,
    fullText: verse.text,
    displayedPortion: splitResult.displayedPortion,
    hiddenPortion: splitResult.hiddenPortion,
    splitPoint: splitResult.splitPoint,
    splitMethod:
      "isFirstHalf" in splitResult ? "firstHalf" : "widthConstrained",
    previousVersesContext,
    nextVersesForProgression,
    correctAnswer: splitResult.hiddenPortion.trim(),
    difficulty,
    // Legacy compat
    versePart: splitResult.displayedPortion,
    words: verse.text.split(" "),
  };
}

/** Alias — matches original export name from verseSplitter.js */
export const createQuizQuestion = createQuestion;

// ─── Answer checking ──────────────────────────────────────────────────────────

import { removeDiacritics } from "../../utils/arabic.util";

/**
 * Check if a user's answer matches the correct answer.
 * Logic extracted from QuizTest.js → handleSubmitAnswer().
 * Centralised here so both QuizTest and future quiz types reuse it.
 */
export function checkAnswer(
  userAnswer: string,
  correctAnswer: string,
): boolean {
  const correct = correctAnswer.trim();
  const user = userAnswer.trim();

  return (
    correct.includes(user) ||
    correct === user ||
    removeDiacritics(correct).includes(removeDiacritics(user))
  );
}
