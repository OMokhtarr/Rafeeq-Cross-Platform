import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { useReciteMode } from "../useReciteMode";
import { SILENCE_TIMEOUT_MS } from "../recite/shared/reciteCore";

jest.mock("../recite/deepgram/deepgramDriver", () => ({
  useDeepgramDriver: () => ({ start: () => {}, stop: () => {} }),
}));
jest.mock("../../services/data/quran.service", () => ({ getPage: () => new Promise(() => {}) }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Recite = ReturnType<typeof useReciteMode>;
let recite: Recite;
const Harness = () => {
  recite = useReciteMode(() => {}, () => {});
  return null;
};

let root: Root;
beforeEach(() => {
  jest.useFakeTimers();
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
  act(() => recite.arm(1, []));
});
afterEach(() => {
  act(() => root.unmount());
  jest.useRealTimers();
});

it("keeps recording through silence while held, e.g. while an onboarding card is read", () => {
  act(() => recite.holdSilence(true));
  act(() => recite.startRecording());
  act(() => jest.advanceTimersByTime(SILENCE_TIMEOUT_MS * 2));
  expect(recite.status).toBe("recording");
});

it("restarts the silence countdown when the hold is released", () => {
  act(() => recite.holdSilence(true));
  act(() => recite.startRecording());
  act(() => jest.advanceTimersByTime(SILENCE_TIMEOUT_MS * 2));
  act(() => recite.holdSilence(false));
  act(() => jest.advanceTimersByTime(SILENCE_TIMEOUT_MS - 2000));
  expect(recite.status).toBe("recording");
  act(() => jest.advanceTimersByTime(3000));
  expect(recite.status).toBe("armed");
});

it("still auto-stops on silence when nothing holds it", () => {
  act(() => recite.startRecording());
  act(() => jest.advanceTimersByTime(SILENCE_TIMEOUT_MS + 1000));
  expect(recite.status).toBe("armed");
});
