/**
 * SHARED STT TYPES
 *
 * The event contract every speech engine adapter emits, so the recite
 * drivers never care which engine is behind `openSttStream`.
 */

export interface SttWord {
  word: string;
  /** The engine's 0–1 confidence for this word. */
  confidence: number;
}

export interface SttStreamEvent {
  /** Transcript of the current utterance window. Interims are cumulative
   *  revisions of this window (each one replaces the last); a final settles
   *  the window and the next event starts a fresh one. */
  text: string;
  isFinal: boolean;
  /** The same words with per-word confidences, when the engine sent them —
   *  recite mode's mistake detection forgives a word the engine was unsure of. */
  words?: SttWord[];
}

export interface SttStreamHandle {
  /** Closes the socket and releases the mic. Safe to call more than once. */
  stop: () => void;
}

/** Opens the mic and a transcription session. Rejects if the mic or the
 *  engine is unavailable; problems after that surface through `onError`. */
export type OpenStream = (
  onEvent: (event: SttStreamEvent) => void,
  onError: (message: string) => void,
) => Promise<SttStreamHandle>;
