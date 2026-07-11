/**
 * OPENING-PHRASE STRIPPING — Deepgram-only identify-text cleanup.
 *
 * Reciters almost always precede the actual verse with two set phrases that
 * are NOT the verse being sought:
 *   - the isti'adhah: "أعوذ بالله من الشيطان الرجيم" (and slightly longer
 *     variants) — never Quranic text at all;
 *   - the basmalah: "بسم الله الرحمن الرحيم" — generic filler before almost
 *     every surah, though it IS also genuine verse text (1:1 Al-Fatiha,
 *     27:30 An-Naml).
 *
 * Left in the identify buffer, they pollute the whole-Quran scorer: the
 * basmalah alone matches 1:1 and the head of dozens of surahs, dragging the
 * ranking toward Al-Fatiha regardless of what's actually being recited. So
 * we strip them as a *leading prefix* before the search runs.
 *
 * Basmalah safety (the one subtlety): it's only stripped when real words
 * follow it — identify by what comes after. If the buffer is *only* the
 * basmalah (someone opening Al-Fatiha and not past 1:1 yet), it's left
 * intact: stripping would leave nothing to search, and keeping it lets 1:1
 * still resolve. The isti'adhah is always stripped — it's never verse text,
 * so there's no verse to lose.
 *
 * Like ./muqattaat.ts this runs at identify time only, never during
 * tracking (where the reciter is mid-verse and these phrases can't appear).
 */

import { normalizeArabic } from "../../../services/quran/recite-matcher.service";

/** First two words of the isti'adhah — its stable, invariant head. Deepgram
 *  may spell the rest a few ways ("...السميع العليم من الشيطان الرجيم"), so
 *  we anchor on this opening and consume forward to its closing word rather
 *  than matching one fixed string. */
const ISTIADHAH_HEAD = ["اعوذ", "بالله"];
/** The isti'adhah always ends on this word — consume up to and including it. */
const ISTIADHAH_END = "الرجيم";
/** Safety bound: a real isti'adhah is ~5 words, ~7 in its longest common
 *  form. If الرجيم isn't reached within this many words of the head, this
 *  isn't an isti'adhah (just speech starting "أعوذ بالله …") — leave it. */
const ISTIADHAH_MAX_WORDS = 8;

/** The basmalah, normalized — a fixed four-word phrase. */
const BASMALAH = ["بسم", "الله", "الرحمن", "الرحيم"];

/** Consumes a leading isti'adhah if present; returns the words after it (or
 *  the original words unchanged when there's no isti'adhah opening). */
function stripIstiadhah(words: string[]): string[] {
  if (words[0] !== ISTIADHAH_HEAD[0] || words[1] !== ISTIADHAH_HEAD[1]) return words;
  const end = words
    .slice(0, ISTIADHAH_MAX_WORDS)
    .findIndex((w) => w === ISTIADHAH_END);
  if (end === -1) return words; // opening without a close — not the isti'adhah
  return words.slice(end + 1);
}

/** Consumes a leading basmalah *only if real words follow it*; otherwise
 *  leaves the words untouched (so a bare basmalah can still resolve to its
 *  own verse, e.g. Al-Fatiha 1:1). */
function stripBasmalah(words: string[]): string[] {
  const followsBasmalah = BASMALAH.every((b, i) => words[i] === b);
  if (!followsBasmalah) return words;
  const rest = words.slice(BASMALAH.length);
  return rest.length ? rest : words;
}

/**
 * Strips a leading isti'adhah and/or basmalah from identify text so the
 * whole-Quran search scores against the real recited verse, not the generic
 * opening. Operates on the normalized token stream; returns normalized text
 * (the search normalizes its input anyway, so this loses nothing). Returns
 * the input unchanged when no opening phrase is present.
 */
export function stripOpeningPhrases(text: string): string {
  const words = normalizeArabic(text).split(" ").filter(Boolean);
  if (!words.length) return text;

  const afterIstiadhah = stripIstiadhah(words);
  const afterBasmalah = stripBasmalah(afterIstiadhah);

  // Nothing was an opening phrase — hand back the original untouched.
  if (afterBasmalah === words) return text;
  return afterBasmalah.join(" ");
}
