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

it("shows the first newly matched word at once, without waiting a step", () => {
  act(() => animator.landOnPage(verses, at(1, 1, 0), at(1, 1, 0), false));
  act(() => animator.advanceTo(at(1, 1, 2), 1));
  expect(lastWordIndex()).toBe(1);
});

it("holds the newest word back while it is fresh, then shows it", () => {
  act(() => animator.landOnPage(verses, at(1, 1, 0), at(1, 1, 0), false));
  act(() => animator.advanceTo(at(1, 1, 1), 1));
  act(() => jest.advanceTimersByTime(200));
  expect(lastWordIndex()).toBe(0);

  act(() => jest.advanceTimersByTime(200));
  expect(lastWordIndex()).toBe(1);
});

it("restarts the hold when the matcher moves to a newer word", () => {
  act(() => animator.landOnPage(verses, at(1, 1, 0), at(1, 1, 0), false));
  act(() => animator.advanceTo(at(1, 1, 1), 1));
  act(() => jest.advanceTimersByTime(200));
  act(() => animator.advanceTo(at(1, 1, 2), 1));
  act(() => jest.advanceTimersByTime(200));
  expect(lastWordIndex()).toBe(1);

  act(() => jest.advanceTimersByTime(300));
  expect(lastWordIndex()).toBe(2);
});

it("reveals the held-back word as soon as the phrase is confirmed", () => {
  act(() => animator.landOnPage(verses, at(1, 1, 0), at(1, 1, 0), false));
  act(() => animator.advanceTo(at(1, 1, 1), 1));
  expect(lastWordIndex()).toBe(0);

  act(() => animator.confirm(at(1, 1, 1)));
  expect(lastWordIndex()).toBe(1);
});

it("keeps confirmed words revealed when the cursor restarts behind them", () => {
  act(() => animator.landOnPage(verses, at(1, 1, 0), at(1, 1, 4), false));
  act(() => animator.confirm(at(1, 1, 4)));
  applyPosition.mockClear();

  act(() => animator.advanceTo(at(1, 1, 1), 1));
  act(() => jest.advanceTimersByTime(2000));

  const below = applyPosition.mock.calls.filter((c) => c[1].wordIndex < 4);
  expect(below).toHaveLength(0);
  expect(animator.getConfirmedPosition()).toEqual(at(1, 1, 4));
});

it("still retracts unconfirmed words a revised interim dropped", () => {
  act(() => animator.landOnPage(verses, at(1, 1, 0), at(1, 1, 0), false));
  act(() => animator.confirm(at(1, 1, 1)));
  act(() => animator.advanceTo(at(1, 1, 4), 0));
  act(() => jest.advanceTimersByTime(2000));

  act(() => animator.advanceTo(at(1, 1, 2), 0));
  expect(lastWordIndex()).toBe(2);
});

it("a same-page landing behind the display keeps the page revealed", () => {
  act(() => animator.landOnPage(verses, at(1, 1, 0), at(1, 1, 4), false));
  act(() => animator.confirm(at(1, 1, 4)));

  act(() => animator.landOnPage(verses, at(1, 1, 0), at(1, 1, 1), true));
  expect(lastWordIndex()).toBe(4);
});
