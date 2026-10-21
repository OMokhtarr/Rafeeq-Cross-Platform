import type { Verse } from "../../../../../shared/models/verse.model";
import type { ExpectedWord } from "../../../../services/quran/recite-aligner.service";
import { createGlowQueue } from "../glowQueue";

const word = (sura: number, aya: number, wordIndex: number): ExpectedWord => ({
  sura,
  aya,
  wordIndex,
  position: wordIndex + 1,
  text: "",
  skeleton: [],
  lenient: false,
});
const verse = (sura: number, aya: number): Verse => ({ sura, aya, text: "", page: 1, suraNameAr: "" });
const at = (sura: number, aya: number, wordIndex: number) => ({ sura, aya, wordIndex });

const page = [verse(2, 1), verse(2, 2)];

it("returns a word only for the first interim of a phrase that accepts it", () => {
  const q = createGlowQueue();
  expect(q.phraseAccepted([word(2, 2, 0)], false)).toEqual([word(2, 2, 0)]);
  expect(q.phraseAccepted([word(2, 2, 0)], false)).toEqual([]);
  expect(q.phraseAccepted([word(2, 2, 0), word(2, 2, 1)], false)).toEqual([word(2, 2, 1)]);
});

it("queues the same word again after a final (a re-recitation)", () => {
  const q = createGlowQueue();
  q.phraseAccepted([word(2, 2, 0)], false);
  expect(q.phraseAccepted([word(2, 2, 0)], true)).toEqual([]);
  expect(q.phraseAccepted([word(2, 2, 0)], false)).toEqual([word(2, 2, 0)]);
});

it("holds a queued word until the display reveals it, then returns it once", () => {
  const q = createGlowQueue();
  q.phraseAccepted([word(2, 2, 3)], false);
  expect(q.due(at(2, 2, 3), page)).toEqual([]);
  expect(q.due(at(2, 2, 4), page)).toEqual([word(2, 2, 3)]);
  expect(q.due(at(2, 2, 5), page)).toEqual([]);
});

it("returns words of earlier verses, and of the whole page past its end", () => {
  const q = createGlowQueue();
  q.phraseAccepted([word(2, 1, 6), word(2, 2, 0)], false);
  expect(q.due(at(2, 2, 0), page)).toEqual([word(2, 1, 6)]);
  expect(q.due(at(2, 3, 1), page)).toEqual([word(2, 2, 0)]);
});

it("drops a word whose verse is not on the page, so it is never due", () => {
  const q = createGlowQueue();
  q.phraseAccepted([word(2, 3, 0)], false);
  expect(q.due(at(2, 2, 0), page)).toEqual([]);
  expect(q.due(at(2, 4, 1), [...page, verse(2, 3)])).toEqual([]);
});

it("forgets queued words and the phrase on reset", () => {
  const q = createGlowQueue();
  q.phraseAccepted([word(2, 2, 0)], false);
  q.reset();
  expect(q.due(at(2, 2, 5), page)).toEqual([]);
  expect(q.phraseAccepted([word(2, 2, 0)], false)).toEqual([word(2, 2, 0)]);
});
