/**
 * SPELL OUT NUMBERS
 *
 * Soniox writes spoken numbers as digits (تسعة عشر → "19"), but the Quran
 * spells them out, so a recited number never matched its verse word. This
 * turns digits back into Arabic words before the transcript is shown or
 * matched.
 *
 * Digits do not say which form was recited (ثلاث or ثلاثة, عشرين or
 * عشرون), so the words get a low confidence: mistake detection then forgives
 * a one-letter difference instead of marking the word red.
 */

import type { SttWord } from "./types";

/** Below recite mode's LOW_CONFIDENCE (0.6), so the guessed form is forgiven. */
export const SPELLED_NUMBER_CONFIDENCE = 0.5;

const ONES = ["", "واحد", "اثنين", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
/** The form before مئة: ثلاث مئة, تسع مئة. */
const HUNDRED_COUNT = ["", "", "", "ثلاث", "أربع", "خمس", "ست", "سبع", "ثماني", "تسع"];
const TENS = ["", "", "عشرين", "ثلاثين", "أربعين", "خمسين", "ستين", "سبعين", "ثمانين", "تسعين"];

const DIGITS = /[0-9٠-٩۰-۹]/;
/** Letters before the number, the number (with any thousands separators),
 *  then whatever follows it. */
const NUMBER_IN_WORD = /^(\D*?)([0-9٠-٩۰-۹]+(?:[,٬][0-9٠-٩۰-۹]{3})*)(.*)$/;

function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => {
    const c = d.charCodeAt(0);
    return String(c >= 0x06f0 ? c - 0x06f0 : c - 0x0660);
  });
}

/** Joins number parts with و on the first word of every part after the first. */
function joinParts(parts: string[][]): string[] {
  return parts
    .filter((p) => p.length > 0)
    .flatMap((p, i) => (i === 0 ? p : ["و" + p[0], ...p.slice(1)]));
}

function below100(n: number): string[] {
  if (n === 0) return [];
  if (n <= 10) return [ONES[n]];
  if (n === 11) return ["أحد", "عشر"];
  if (n === 12) return ["اثنا", "عشر"];
  if (n < 20) return [ONES[n - 10], "عشر"];
  const unit = n % 10;
  const tens = [TENS[Math.floor(n / 10)]];
  return unit ? joinParts([[ONES[unit]], tens]) : tens;
}

function below1000(n: number): string[] {
  const h = Math.floor(n / 100);
  const hundreds = h === 0 ? [] : h === 1 ? ["مئة"] : h === 2 ? ["مئتين"] : [HUNDRED_COUNT[h], "مئة"];
  return joinParts([hundreds, below100(n % 100)]);
}

/** Arabic words for 1–999,999, or null for anything else. */
export function spellNumber(n: number): string[] | null {
  if (!Number.isInteger(n) || n < 1 || n > 999_999) return null;
  const k = Math.floor(n / 1000);
  let thousands: string[] = [];
  if (k === 1) thousands = ["ألف"];
  else if (k === 2) thousands = ["ألفين"];
  else if (k >= 3 && k <= 10) thousands = [...below1000(k), "آلاف"];
  else if (k > 10) thousands = [...below1000(k), "ألف"];
  return joinParts([thousands, below1000(n % 1000)]);
}

/** One recognizer word, with any number in it spelled out (ب3000 → بثلاثة آلاف). */
function spellWord(word: string): string[] {
  const m = word.match(NUMBER_IN_WORD);
  if (!m) return [word];
  const [, prefix, number, rest] = m;
  const spelled = spellNumber(parseInt(toWesternDigits(number).replace(/[,٬]/g, ""), 10));
  if (!spelled) return [word];
  // A joined particle (و، ب، ل) stays on the first word; a tatweel or hyphen
  // between it and the digits (بـ3000) is dropped.
  const lead = prefix.replace(/[ـ-]/g, "");
  const words = [lead + spelled[0], ...spelled.slice(1)];
  return rest ? [...words, ...spellWord(rest)] : words;
}

/** The transcript text with numbers spelled out; unchanged when it has none. */
export function spellNumbersInText(text: string): string {
  if (!DIGITS.test(text)) return text;
  return text
    .split(/(\s+)/)
    .map((piece) => (piece && !/^\s+$/.test(piece) ? spellWord(piece).join(" ") : piece))
    .join("");
}

/** The words with numbers spelled out, each spelled word at low confidence. */
export function spellNumbersInWords(words: SttWord[]): SttWord[] {
  return words.flatMap((w) => {
    if (!DIGITS.test(w.word)) return [w];
    const confidence = Math.min(w.confidence, SPELLED_NUMBER_CONFIDENCE);
    return spellWord(w.word).map((word) => ({ word, confidence }));
  });
}
