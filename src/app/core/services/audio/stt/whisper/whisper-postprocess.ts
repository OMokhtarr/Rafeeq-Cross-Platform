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

/** Whisper punctuates ("الرحيم."، "شكرا،"), and normalizeArabic keeps
 *  punctuation, so words are compared on their letters and marks alone. */
function comparable(text: string): string {
  return normalizeArabic(text.replace(/[^\p{L}\p{M}\s]/gu, ""));
}

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
].map(comparable);

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
  const words = comparable(text).split(" ").filter(Boolean);
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

/** The kept words, and how many each filter dropped — for diagnosing a
 *  phrase that came out empty or short. */
export interface FilteredWords {
  words: string[];
  droppedHallucination: number;
  droppedSilence: number;
}

/** Trimmed, non-empty words of a list that may hold non-strings. */
function cleanList(words: unknown[]): string[] {
  return words
    .map((w) => (typeof w === "string" ? w.trim() : ""))
    .filter(Boolean);
}

/**
 * Flattens Whisper segments into trimmed words: hallucinated segments are
 * dropped, and words Whisper timed inside silence (it will invent speech
 * there) are dropped using the speech spans the pause segmenter recorded.
 * Segments without word timings fall back to splitting their text.
 */
export function wordsFromSegmentsWithStats(
  segments: WhisperSegment[],
  speechSpans: SpeechSpan[],
): FilteredWords {
  const out: FilteredWords = { words: [], droppedHallucination: 0, droppedSilence: 0 };
  for (const seg of segments) {
    const timed = seg.words && seg.words.length > 0 ? seg.words : undefined;
    const all = cleanList(timed ? timed.map((w) => w.word) : (seg.text ?? "").split(/\s+/));
    if (isLikelyHallucination(seg)) {
      out.droppedHallucination += all.length;
      continue;
    }
    const kept = timed
      ? cleanList(timed.filter((w) => overlapsSpeech(w, speechSpans)).map((w) => w.word))
      : all;
    out.droppedSilence += all.length - kept.length;
    out.words.push(...kept);
  }
  return out;
}

/** The words of `wordsFromSegmentsWithStats`, without the counts. */
export function wordsFromSegments(segments: WhisperSegment[], speechSpans: SpeechSpan[]): string[] {
  return wordsFromSegmentsWithStats(segments, speechSpans).words;
}

const MAX_SEAM_OVERLAP = 8;

/**
 * A forced cut mid-phrase makes the next chunk re-transcribe the words that
 * straddled the cut. Drops the longest head of `next` that equals the tail
 * of `prevTail` (compared on normalized letters), or returns `next` unchanged.
 */
export function stitchSeam(prevTail: string[], next: string[]): string[] {
  const max = Math.min(prevTail.length, next.length, MAX_SEAM_OVERLAP);
  for (let k = max; k >= 1; k--) {
    const tail = prevTail.slice(prevTail.length - k).map(comparable);
    const head = next.slice(0, k).map(comparable);
    if (tail.every((w, i) => w === head[i])) return next.slice(k);
  }
  return next;
}
