import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { SpotlightOverlay } from "../SpotlightOverlay";
import { hasOpenOverlay } from "../../../core/utils/overlay-registry";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const props = {
  tourId: "search" as const,
  step: { key: "recents" },
  index: 1,
  total: 2,
  canGoBack: false,
  isLast: true,
  onShown: noop,
  onMissing: noop,
  onNext: noop,
  onPrev: noop,
  onSkip: noop,
};

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  jest.useRealTimers();
});

function addTarget() {
  const el = document.createElement("ul");
  el.setAttribute("data-tour", "search.recents");
  el.getBoundingClientRect = () =>
    ({ top: 100, left: 0, width: 200, height: 40, right: 200, bottom: 140, x: 0, y: 100, toJSON() {} }) as DOMRect;
  document.body.appendChild(el);
}

it("does not claim the back button while its target is still being looked for", () => {
  act(() => root.render(<SpotlightOverlay {...props} />));
  // Nothing is drawn yet, so Back must reach the page instead of skipping an invisible tour.
  expect(hasOpenOverlay()).toBe(false);
});

it("claims the back button once the target is ringed, and releases it on unmount", () => {
  addTarget();
  act(() => root.render(<SpotlightOverlay {...props} />));
  expect(hasOpenOverlay()).toBe(true);
  act(() => root.unmount());
  expect(hasOpenOverlay()).toBe(false);
  root = createRoot(host);
});
