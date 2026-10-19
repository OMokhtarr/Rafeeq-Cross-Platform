/**
 * PAUSE SEGMENTER
 *
 * Whisper transcribes whole clips and invents verse words over silence, so
 * the Whisper engine never sends it a raw stream. This cuts the mic's PCM
 * frames into phrases at the reciter's natural pauses, with the silence
 * trimmed off: a short pre-roll before the first sound, a short tail after
 * the last, and nothing in between that isn't part of the phrase.
 *
 * Each pushed frame is one analysis frame, loud when its RMS reaches the
 * threshold. Idle, it keeps a pre-roll of recent audio; `openFrames` loud
 * frames in a row open a segment. Open, `pauseMs` of silence closes it
 * (pause cut), and reaching `maxChunkMs` closes it anyway (forced cut) so
 * unbroken recitation still produces results; the next segment then starts
 * with the last `forcedOverlapMs` of audio so a word split at the seam is
 * heard whole. A segment with under `minSpeechMs` of loud audio — a cough,
 * a tap — is discarded; a seed's repeated audio never counts toward that.
 *
 * The 5 s cap is set by the app's 10 s silence timeout, which only text
 * resets: a hesitation before the first word, plus upload and inference,
 * must still land the first phrase's words inside it (8 s did not).
 *
 * Pure: no Web Audio, no timers. Time comes from sample counts.
 */

export interface SpeechSpan {
  startMs: number;
  endMs: number;
}

export interface AudioSegment {
  samples: Float32Array;
  /** Runs of loud frames, in ms from the segment's first sample. */
  speechSpans: SpeechSpan[];
  /** Closed by the length cap rather than a pause. */
  forced: boolean;
  /** Begins with audio repeated from the end of the previous (forced) segment. */
  startsWithOverlap: boolean;
}

export interface SegmenterOptions {
  sampleRate: number;
  rmsThreshold: number;
  openFrames: number;
  preRollMs: number;
  pauseMs: number;
  keepTailMs: number;
  maxChunkMs: number;
  forcedOverlapMs: number;
  minSpeechMs: number;
}

export const DEFAULT_SEGMENTER_OPTIONS: SegmenterOptions = {
  sampleRate: 16000,
  rmsThreshold: 0.02,
  openFrames: 2,
  preRollMs: 400,
  pauseMs: 350,
  keepTailMs: 150,
  maxChunkMs: 5000,
  forcedOverlapMs: 1000,
  minSpeechMs: 250,
};

/** A stretch of audio and whether the frame it came from was loud. */
interface Piece {
  samples: Float32Array;
  loud: boolean;
}

interface OpenSegment {
  pieces: Piece[];
  /** Samples held, i.e. the segment's current length. */
  total: number;
  /** End of the last loud piece, in samples from the segment start. Negative
   *  when that loud audio fell before this segment's overlap seed. */
  lastLoudEnd: number;
  startsWithOverlap: boolean;
}

