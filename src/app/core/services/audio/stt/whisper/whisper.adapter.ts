/**
 * CLOUDFLARE WHISPER ADAPTER
 *
 * Recite Mode over Workers AI Whisper (whisper-large-v3-turbo, Arabic).
 * Whisper transcribes whole clips rather than a live stream, so the mic's
 * PCM is cut into phrases at the reciter's pauses (pause-segmenter.ts), each
 * phrase is uploaded as a WAV through the token broker, and every result
 * becomes one final event. There are no interims: a phrase appears once
 * Whisper has heard all of it.
 *
 * The audio never goes straight to Cloudflare — the broker's
 * /whisper/transcribe route holds the Workers AI binding, so no account
 * credential reaches the client.
 */

import { brokerUrl, STT_UNAVAILABLE_MESSAGE } from "../broker";
import { PCM_SAMPLE_RATE, startPcmCapture } from "../pcm-capture";
import type { OpenStream, SttStreamEvent } from "../types";
import { encodeWav } from "../wav";
import { AudioSegment, createPauseSegmenter } from "./pause-segmenter";
import {
  FilteredWords,
  stitchSeam,
  WhisperSegment,
  wordsFromSegmentsWithStats,
} from "./whisper-postprocess";

const TRANSCRIBE_PATH = "/whisper/transcribe";

/** How long one phrase's upload and transcription may take. Results are
 *  emitted in order, so a hung request would hold back every phrase after it. */
const UPLOAD_TIMEOUT_MS = 15000;
const TIMEOUT_MESSAGE = "Speech recognition timed out";

/** How many of the previous phrase's words a forced-cut seam is matched against. */
const SEAM_TAIL_WORDS = 8;

export interface WhisperResult {
  text: string;
  segments?: WhisperSegment[];
}

export type Transcribe = (wav: Blob, signal: AbortSignal) => Promise<WhisperResult>;

/** Uploads one phrase to the broker and returns Whisper's transcript. */
export const transcribeSegment: Transcribe = async (wav, signal) => {
  const res = await fetch(brokerUrl(TRANSCRIBE_PATH), {
    method: "POST",
    headers: { "content-type": "audio/wav" },
    body: wav,
    signal,
  });
  if (!res.ok) {
    throw new Error(
      res.status === 503
        ? STT_UNAVAILABLE_MESSAGE
        : res.status === 429
          ? "Speech recognition limit reached for today"
          : `Speech recognition failed (${res.status})`,
    );
  }
  const data = (await res.json()) as Partial<WhisperResult>;
  return { text: data.text ?? "", segments: data.segments };
};

/** Whisper's words for one phrase, hallucinations and silence-timed words
 *  removed. A result without segments is filtered as one segment of its
 *  text, so the blocklist still applies to it. */
function cleanWords(result: WhisperResult, seg: AudioSegment): FilteredWords {
  const segments =
    result.segments && result.segments.length > 0 ? result.segments : [{ text: result.text }];
  return wordsFromSegmentsWithStats(segments, seg.speechSpans);
}

/** One dev-log line per phrase: enough to tell, from a live session, whether
 *  an empty or short phrase was Whisper hearing nothing or a filter dropping
 *  what it heard. */
function logPhrase(
  result: WhisperResult,
  seg: AudioSegment,
  filtered: FilteredWords,
  words: string[],
): void {
  const durationMs = Math.round((seg.samples.length / PCM_SAMPLE_RATE) * 1000);
  const speechMs = Math.round(seg.speechSpans.reduce((n, s) => n + (s.endMs - s.startMs), 0));
  const cleaned = words.length > 0 ? `"${words.join(" ")}"` : "(all filtered)";
  console.log(
    `[recite-stream] cloudflare-whisper phrase: raw="${result.text}" durationMs=${durationMs} ` +
      `forced=${seg.forced} startsWithOverlap=${seg.startsWithOverlap} speechMs=${speechMs} ` +
      `droppedHallucination=${filtered.droppedHallucination} droppedSilence=${filtered.droppedSilence} ` +
      `droppedSeam=${filtered.words.length - words.length} cleaned=${cleaned}`,
  );
}

/**
 * Turns submitted phrases into final events. Every upload starts the moment
 * its phrase is submitted, so phrases transcribe in parallel, but results are
 * emitted strictly in submit order: a short phrase that returns before the
 * long one recited ahead of it waits for it.
 *
 * Each upload gets `UPLOAD_TIMEOUT_MS` before it counts as failed. The first
 * failure (an upload, a timeout, or `onEvent` throwing) reports once
 * through `onError` and ends the pipeline. `stop()` aborts every upload in
 * flight, and after it nothing more is reported at all.
 */
