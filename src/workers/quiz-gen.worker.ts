export {};

/**
 * QUIZ GENERATION WORKER
 * Migrated from: src/features/quiz/QuizTest.js → useEffect question generation
 *
 * The original useEffect iterated all 604 pages synchronously to collect verses,
 * then generated questions — all on the main thread. This blocked for 200–500 ms.
 *
 * This worker receives the pre-collected verses + config and generates questions
 * off the main thread.
 *
 * Usage in QuizTest.tsx:
 *   const worker = new Worker(new URL('../../workers/quiz-gen.worker.ts', import.meta.url));
 *   worker.postMessage({ type: 'GENERATE', verses: allVerses, config: quizConfig });
 *   worker.onmessage = (e) => {
 *     if (e.data.type === 'QUESTIONS_READY') setQuestions(e.data.questions);
 *   };
 */

// ─── Inline helpers (no DOM imports in workers) ───────────────────────────────
function measureTextWidth(text: string): number {
  // No canvas in workers — use character-count approximation
  return text.length * 12;
}

function getFirstHalf(text: string) {
  const words = text.split(" ");
  const midpoint = Math.floor(words.length / 2);
  return {
    displayedPortion: words.slice(0, midpoint).join(" "),
    hiddenPortion: words.slice(midpoint).join(" "),
    splitPoint: midpoint,
    isFirstHalf: true,
  };
}

function getWidthConstrainedPortion(text: string, maxWidth = 750) {
  const words = text.split(" ");
  const displayed: string[] = [];
  const minWords = Math.max(2, Math.floor(words.length / 4));
  for (let i = 0; i < words.length; i++) {
    const testWidth = measureTextWidth([...displayed, words[i]].join(" "));
    if (testWidth <= maxWidth) {
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
    isWidthConstrained: true,
  };
}

function splitVerseForQuiz(verseText: string) {
  if (!verseText)
    return { displayedPortion: "", hiddenPortion: "", splitPoint: 0 };
  const words = verseText.split(" ");
  if (words.length <= 10) return getFirstHalf(verseText);
  const firstHalf = getFirstHalf(verseText);
  if (measureTextWidth(firstHalf.displayedPortion) <= 750) return firstHalf;
  return getWidthConstrainedPortion(verseText);
}

function getPreviousVersesContext(pageVerses: any[], targetVerse: any): any[] {
  if (!pageVerses?.length) return [];
  const idx = pageVerses.findIndex(
    (v) => v.sura === targetVerse.sura && v.aya === targetVerse.aya,
  );
  if (idx <= 0) return [];
  return pageVerses.slice(Math.max(0, idx - 3), idx);
}

function getNextVersesForProgression(
  pageVerses: any[],
  targetVerse: any,
): any[] {
  if (!pageVerses?.length) return [];
  const idx = pageVerses.findIndex(
    (v) => v.sura === targetVerse.sura && v.aya === targetVerse.aya,
  );
  if (idx === -1 || idx >= pageVerses.length - 1) return [];
  return pageVerses.slice(idx + 1, Math.min(idx + 4, pageVerses.length));
}

// ─── Question factory ─────────────────────────────────────────────────────────

function createQuestion(verse: any, difficulty = "medium") {
  const split = splitVerseForQuiz(verse.text);
  return {
    id: `${verse.sura}:${verse.aya}`,
    sura: verse.sura,
    aya: verse.aya,
    suraName: verse.suraName ?? `Surah ${verse.sura}`,
    suraNameAr: verse.suraNameAr ?? `سورة ${verse.sura}`,
    page: verse.page,
    fullText: verse.text,
    displayedPortion: split.displayedPortion,
    hiddenPortion: split.hiddenPortion,
    splitPoint: split.splitPoint,
    splitMethod: "isFirstHalf" in split ? "firstHalf" : "widthConstrained",
    previousVersesContext: getPreviousVersesContext(
      verse.pageVerses ?? [],
      verse,
    ),
    nextVersesForProgression: getNextVersesForProgression(
      verse.pageVerses ?? [],
      verse,
    ),
    correctAnswer: split.hiddenPortion.trim(),
    difficulty,
    versePart: split.displayedPortion,
    words: verse.text.split(" "),
  };
}

// ─── Message handler ──────────────────────────────────────────────────────────

self.onmessage = (
  e: MessageEvent<{
    type: "GENERATE";
    verses: any[];
    config: { questionCount: number; difficulty?: string };
  }>,
) => {
  if (e.data.type !== "GENERATE") return;

  const { verses, config } = e.data;
  const numQuestions = Math.min(config.questionCount, verses.length);

  // Shuffle and slice — same logic as QuizTest.js
  const shuffled = [...verses].sort(() => 0.5 - Math.random());
  const selected = shuffled.slice(0, numQuestions);

  const questions = selected.map((verse) =>
    createQuestion(verse, (config.difficulty as any) ?? "medium"),
  );

  self.postMessage({ type: "QUESTIONS_READY", questions });
};
