/**
 * SPEECH-TO-TEXT SERVICE
 *
 * Transcribes short Arabic audio chunks for Recite Mode. Wraps Groq's
 * hosted Whisper endpoint (whisper-large-v3) behind a small interface so
 * the provider can be swapped later without touching the capture or
 * matching logic.
 */

import { normalizeArabic } from "../quran/recite-matcher.service";

const GROQ_API_KEY = process.env.REACT_APP_GROQ_API_KEY ?? "";
const GROQ_TRANSCRIPTION_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";

if (!GROQ_API_KEY) {
  console.warn(
    "[speech-to-text] REACT_APP_GROQ_API_KEY is not set — Recite Mode transcription will fail.",
  );
}

export interface TranscribeOptions {
  /** BCP-47-ish language hint passed to the STT provider. */
  language?: string;
  /**
   * Expected upcoming text, passed as Whisper's `prompt` param to bias
   * decoding toward this vocabulary/phrasing instead of guessing blind —
   * the single biggest lever for accuracy on Quranic recitation, which a
   * general-purpose Whisper model has no special training on otherwise.
   * Whisper only uses the last ~224 tokens of the prompt, so callers
   * should pass a handful of upcoming words, not the whole page.
   */
  prompt?: string;
}

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
 */
const NO_SPEECH_THRESHOLD = 0.6;
const NO_SPEECH_HARD_THRESHOLD = 0.85;
const NO_SPEECH_MIN_AVG_LOGPROB = -0.5;
const MIN_AVG_LOGPROB = -1.0;
const MAX_COMPRESSION_RATIO = 2.4;

interface WhisperSegment {
  text?: string;
  no_speech_prob?: number;
  avg_logprob?: number;
  compression_ratio?: number;
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

function isLikelyHallucination(seg: WhisperSegment): boolean {
  const noSpeech = seg.no_speech_prob ?? 0;
  const logprob = seg.avg_logprob ?? 0;
  if (noSpeech >= NO_SPEECH_HARD_THRESHOLD) return true;
  if (noSpeech >= NO_SPEECH_THRESHOLD && logprob < NO_SPEECH_MIN_AVG_LOGPROB) return true;
  if (logprob < MIN_AVG_LOGPROB) return true;
  if ((seg.compression_ratio ?? 0) > MAX_COMPRESSION_RATIO) return true;
  if (containsHallucinationPhrase(seg.text ?? "")) return true;
  if (isDegenerateRun(seg.text ?? "")) return true;
  return false;
}

/** Set after a 429 response, holding the Unix-ms timestamp before which
 *  further requests should be skipped locally instead of hitting the API
 *  again — avoids hammering Groq (and burning the caller's retry budget)
 *  while the rate limit window is still active. */
let rateLimitedUntil = 0;

export class RateLimitedError extends Error {
  constructor(readonly retryAfterMs: number) {
    super("Groq rate limit in effect");
  }
}

/**
 * Transcribes one audio chunk and returns the raw recognized text, with
 * segments Whisper flagged as likely silence/hallucination filtered out.
 * Throws `RateLimitedError` while a prior 429's cooldown is still active
 * (without making a network call), or a plain `Error` on other API/network
 * failures — callers should treat either as "this chunk produced no text"
 * and keep listening rather than surfacing a hard failure to the user.
 */
export async function transcribeChunk(
  audioBlob: Blob,
  options: TranscribeOptions = {},
): Promise<string> {
  if (!GROQ_API_KEY) {
    throw new Error("Groq API key is not configured");
  }

  const now = Date.now();
  if (now < rateLimitedUntil) {
    throw new RateLimitedError(rateLimitedUntil - now);
  }

  const form = new FormData();
  const ext = audioBlob.type.includes("mp4") ? "mp4" : "webm";
  form.append("file", audioBlob, `chunk.${ext}`);
  form.append("model", "whisper-large-v3");
  form.append("language", options.language ?? "ar");
  form.append("response_format", "verbose_json");
  if (options.prompt) form.append("prompt", options.prompt);

  const res = await fetch(GROQ_TRANSCRIPTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
    body: form,
  });

  if (res.status === 429) {
    const retryAfterSec = parseFloat(res.headers.get("retry-after") ?? "");
    const retryAfterMs = Number.isFinite(retryAfterSec) ? retryAfterSec * 1000 : 15000;
    rateLimitedUntil = Date.now() + retryAfterMs;
    throw new RateLimitedError(retryAfterMs);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Groq transcription failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  const segments: WhisperSegment[] | null = Array.isArray(data.segments) ? data.segments : null;
  if (!segments) {
    const text = typeof data.text === "string" ? data.text : "";
    logTranscription([], text);
    return text;
  }

  const kept = segments.filter((seg) => !isLikelyHallucination(seg));
  const text = kept.map((seg) => seg.text ?? "").join(" ").trim();
  logTranscription(segments, text);
  return text;
}

/**
 * Dev-only console logging of every transcription attempt, including
 * segments the hallucination filter dropped — lets you see raw Whisper
 * output (with its confidence signals) when diagnosing noise-triggered
 * hallucinations instead of only seeing the already-filtered text.
 */
function logTranscription(segments: WhisperSegment[], finalText: string): void {
  if (!segments.length) {
    console.log(`[recite-stt] (no segments) -> "${finalText}"`);
    return;
  }
  console.log(`[recite-stt] chunk: ${segments.length} segment(s) -> "${finalText}"`);
  segments.forEach((seg, i) => {
    const dropped = isLikelyHallucination(seg);
    console.log(
      `[recite-stt]   ${dropped ? "DROPPED" : "kept   "} #${i} no_speech=${(seg.no_speech_prob ?? 0).toFixed(2)} ` +
        `avg_logprob=${(seg.avg_logprob ?? 0).toFixed(2)} compression=${(seg.compression_ratio ?? 0).toFixed(2)} ` +
        `text=${JSON.stringify(seg.text ?? "")}`,
    );
  });
}
