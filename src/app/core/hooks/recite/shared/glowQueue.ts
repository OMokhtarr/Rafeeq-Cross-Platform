import type { Verse } from "../../../../shared/models/verse.model";
import { glowKey, type ExpectedWord } from "../../../services/quran/recite-aligner.service";
import { cmpPos, type RecitePosition } from "./reciteCore";

/**
 * Turns the aligner's accepted words into one glow per recited word.
 *
 * Every interim of a phrase re-accepts the words before it, so a word is
 * queued only the first time its phrase accepts it; a final ends the phrase,
 * unqueueing the words its interims accepted that the final does not (a
 * revised word may turn red), and saying the word again later queues it
 * again. A queued word waits until
 * the reveal shows it — the newest word is held back — and is dropped if its
 * verse is not on the page (accepted on the next page before the turn).
 */
export interface GlowQueue {
  /** Queues and returns the words not yet queued in the current phrase. */
  phraseAccepted: (words: ExpectedWord[], isFinal: boolean) => ExpectedWord[];
  /** Removes and returns the queued words `display` has revealed. */
  due: (display: RecitePosition | null, pageVerses: Verse[]) => ExpectedWord[];
  reset: () => void;
}

export function createGlowQueue(): GlowQueue {
  let phrase = new Set<string>();
  /** Keys this phrase put in the queue — the final drops those it no longer
   *  accepts (an interim's word it revised to wrong). */
  let phraseQueued = new Set<string>();
  let queued = new Map<string, ExpectedWord>();

  const phraseAccepted = (words: ExpectedWord[], isFinal: boolean) => {
    const fresh = words.filter((w) => !phrase.has(glowKey(w)));
    fresh.forEach((w) => {
      const key = glowKey(w);
      phrase.add(key);
      if (!queued.has(key)) phraseQueued.add(key);
      queued.set(key, w);
    });
    if (isFinal) {
      const accepted = new Set(words.map(glowKey));
      phraseQueued.forEach((key) => {
        if (!accepted.has(key)) queued.delete(key);
      });
      phrase = new Set();
      phraseQueued = new Set();
    }
    return fresh;
  };

  const due = (display: RecitePosition | null, pageVerses: Verse[]) => {
    const onPage = new Set(pageVerses.map((v) => `${v.sura}:${v.aya}`));
    const out: ExpectedWord[] = [];
    queued.forEach((w, key) => {
      if (!onPage.has(`${w.sura}:${w.aya}`)) queued.delete(key);
      else if (display && cmpPos(w, display) < 0) {
        queued.delete(key);
        out.push(w);
      }
    });
    return out;
  };

  const reset = () => {
    phrase = new Set();
    phraseQueued = new Set();
    queued = new Map();
  };

  return { phraseAccepted, due, reset };
}
