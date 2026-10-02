import React, { useEffect } from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { TourProvider, useActiveTour, useTours } from "../TourProvider";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let active: string | null = "unset";
const Page = () => {
  const { requestTours } = useTours();
  active = useActiveTour();
  useEffect(() => requestTours([{ tourId: "search", overOverlay: false }]), [requestTours]);
  return null;
};

let root: Root;
beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = "";
  const el = document.createElement("input");
  el.setAttribute("data-tour", "search.input");
  el.getBoundingClientRect = () =>
    ({ top: 100, left: 0, width: 200, height: 40, right: 200, bottom: 140, x: 0, y: 100, toJSON() {} }) as DOMRect;
  document.body.appendChild(el);
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  jest.useRealTimers();
});

it("reports the tour on screen, so a page can pause what would interrupt it", () => {
  act(() =>
    root.render(
      <MemoryRouter>
        <TourProvider initial={{ welcomeDone: true, seenTours: [], seenReleases: [] }}>
          <Page />
        </TourProvider>
      </MemoryRouter>,
    ),
  );
  expect(active).toBe("search");
  act(() => (document.querySelector(".ob-card .ob-btn--link") as HTMLButtonElement).click());
  expect(active).toBeNull();
});
