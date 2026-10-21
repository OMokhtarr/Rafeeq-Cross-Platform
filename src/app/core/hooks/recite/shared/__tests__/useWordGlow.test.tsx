import { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { GLOW_TOTAL_MS, useWordGlow, type WordGlow } from "../useWordGlow";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let hook: WordGlow;
const Harness = () => {
  hook = useWordGlow();
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

it("lights a key for GLOW_TOTAL_MS, then removes it", () => {
  act(() => hook.light(["1:1:1"]));
  expect(hook.glow.get("1:1:1")).toBe(1);

  act(() => jest.advanceTimersByTime(GLOW_TOTAL_MS - 1));
  expect(hook.glow.has("1:1:1")).toBe(true);
  act(() => jest.advanceTimersByTime(1));
  expect(hook.glow.has("1:1:1")).toBe(false);
});

it("lighting a key again takes a new generation and a fresh full duration", () => {
  act(() => hook.light(["1:1:1"]));
  act(() => jest.advanceTimersByTime(1000));
  act(() => hook.light(["1:1:1"]));
  expect(hook.glow.get("1:1:1")).toBe(2);

  act(() => jest.advanceTimersByTime(GLOW_TOTAL_MS - 1));
  expect(hook.glow.get("1:1:1")).toBe(2);
  act(() => jest.advanceTimersByTime(1));
  expect(hook.glow.has("1:1:1")).toBe(false);
});

it("clear empties the map at once and cancels pending removals", () => {
  act(() => hook.light(["1:1:1", "1:1:2"]));
  act(() => hook.clear());
  expect(hook.glow.size).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

it("keeps light and clear stable across renders", () => {
  const { light, clear } = hook;
  act(() => hook.light(["1:1:1"]));
  expect(hook.light).toBe(light);
  expect(hook.clear).toBe(clear);
});

it("cancels pending timers on unmount", () => {
  act(() => hook.light(["1:1:1"]));
  act(() => root.unmount());
  expect(jest.getTimerCount()).toBe(0);
  root = createRoot(document.createElement("div"));
});
