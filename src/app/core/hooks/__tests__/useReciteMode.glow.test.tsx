import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import type { Verse } from "../../../shared/models/verse.model";
import type { ExpectedWord } from "../../services/quran/recite-aligner.service";
import type { ReciteDriverDeps } from "../recite/shared/reciteCore";
import { useReciteMode } from "../useReciteMode";

let mockDeps: ReciteDriverDeps;
jest.mock("../recite/deepgram/deepgramDriver", () => ({
  useDeepgramDriver: (deps: ReciteDriverDeps) => {
    mockDeps = deps;
    return { start: () => {}, stop: () => {}, moveCursor: () => {} };
  },
}));
// Page 2 (verse 1:2) is the next page, prefetched on arm.
jest.mock("../../services/data/quran.service", () => ({
  getPage: (page: number) =>
    page === 2 ? Promise.resolve([{ sura: 1, aya: 2, text: "", page: 2, suraNameAr: "" }]) : new Promise(() => {}),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const word = (wordIndex: number, aya = 1): ExpectedWord => ({
  sura: 1,
  aya,
  wordIndex,
  position: wordIndex + 1,
  text: "",
  skeleton: [],
  lenient: false,
});
const at = (wordIndex: number, aya = 1) => ({ sura: 1, aya, wordIndex });
const page: Verse[] = [{ sura: 1, aya: 1, text: "", page: 1, suraNameAr: "" }];
const nextPage: Verse[] = [{ sura: 1, aya: 2, text: "", page: 2, suraNameAr: "" }];

let recite: ReturnType<typeof useReciteMode>;
const Harness = () => {
  recite = useReciteMode(() => {}, () => {});
  return null;
};

let root: Root;
beforeEach(() => {
  jest.useFakeTimers();
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
  act(() => recite.arm(1, page));
  act(() => recite.startRecording());
});
afterEach(() => {
  act(() => root.unmount());
  jest.useRealTimers();
});

it("lights a held-back word only when the reveal shows it", () => {
  act(() => mockDeps.glowWords([word(0)], false));
  expect(recite.reciteGlow.size).toBe(0);
  act(() => mockDeps.applyPosition(page, at(1)));
  expect([...recite.reciteGlow.keys()]).toEqual(["1:1:1"]);
});

it("lights a re-said word behind the display at once", () => {
  act(() => mockDeps.reveal.landOnPage(page, at(0), at(3), false));
  act(() => mockDeps.glowWords([word(0)], true));
  expect([...recite.reciteGlow.keys()]).toEqual(["1:1:1"]);
});

it("lights next-page words said before the turn once the turned page shows them", async () => {
  await act(async () => {}); // the next page's prefetch lands
  act(() => mockDeps.reveal.reconcile(at(2, 2), null));
  act(() => mockDeps.glowWords([word(0, 2), word(1, 2)], true));
  expect(recite.reciteGlow.size).toBe(0);
  act(() => recite.syncPage(2, nextPage));
  expect([...recite.reciteGlow.keys()]).toEqual(["1:2:1", "1:2:2"]);
});

it("clears the glow when recording stops", () => {
  act(() => mockDeps.reveal.landOnPage(page, at(0), at(3), false));
  act(() => mockDeps.glowWords([word(0)], true));
  act(() => recite.stopRecording());
  expect(recite.reciteGlow.size).toBe(0);
});
