/**
 * ARABIC UTILITIES
 * Previously each file had its own local copy — now one canonical source.
 */

// ─── Number conversion ────────────────────────────────────────────────────────

/**
 * Convert Western/ASCII digits to Eastern Arabic-Indic digits.
 * e.g. 123 → "١٢٣"
 * Extracted from: QuizTest.js (toHindiNumbers), QuizSetup.js (toHindi),
 *                 MutashabihatSetup.js (toHindi), MutashabihatTest.js (toHindi)
 */
export const toHindiNumbers = (number: number | string): string => {
  if (number === undefined || number === null) return "";
  const hindiDigits = ["٠", "١", "٢", "٣", "٤", "٥", "٦", "٧", "٨", "٩"];
  return number
    .toString()
    .replace(/\d/g, (digit) => hindiDigits[parseInt(digit)]);
};

// ─── Diacritics ───────────────────────────────────────────────────────────────

/**
 * Arabic diacritics (tashkeel) Unicode ranges used across the app.
 */
const DIACRITIC_RE =
  /[\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E4\u06E7\u06E8\u06EA-\u06ED]/g;
const PAUSE_RE = /[ۚۖۗۘۙۛ۝]/g;

/**
 * Strip Arabic diacritics (تشكيل) and pause marks from text.
 * Used for answer checking (fuzzy match) and search normalisation.
 */
export const removeDiacritics = (text: string): string => {
  if (!text) return "";
  return text
    .replace(DIACRITIC_RE, "")
    .replace(PAUSE_RE, "")
    .replace(/\s+/g, " ")
    .trim();
};

/** Alias for removeDiacritics */
export const stripDiacritics = removeDiacritics;

// ─── Answer checking ──────────────────────────────────────────────────────────

/**
 * Normalise a string for loose answer comparison:
 * strip diacritics, collapse whitespace, lowercase.
 */
export const normaliseAnswer = (text: string): string =>
  removeDiacritics(text).toLowerCase().replace(/\s+/g, " ").trim();
