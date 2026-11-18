import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { useHoldPress, HOLD_PRESS_MS } from "../useHoldPress";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no PointerEvent constructor; React only reads the type and fields.
const pointer = (
  el: Element,
  type: string,
  { x = 0, y = 0, id = 1 }: { x?: number; y?: number; id?: number } = {},
) => {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(e, "pointerId", { value: id });
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
};

let root: Root;
let container: HTMLDivElement;
let onTap: jest.Mock;
let onHold: jest.Mock;

const Probe: React.FC = () => {
  const { holding, bind } = useHoldPress({ onTap, onHold });
  return <button data-holding={holding} {...bind} />;
};

const button = () => container.querySelector("button")!;

beforeEach(() => {
  jest.useFakeTimers();
  onTap = jest.fn();
  onHold = jest.fn();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

it("a quick press-and-release is a tap", () => {
  pointer(button(), "pointerdown");
  pointer(button(), "pointerup");
  expect(onTap).toHaveBeenCalledTimes(1);
  expect(onHold).not.toHaveBeenCalled();
});

it("holding past the threshold fires the hold once and the release is not a tap", () => {
  pointer(button(), "pointerdown");
  expect(button().dataset.holding).toBe("true");
  act(() => {
    jest.advanceTimersByTime(HOLD_PRESS_MS);
  });
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(button().dataset.holding).toBe("false");
  pointer(button(), "pointerup");
  expect(onTap).not.toHaveBeenCalled();
});

// The reported bug: Android cancels the pointer (its own long-press, or a
// small finger drift) and the old handler read the trailing pointerleave as
// a release, opening playback settings instead of switching to recite.
it("a cancelled or left pointer neither taps nor holds", () => {
  pointer(button(), "pointerdown");
  pointer(button(), "pointercancel");
  pointer(button(), "pointerleave");
  act(() => {
    jest.advanceTimersByTime(HOLD_PRESS_MS * 2);
  });
  expect(onTap).not.toHaveBeenCalled();
  expect(onHold).not.toHaveBeenCalled();
});

it("small finger jitter still completes the hold; a real drag abandons the press", () => {
  pointer(button(), "pointerdown", { x: 10, y: 10 });
  pointer(button(), "pointermove", { x: 16, y: 14 });
  act(() => {
    jest.advanceTimersByTime(HOLD_PRESS_MS);
  });
  expect(onHold).toHaveBeenCalledTimes(1);

  pointer(button(), "pointerdown", { x: 10, y: 10 });
  pointer(button(), "pointermove", { x: 40, y: 10 });
  pointer(button(), "pointerup", { x: 40, y: 10 });
  act(() => {
    jest.advanceTimersByTime(HOLD_PRESS_MS);
  });
  expect(onHold).toHaveBeenCalledTimes(1);
  expect(onTap).not.toHaveBeenCalled();
});

it("suppresses the native long-press context menu", () => {
  const e = pointer(button(), "contextmenu");
  expect(e.defaultPrevented).toBe(true);
});
