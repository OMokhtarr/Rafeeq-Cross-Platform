import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import type { Verse, VerseWord } from "../../../../../shared/models/verse.model";
import { useRevealAnimator, type RevealAnimator } from "../useRevealAnimator";
import type { RecitePosition } from "../reciteCore";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Recitable words carry charType "end"; the ayah-end marker carries "word".
function verse(sura: number, aya: number, wordCount: number): Verse {
  const words: VerseWord[] = Array.from({ length: wordCount }, (_, i) => ({
    position: i + 1,
    charType: "end",
    text_uthmani: "x",
    codeV2: "",
    lineNumber: 0,
    pageNumber: 0,
  }));
  words.push({ position: wordCount + 1, charType: "word", text_uthmani: "", codeV2: "", lineNumber: 0, pageNumber: 0 });
  return { sura, aya, text: "", page: 0, suraNameAr: "", words };
}
const at = (sura: number, aya: number, wordIndex = 0): RecitePosition => ({ sura, aya, wordIndex });

const verses = [verse(1, 1, 4)];
const applyPosition = jest.fn();
let animator: RevealAnimator;
const Harness = () => {
  animator = useRevealAnimator({
    isActive: () => true,
    getCombinedVerses: () => verses,
    getPageVerses: () => verses,
    applyPosition,
  });
  return null;
};

let root: Root;
beforeEach(() => {
  jest.useFakeTimers();
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
});
afterEach(() => {
  act(() => root.unmount());
  jest.useRealTimers();
});

const lastWordIndex = () => applyPosition.mock.calls[applyPosition.mock.calls.length - 1][1].wordIndex;

it("reveals the held-back last word when the phrase is confirmed", () => {
  act(() => animator.landOnPage(verses, at(1, 1, 0), at(1, 1, 0)));
  act(() => animator.advanceTo(at(1, 1, 4), 1));
  act(() => jest.advanceTimersByTime(2000));
  expect(lastWordIndex()).toBe(3);

  act(() => animator.confirm(at(1, 1, 4)));
  act(() => jest.advanceTimersByTime(2000));
  expect(lastWordIndex()).toBe(4);
});