function rms(frame: Float32Array): number {
  if (frame.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function lengthOf(pieces: Piece[]): number {
  return pieces.reduce((n, p) => n + p.samples.length, 0);
}

/** The pieces covering samples [from, to), cut at the edges as needed. */
function slicePieces(pieces: Piece[], from: number, to: number): Piece[] {
  const out: Piece[] = [];
  let offset = 0;
  for (const piece of pieces) {
    const start = Math.max(from - offset, 0);
    const end = Math.min(to - offset, piece.samples.length);
    if (end > start) out.push({ samples: piece.samples.subarray(start, end), loud: piece.loud });
    offset += piece.samples.length;
  }
  return out;
}

function concat(pieces: Piece[]): Float32Array {
  const out = new Float32Array(lengthOf(pieces));
  let offset = 0;
  for (const piece of pieces) {
    out.set(piece.samples, offset);
    offset += piece.samples.length;
  }
  return out;
}

/** Merges adjacent loud pieces into spans, in samples. */
function loudRuns(pieces: Piece[]): Array<[number, number]> {
  const runs: Array<[number, number]> = [];
  let offset = 0;
  for (const piece of pieces) {
    const end = offset + piece.samples.length;
    if (piece.loud) {
      const last = runs[runs.length - 1];
      if (last && last[1] === offset) last[1] = end;
      else runs.push([offset, end]);
    }
    offset = end;
  }
  return runs;
}

export function createPauseSegmenter(opts: Partial<SegmenterOptions> = {}): {
  push(frame: Float32Array): AudioSegment[];
} {
  const o = { ...DEFAULT_SEGMENTER_OPTIONS, ...opts };
  const toSamples = (ms: number) => Math.round((ms / 1000) * o.sampleRate);
  const toMs = (samples: number) => (samples / o.sampleRate) * 1000;
  const preRollSamples = toSamples(o.preRollMs);
  const pauseSamples = toSamples(o.pauseMs);
  const keepTailSamples = toSamples(o.keepTailMs);
  const maxChunkSamples = Math.max(toSamples(o.maxChunkMs), 1);
  // The seed must leave room to grow, or every forced cut would repeat it.
  const overlapSamples = Math.min(toSamples(o.forcedOverlapMs), maxChunkSamples - 1);

  /* Idle: recent audio, newest last, and how many of the newest frames were
   * loud in a row. Holds that loud run plus up to the pre-roll before it. */
  let history: Piece[] = [];
  let loudRun = 0;
  let open: OpenSegment | null = null;

  function trimHistory(): void {
    const keep = lengthOf(history.slice(history.length - loudRun)) + preRollSamples;
    const total = lengthOf(history);
    if (total > keep) history = slicePieces(history, total - keep, total);
  }

  /** Builds the emitted segment from the first `end` samples, or null when
   *  it holds too little loud audio to be speech. */
  function close(seg: OpenSegment, end: number, forced: boolean): AudioSegment | null {
    const pieces = slicePieces(seg.pieces, 0, end);
    const runs = loudRuns(pieces);
    // A seed is the previous segment's audio, already uploaded once: speech
    // that only exists there must not make a repeat-only request.
    const fresh = seg.startsWithOverlap ? overlapSamples : 0;
    const speech = runs.reduce((n, [s, e]) => n + Math.max(e - Math.max(s, fresh), 0), 0);
    if (toMs(speech) < o.minSpeechMs) return null;
    return {
      samples: concat(pieces),
      speechSpans: runs.map(([s, e]) => ({ startMs: toMs(s), endMs: toMs(e) })),
      forced,
      startsWithOverlap: seg.startsWithOverlap,
    };
  }

  /** Appends one piece to the open segment and makes any cut it triggers. */
  function appendToOpen(seg: OpenSegment, piece: Piece, out: AudioSegment[]): void {
    seg.pieces.push(piece);
    seg.total += piece.samples.length;
    if (piece.loud) seg.lastLoudEnd = seg.total;

    if (seg.total - seg.lastLoudEnd >= pauseSamples) {
      // Pause cut: keep a short tail, hand the rest of the silence to idle
      // so a following phrase's pre-roll never repeats this one's audio.
      const end = Math.min(Math.max(seg.lastLoudEnd + keepTailSamples, 0), seg.total);
      const segment = close(seg, end, false);
      if (segment) out.push(segment);
      history = slicePieces(seg.pieces, end, seg.total);
      loudRun = 0;
      trimHistory();
      open = null;
      return;
    }

    if (seg.total >= maxChunkSamples) {
      const segment = close(seg, seg.total, true);
      if (segment) out.push(segment);
      const seedFrom = seg.total - overlapSamples;
      open = {
        pieces: slicePieces(seg.pieces, seedFrom, seg.total),
        total: overlapSamples,
        lastLoudEnd: seg.lastLoudEnd - seedFrom,
        startsWithOverlap: true,
      };
    }
  }

  return {
    push(frame: Float32Array): AudioSegment[] {
      const out: AudioSegment[] = [];
      const loud = rms(frame) >= o.rmsThreshold;

      if (!open) {
        history.push({ samples: frame, loud });
        loudRun = loud ? loudRun + 1 : 0;
        trimHistory();
        if (loudRun >= o.openFrames) {
          const total = lengthOf(history);
          open = { pieces: history, total, lastLoudEnd: total, startsWithOverlap: false };
          history = [];
          loudRun = 0;
        }
        return out;
      }

      // Split the frame wherever the length cap falls, so a forced segment
      // is exactly `maxChunkMs` and the remainder starts the next one.
      let rest = frame;
      while (rest.length > 0) {
        if (!open) {
          // A pause cut landed mid-frame: the remainder is idle audio.
          history.push({ samples: rest, loud });
          trimHistory();
          break;
        }
        const room = Math.max(maxChunkSamples - open.total, 0);
        appendToOpen(open, { samples: rest.subarray(0, room), loud }, out);
        rest = rest.subarray(room);
      }
      return out;
    },
  };
}
