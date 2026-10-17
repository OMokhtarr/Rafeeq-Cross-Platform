/**
 * SONIOX TOKEN ASSEMBLER
 *
 * Soniox streams sub-word tokens rather than transcripts: each message
 * carries the newly settled (`is_final`) tokens plus the current guess for
 * the rest (non-final tokens, re-sent and revised every message). An
 * `<end>` token marks an endpoint (the speaker paused) and `<fin>` marks a
 * finalize request completing. This turns that stream into the app's
 * window contract: cumulative interims of the current utterance, settled by
 * one final at each marker.
 */

import type { SttStreamEvent, SttWord } from "./types";

export interface SonioxToken {
  text: string;
  is_final?: boolean;
  confidence?: number;
}

const MARKERS = new Set(["<end>", "<fin>"]);

/** Joins tokens into words, splitting on whitespace. A word's confidence is
 *  the lowest of the tokens it was built from — one doubtful piece makes the
 *  whole word doubtful. A missing confidence counts as 1. */
export function tokensToWords(tokens: SonioxToken[]): SttWord[] {
  const words: SttWord[] = [];
  let word = "";
  let confidence = 1;
  const flush = () => {
    if (word) words.push({ word, confidence });
    word = "";
    confidence = 1;
  };
  for (const token of tokens) {
    const tokenConfidence = token.confidence ?? 1;
    for (const ch of token.text) {
      if (/\s/.test(ch)) {
        flush();
      } else {
        word += ch;
        confidence = Math.min(confidence, tokenConfidence);
      }
    }
  }
  flush();
  return words;
}

function toEvent(tokens: SonioxToken[], isFinal: boolean): SttStreamEvent {
  return {
    text: tokens.map((t) => t.text).join("").trim(),
    isFinal,
    words: tokensToWords(tokens),
  };
}

export function createSonioxAssembler(): { push(tokens: SonioxToken[]): SttStreamEvent[] } {
  // Final tokens of the utterance still in progress.
  let finals: SonioxToken[] = [];
  // Whether an interim with text went out since the last final — if so, the
  // window needs a final to settle it even when it ended up empty.
  let interimShown = false;

  return {
    push(tokens) {
      const events: SttStreamEvent[] = [];
      const nonFinals: SonioxToken[] = [];
      let sawMarker = false;

      for (const token of tokens) {
        if (MARKERS.has(token.text)) {
          sawMarker = true;
          const event = toEvent(finals, true);
          if (event.text || interimShown) events.push(event);
          finals = [];
          interimShown = false;
        } else if (token.is_final) {
          finals.push(token);
        } else {
          nonFinals.push(token);
        }
      }

      const interim = toEvent([...finals, ...nonFinals], false);
      // Without a marker the window just moved on, so report it — unless it
      // is empty and nothing is on screen to retract (a no-op event). After
      // a marker, only report a next window that already has words.
      if (interim.text || (!sawMarker && interimShown)) {
        events.push(interim);
        interimShown = interim.text !== "";
      }
      return events;
    },
  };
}
