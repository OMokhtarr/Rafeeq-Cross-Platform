/**
 * MUQATTA'AT DECODING — shared by the identify-time correction and the aligner.
 *
 * A reciter spells the disconnected letters by their names ("الف لام ميم"),
 * and speech-to-text writes them separately, fused ("لاميم", "ياسين") or
 * stretched ("عيييين"). `spelledLetters` turns any of those forms back into
 * the letters they spell.
 */

import { normalizeArabic } from "./recite-matcher.service";

/** Every muqatta'at sequence in the Quran, already in normalizeArabic form
 *  (matches how corpus tokens are stored). */
export const MUQATTAAT_OPENERS: readonly string[] = [
  "الم",
  "المص",
  "الر",
  "المر",
  "كهيعص",
  "طه",
  "طسم",
  "طس",
  "يس",
  "ص",
  "حم",
  "عسق",
  "ق",
  "ن",
];

/** Arabic letter *names* as speech-to-text tends to spell them, keyed by the
 *  letter(s) they spell (usually one letter, but a run of names can get fused
 *  into a single STT word, e.g. "لاميم" for "لام"+"ميم" = ل+م). Only letters
 *  that appear in a muqatta'at sequence are needed. */
const LETTER_NAMES: Record<string, string[]> = {
  ا: ["الف"],
  ل: ["لام"],
  م: ["ميم"],
  لم: ["لاميم"],
  ي: ["يا", "ياء"],
  س: ["سين"],
  ه: ["ها", "هاء"],
  ط: ["طا", "طاء"],
  ص: ["صاد"],
  ر: ["را", "راء"],
  ك: ["كاف"],
  ع: ["عين"],
  ح: ["حا", "حاء"],
  ق: ["قاف"],
  ن: ["نون"],
};

/** Collapses runs of the same letter ("عيييين" -> "عين", "لامميم" -> "لاميم"). */
const collapse = (s: string) => s.replace(/(.)\1+/g, "$1");

/** Collapsed name -> letters it spells, longest names first for the parser. */
const NAMES: ReadonlyArray<readonly [string, string]> = Object.entries(LETTER_NAMES)
  .flatMap(([letters, names]) => names.map((n) => [collapse(normalizeArabic(n)), letters] as const))
  .sort((a, b) => b[0].length - a[0].length);

function parseNames(text: string, from: number): string | null {
  if (from === text.length) return "";
  for (const [name, letters] of NAMES) {
    if (!text.startsWith(name, from)) continue;
    const rest = parseNames(text, from + name.length);
    if (rest !== null) return letters + rest;
  }
  return null;
}

/** Decodes spoken tokens (letter names written separately, joined or
 *  stretched) into the letters they spell, or null when they are not
 *  entirely letter names. */
export function spelledLetters(spoken: string[]): string | null {
  const joined = collapse(spoken.map((t) => normalizeArabic(t).replace(/\s+/g, "")).join(""));
  if (!joined) return null;
  return parseNames(joined, 0);
}
