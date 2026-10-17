import { normalizeArabic } from "../../../quran/recite-matcher.service";
import type { SpeechSpan } from "./pause-segmenter";

/**
 * Segment-level hallucination filter. `no_speech_prob` alone misses a lot —
 * it specifically measures "is this silence," so background noise (room
 * hum, breathing, rustling) that isn't literal silence can still get a low
 * no_speech_prob while the model hallucinates plausible-sounding Arabic
 * over it. Combined with `avg_logprob` (how confident the model actually
 * was token-by-token) and `compression_ratio` (flags repetitive/degenerate
 * text, a classic hallucination signature), this is the standard heuristic
 * used by whisper.cpp / faster-whisper to drop bad segments.
 *
 * Like faster-whisper, a moderate no_speech_prob only drops the segment when
 * the transcription is *also* unconfident — real recitation sometimes scores
 * just over 0.6 on no_speech (echo, mic distance) while the model is quite
 * sure about the words themselves, and dropping on no_speech alone was
 * discarding genuine verses. Only a very high no_speech_prob drops
 * unconditionally.
 *
 * A field Workers AI did not return skips its check. It is never read as 0:
 * a missing avg_logprob must be neither "confident" nor "unconfident".
 */
const NO_SPEECH_THRESHOLD = 0.6;
const NO_SPEECH_HARD_THRESHOLD = 0.85;
const NO_SPEECH_MIN_AVG_LOGPROB = -0.5;
const MIN_AVG_LOGPROB = -1.0;
const MAX_COMPRESSION_RATIO = 2.4;

/** A word timed in seconds. */
export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperSegment {
  text?: string;
  start?: number;
  end?: number;
  avg_logprob?: number;
  no_speech_prob?: number;
  compression_ratio?: number;
  words?: WhisperWord[];
}

/**
 * Words that only ever show up in Whisper's hallucinated subtitle-credit
 * artifacts (e.g. "ترجمة نانسي قنقر" — "translated by Nancy Qanqar", a
 * well-known Whisper hallucination inherited from YouTube subtitle
 * training data) and never appear in Quranic text. The numeric heuristics
 * above miss these — they're short, coherent, non-repetitive phrases that
 * score fine on confidence and compression — so a domain-specific
 * blocklist catches what they can't.
 */
const HALLUCINATION_TRIGGER_WORDS = [
  "ترجمة",
  "مترجم",
  "مشاهدة",
  "اشتراك",
  "اشتركوا",
  "قناة",
  "تابعونا",
  "لايك",
  "سبسكرايب",
  "موسيقى",
  "شكرا",
].map(normalizeArabic);

/** Strips a leading conjunction/preposition proclitic (و/ف/ب/ك/ل) and the
 *  definite article (ال) so "القناة"/"وقناة" still compare equal to the bare
 *  trigger "قناة". */
function stripProclitics(word: string): string {
  return word.replace(/^(?:[وفبكل])?(?:ال)?/, "");
}

/**
 * True if any *whole word* of `text` is a hallucination trigger. Matching
 * whole words (not substrings) is essential: "الملائكة" (the angels, a very
 * common Quranic word) normalizes to "للملايكه", which *contains* the
 * substring "لايك" — a naive `includes` check drops the opening of every
 * verse that mentions angels.
 */
function containsHallucinationPhrase(text: string): boolean {
  const words = normalizeArabic(text).split(" ").filter(Boolean);
  return words.some((w) => {
    const bare = stripProclitics(w);
    return HALLUCINATION_TRIGGER_WORDS.some((t) => w === t || bare === t);
  });
}

/**
 * Catches degenerate output like "ششششششششششششش" — Whisper repeating a
 * single character over background noise. `compression_ratio` sometimes
 * misses short instances of this (not enough repetition to trip the
 * threshold), so this checks directly for a character run of 4+.
 */
const REPEATED_CHAR_RUN = /(\S)\1{3,}/;

function isDegenerateRun(text: string): boolean {
  return REPEATED_CHAR_RUN.test(normalizeArabic(text).replace(/\s+/g, ""));
}

export function isLikelyHallucination(seg: WhisperSegment): boolean {
  const { no_speech_prob: noSpeech, avg_logprob: logprob, compression_ratio: compression } = seg;
  if (noSpeech !== undefined && noSpeech >= NO_SPEECH_HARD_THRESHOLD) return true;
  if (
    noSpeech !== undefined &&
    logprob !== undefined &&
    noSpeech >= NO_SPEECH_THRESHOLD &&
    logprob < NO_SPEECH_MIN_AVG_LOGPROB
  ) {
    return true;
  }
  if (logprob !== undefined && logprob < MIN_AVG_LOGPROB) return true;
  if (compression !== undefined && compression > MAX_COMPRESSION_RATIO) return true;
  const text = seg.text ?? "";
  if (containsHallucinationPhrase(text)) return true;
  if (isDegenerateRun(text)) return true;
  return false;
}

/**
 * Whisper timestamps are approximate and the segmenter's span edges are
 * pause-detector decisions, so a word is kept when it comes within this
 * margin of a speech span rather than only when it lies strictly inside.
 */
const SPAN_MARGIN_MS = 100;

function overlapsSpeech(word: WhisperWord, spans: SpeechSpan[]): boolean {
  const startMs = word.start * 1000;
  const endMs = word.end * 1000;
  return spans.some(
    (s) => startMs < s.endMs + SPAN_MARGIN_MS && endMs > s.startMs - SPAN_MARGIN_MS,
  );
}

/**
 * Flattens Whisper segments into trimmed words: hallucinated segments are
 * dropped, and words Whisper timed inside silence (it will invent speech
 * there) are dropped using the speech spans the pause segmenter recorded.
 * Segments without word timings fall back to splitting their text.
 */
export function wordsFromSegments(segments: WhisperSegment[], speechSpans: SpeechSpan[]): string[] {
  const out: string[] = [];
  for (const seg of segments) {
    if (isLikelyHallucination(seg)) continue;
    const timed = seg.words && seg.words.length > 0 ? seg.words : undefined;
    const words = timed
      ? timed.filter((w) => overlapsSpeech(w, speechSpans)).map((w) => w.word)
      : (seg.text ?? "").split(/\s+/);
    for (const w of words) {
      const trimmed = w.trim();
      if (trimmed) out.push(trimmed);
    }
  }
  return out;
}

const MAX_SEAM_OVERLAP = 8;

/**
 * A forced cut mid-phrase makes the next chunk re-transcribe the words that
 * straddled the cut. Drops the longest head of `next` that equals the tail
 * of `prevTail` (compared normalized), or returns `next` unchanged.
 */
export function stitchSeam(prevTail: string[], next: string[]): string[] {
  const max = Math.min(prevTail.length, next.length, MAX_SEAM_OVERLAP);
  for (let k = max; k >= 1; k--) {
    const tail = prevTail.slice(prevTail.length - k).map(normalizeArabic);
    const head = next.slice(0, k).map(normalizeArabic);
    if (tail.every((w, i) => w === head[i])) return next.slice(k);
  }
  return next;
}
