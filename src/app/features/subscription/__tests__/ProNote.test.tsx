import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route } from "react-router-dom";
import ProNote from "../ProNote";
import { useSubscription } from "../../../core/context/SubscriptionContext";
import { closeTopOverlay } from "../../../core/utils/overlay-registry";

jest.mock("../../../core/context/SubscriptionContext", () => ({ useSubscription: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const closeNote = jest.fn();
let path = "";
let historyRef: { push: (p: string) => void } | null = null;
let host: HTMLDivElement;
let root: Root;

function mount(noteOpen: boolean) {
  (useSubscription as jest.Mock).mockReturnValue({ noteOpen, closeNote });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={["/viewer"]}>
        <ProNote />
        <Route
          path="*"
          render={({ location, history }) => {
            path = location.pathname;
            historyRef = history;
            return null;
          }}
        />
      </MemoryRouter>,
    ),
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("renders nothing when closed", () => {
  mount(false);
  expect(host.textContent).toBe("");
});

it("shows the Arabic note when open", () => {
  mount(true);
  expect(host.textContent).toContain("التسميع متاح للمشتركين");
  expect(host.textContent).toContain("عرض الاشتراك");
});

it("navigates to /subscribe and closes", () => {
  mount(true);
  const cta = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("عرض الاشتراك"),
  );
  act(() => cta!.click());
  expect(path).toBe("/subscribe");
  // The mocked note stays "open", so the leave-the-page close fires as well;
  // in the app the first close already hides it.
  expect(closeNote).toHaveBeenCalled();
});

it("registers with the overlay registry so Android Back closes it", () => {
  mount(true);
  expect(closeTopOverlay()).toBe(true);
  expect(closeNote).toHaveBeenCalledTimes(1);
});

it("does not register while closed", () => {
  mount(false);
  expect(closeTopOverlay()).toBe(false);
});

it("closes when the page changes underneath it", () => {
  mount(true);
  act(() => historyRef!.push("/quiz-list"));
  expect(closeNote).toHaveBeenCalledTimes(1);
});

it("closes when the backdrop is tapped", () => {
  mount(true);
  const backdrop = host.querySelector(".pro-note-backdrop") as HTMLElement;
  act(() => backdrop.click());
  expect(closeNote).toHaveBeenCalledTimes(1);
  expect(path).toBe("/viewer");
});
