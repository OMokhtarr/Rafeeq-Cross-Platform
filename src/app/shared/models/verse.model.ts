/**
 * VERSE / AYAH MODEL
 * Canonical type definitions for Quran verse data used across the app.
 * Extracted and consolidated from the implicit shapes in:
 *   - quranLoader.js  (getVersesForPage return type)
 *   - verseSplitter.js (verse parameter shape)
 *   - mutashabihatUtils.js (richVerses shape)
 *   - QuizTest.js / MutashabihatTest.js (question object shapes)
 */

// ─── Core verse ───────────────────────────────────────────────────────────────

export interface Verse {
  /** Surah number 1–114 */
  sura: number;
  /** Ayah number within the surah */
  aya: number;
  /** Arabic text (with tashkeel) — Uthmani Unicode, used by quiz/search/etc. */
  text: string;
  /** Mushaf page number 1–604 */
  page: number;
  /** Surah name in Arabic (e.g. "الفاتحة") */
  suraNameAr: string;
  /** Surah name in English / transliteration (e.g. "Al-Fatiha") */
  suraName?: string;
  /** Juz number 1–30 (derived from page) */
  juz?: number;
  /**
   * Per-word data from the API. Present after the API path has loaded the
   * verse; absent if only the legacy text seed is available. Used by the
   * Madani renderer (MushafPage) to draw page-perfect glyphs.
   */
  words?: VerseWord[];
}

export interface VerseWord {
  /** 1-based position within the verse, including the end-of-ayah marker. */
  position: number;
  /** "word" for actual words, "end" for the ayah-number ornament. */
  charType: "word" | "end";
  /** Plain Uthmani Unicode for this word (also available as the ornament). */
  textUthmani: string;
  /** QPC V1 glyph code — pair with font p{NNN}.ttf for true Madani layout. */
  codeV1: string;
  /** Mushaf line number 1–15 on the page this word lives on. */
  lineNumber: number;
  /** Mushaf page number 1–604. */
  pageNumber: number;
}

// ─── Quiz question shapes ─────────────────────────────────────────────────────

/**
 * A standard verse-completion quiz question.
 * Produced by quiz-engine.service.ts (was: verseSplitter.createQuizQuestion).
 */
export interface QuizQuestion {
  id: string; // "sura:aya" e.g. "2:255"
  sura: number;
  aya: number;
  suraName: string;
  suraNameAr: string;
  page: number;
  fullText: string;
  /** The portion shown to the user as the prompt */
  displayedPortion: string;
  /** The hidden portion the user must complete */
  hiddenPortion: string;
  splitPoint: number;
  splitMethod: "firstHalf" | "widthConstrained";
  previousVersesContext: Verse[];
  nextVersesForProgression: Verse[];
  correctAnswer: string;
  difficulty: "easy" | "medium" | "hard";
  // Legacy compat — matches old `versePart` field used in VerseContextViewer
  versePart?: string;
  words?: string[];
}

/**
 * A mutashabihat quiz question.
 * Produced by mutashabihatUtils.buildMutashabihatQuestion.
 */
export interface MutashabihatQuestion {
  groupId: string;
  targetVerse: Verse & { hiddenStart: string };
  siblingVerses: Array<Verse & { hiddenStart: string }>;
  sharedPhrase: string;
  displayedPortion: string;
  hiddenPortion: string;
  hints: string[];
  // Legacy compat fields used by VerseContextViewer
  sura: number;
  aya: number;
  suraNameAr: string;
  suraName: string;
  page: number;
  fullText: string;
  versePart: string;
  correctAnswer: string;
}

// ─── Quiz config shapes ───────────────────────────────────────────────────────

export type QuizScopeType = "surah" | "page" | "juz";

/** Passed via navigation state from QuizSetup → QuizTest */
export interface QuizConfig {
  type: QuizScopeType;
  surah: number | null;
  pageFrom: number | null;
  pageTo: number | null;
  juzs: number[];
  questionCount: number;
  difficulty: "easy" | "medium" | "hard";
}

/** Passed via navigation state from MutashabihatSetup → MutashabihatTest */
export interface MutashabihatConfig {
  mode: "mutashabihat";
  scopeType: QuizScopeType;
  selectedSurahs: number[];
  pageFrom: number | null;
  pageTo: number | null;
  selectedJuzs: number[];
  questionCount: number;
}