export function createWhisperPipeline(
  transcribe: Transcribe,
  onEvent: (event: SttStreamEvent) => void,
  onError: (message: string) => void,
): { submit(seg: AudioSegment): void; stop(): void } {
  let stopped = false;
  let failed = false;
  // Cancels one in-flight upload: clears its timeout and aborts its request.
  const inFlight = new Set<() => void>();
  // Each phrase's emit step chains onto the previous one's.
  let queue: Promise<void> = Promise.resolve();
  // Every word Whisper heard in the previous phrase, before stitching: a
  // forced cut's overlap audio is the tail of that phrase's audio, including
  // words the phrase itself dropped at its own seam. Empty when it had none.
  let previousWords: string[] = [];

  const emit = (result: WhisperResult, seg: AudioSegment) => {
    const filtered = cleanWords(result, seg);
    const heard = filtered.words;
    // Only a forced cut repeats audio; a pause-cut phrase that starts with the
    // previous phrase's last word (a real repetition) keeps every word.
    const words = seg.startsWithOverlap
      ? stitchSeam(previousWords.slice(-SEAM_TAIL_WORDS), heard)
      : heard;
    previousWords = heard;
    logPhrase(result, seg, filtered, words);
    if (words.length === 0) return;
    onEvent({
      text: words.join(" "),
      isFinal: true,
      // Whisper has no per-word confidence; a word it kept is a word it heard.
      words: words.map((word) => ({ word, confidence: 1 })),
    });
  };

  const fail = (error: unknown) => {
    if (stopped || failed) return;
    failed = true;
    onError(error instanceof Error ? error.message : String(error));
  };

  /** Starts one upload, rejecting with TIMEOUT_MESSAGE if it runs too long. */
  const upload = (seg: AudioSegment): Promise<WhisperResult> => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Raced rather than left to the signal, so even a request that ignores
    // the abort cannot hold the queue.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(TIMEOUT_MESSAGE));
      }, UPLOAD_TIMEOUT_MS);
    });
    const cancel = () => {
      clearTimeout(timer);
      controller.abort();
    };
    inFlight.add(cancel);
    let request: Promise<WhisperResult>;
    try {
      request = transcribe(encodeWav(seg.samples, PCM_SAMPLE_RATE), controller.signal);
    } catch (err) {
      request = Promise.reject(err);
    }
    return Promise.race([request, timeout]).finally(() => {
      clearTimeout(timer);
      inFlight.delete(cancel);
    });
  };

  return {
    submit(seg) {
      if (stopped || failed) return;
      // Settled up front into what to deliver, so a rejection queued behind
      // a slow phrase is never an unhandled rejection while it waits its turn.
      const deliver = upload(seg).then(
        (result) => () => emit(result, seg),
        (error) => () => fail(error),
      );
      queue = queue.then(async () => {
        const run = await deliver;
        if (stopped || failed) return;
        // A throw here (a malformed result, the event handler itself) would
        // reject the queue and silently drop every later phrase.
        try {
          run();
        } catch (err) {
          fail(err);
        }
      });
    },
    stop() {
      stopped = true;
      inFlight.forEach((cancel) => cancel());
      inFlight.clear();
    },
  };
}

/**
 * Opens the mic and transcribes each phrase the reciter pauses after,
 * forwarding one final event per phrase to `onEvent`. Rejects if the broker
 * is not configured or the mic is unavailable; a failed upload after that
 * surfaces once through `onError` (the caller should stop the session).
 */
export const openWhisperStream: OpenStream = async (onEvent, onError) => {
  // Fail before the mic opens, so a missing broker doesn't leave the
  // recording indicator on while we bail out.
  brokerUrl(TRANSCRIBE_PATH);

  const pipeline = createWhisperPipeline(
    transcribeSegment,
    (event) => {
      // Dev logging — every Whisper event is a final.
      console.log(`[recite-stream] cloudflare-whisper final: "${event.text}"`);
      onEvent(event);
    },
    onError,
  );
  const segmenter = createPauseSegmenter();

  let stopped = false;
  const capture = await startPcmCapture((frame) => {
    if (stopped) return;
    for (const seg of segmenter.push(frame)) pipeline.submit(seg);
  });

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      capture.stop();
      pipeline.stop();
    },
  };
};
