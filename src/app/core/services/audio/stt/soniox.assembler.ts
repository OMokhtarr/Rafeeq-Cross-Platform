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
  // The text of the last interim sent since the last final, "" for none. A
  // shown interim needs a final to settle it even when it ended up empty.
  let shownInterim = "";

  return {
    push(tokens) {
      const events: SttStreamEvent[] = [];
      const nonFinals: SonioxToken[] = [];
      let sawMarker = false;

      for (const token of tokens) {
        if (MARKERS.has(token.text)) {
          sawMarker = true;
          const event = toEvent(finals, true);
          if (event.text || shownInterim) events.push(event);
          finals = [];
          shownInterim = "";
        } else if (token.is_final) {
          finals.push(token);
        } else {
          nonFinals.push(token);
        }
      }

      const interim = toEvent([...finals, ...nonFinals], false);
      // Report the window only when its text changed: a message with no new
      // tokens re-sends the same guess, and an empty window with nothing on
      // screen has nothing to retract. A marker clears what is shown, so
      // after one only a next window that already has words is reported.
      if (interim.text !== shownInterim) {
        events.push(interim);
        shownInterim = interim.text;
      }
      return events;
    },
  };
}
