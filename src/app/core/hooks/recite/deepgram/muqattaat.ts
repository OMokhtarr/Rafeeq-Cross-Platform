/**
 * MUQATTA'AT CORRECTION — Deepgram-only identify-text cleanup.
 *
 * 29 Quran surahs open with "disconnected letters" (الم، يس، طه، حم...) — a
 * short sequence of letter *names* recited individually, unlike any normal
 * word. Deepgram (trained on conversational speech) tends to transcribe
 * these phonetically as their spoken-out letter names ("الف لام ميم")
 * instead of recognizing the compact Quranic symbol ("الم") — Groq/Whisper
 * doesn't have this problem (it has the Quran's actual orthography in its
 * training data). Since the corpus text search matches against the compact
 * form, a phonetic transcription scores almost nothing, so the whole
 * identify search stalls on the very first phrase of ~90 verses across the
 * Quran until enough of the *following* words accumulate to compensate —
 * this is what produced the ~18s delay on Al-Sajdah 32:1 ("الف لاميم" heard
 * for "الم"): see the session log this was diagnosed from.
 *
 * This is intentionally narrow: it only rewrites text that clearly spells
 * out Arabic letter names in sequence, and only when identifying (never
 * during tracking, where a false correction mid-verse could misrepresent
 * what was actually recited).
 */

import { normalizeArabic } from "../../../services/quran/recite-matcher.service";

/** Every muqatta'at sequence in the Quran, already in normalizeArabic form
 *  (matches how corpus tokens are stored) — the correction target. */
const CANONICAL_OPENERS = [
  "الم",
  "يس",
  "طه",
  "المص",
  "الر",
  "المر",
  "كهيعص",
  "طسم",
  "طس",
  "ص",
  "حم",
  "ق",
  "ن",
];

/** Arabic letter *names* as Deepgram tends to spell them out phonetically,
 *  keyed by the letter(s) they spell out (normalized form — usually one
 *  letter, but a run of names can get fused into a single STT word, e.g.
 *  "لاميم" for "لام"+"ميم" = ل+م). Built from the standard Arabic alphabet
 *  names — only the letters that actually appear in a muqatta'at sequence
 *  are needed here. Each entry is tried against the input text in sequence
 *  to reconstruct which opener was spoken; entries are normalizeArabic'd so
 *  variant spellings the STT might use (with/without a trailing ه) still
 *  match. */
const LETTER_NAMES: Record<string, string[]> = {
  ا: ["الف"],
  ل: ["لام"],
  م: ["ميم"],
  لم: ["لاميم"], // "لام"+"ميم" fused into one STT word, seen in practice
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

/** Reverse index: normalized phonetic spelling -> the letter(s) it spells
 *  out. Probed longest-word-first isn't needed here (each input word is
 *  looked up whole, never as a substring), but the map itself may resolve
 *  to more than one letter per matched word (see "لاميم" above). */
const PHONETIC_TO_LETTERS = new Map<string, string>();
for (const [letters, names] of Object.entries(LETTER_NAMES)) {
  for (const name of names) PHONETIC_TO_LETTERS.set(normalizeArabic(name), letters);
}

/**
 * If `text` (already the start of an identify buffer/utterance) opens with
 * a run of spelled-out Arabic letter names, replaces that run with the
 * compact canonical form when it matches a real muqatta'at sequence.
 * Leaves everything else untouched — including the rest of `text` after the
 * run, so "الف لاميم أم يقولون" still becomes "الم أم يقولون". A run that
 * doesn't assemble into one of the 13 known openers is left alone (most
 * likely just normal speech that happens to contain a short word), so this
 * can't misfire on ordinary recitation.
 */
export function correctMuqattaatOpening(text: string): string {
  const words = normalizeArabic(text).split(" ").filter(Boolean);
  if (!words.length) return text;

  let consumed = 0;
  let letters = "";
  while (consumed < words.length) {
    const spelled = PHONETIC_TO_LETTERS.get(words[consumed]);
    if (!spelled) break;
    const extended = letters + spelled;
    // A muqatta'at run is at most 5 letters (كهيعص) — stop as soon as no
    // canonical opener could possibly still match this prefix, so this
    // never runs away consuming ordinary recitation.
    if (!CANONICAL_OPENERS.some((o) => o.startsWith(extended))) break;
    letters = extended;
    consumed += 1;
  }

  if (consumed === 0 || !CANONICAL_OPENERS.includes(letters)) return text;

  const rest = words.slice(consumed).join(" ");
  return rest ? `${letters} ${rest}` : letters;
}
