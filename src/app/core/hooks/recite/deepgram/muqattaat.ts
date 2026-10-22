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
import { MUQATTAAT_OPENERS, spelledLetters } from "../../../services/quran/recite-muqattaat";

/** A muqatta'at run is at most 5 letter names (كهيعص). */
const MAX_OPENER_TOKENS = 5;

/**
 * If `text` (already the start of an identify buffer/utterance) opens with
 * a run of spelled-out Arabic letter names, replaces that run with the
 * compact canonical form when it matches a real muqatta'at sequence.
 * Leaves everything else untouched — including the rest of `text` after the
 * run, so "الف لاميم أم يقولون" still becomes "الم أم يقولون". A run that
 * doesn't assemble into one of the known openers is left alone (most
 * likely just normal speech that happens to contain a short word), so this
 * can't misfire on ordinary recitation.
 */
export function correctMuqattaatOpening(text: string): string {
  const words = normalizeArabic(text).split(" ").filter(Boolean);
  if (!words.length) return text;

  // Longest prefix of the buffer that spells a real opener wins.
  let consumed = 0;
  let letters = "";
  for (let n = 1; n <= Math.min(MAX_OPENER_TOKENS, words.length); n++) {
    const spelled = spelledLetters(words.slice(0, n));
    if (spelled && MUQATTAAT_OPENERS.includes(spelled)) {
      consumed = n;
      letters = spelled;
    }
  }

  if (consumed === 0) return text;

  const rest = words.slice(consumed).join(" ");
  return rest ? `${letters} ${rest}` : letters;
}
