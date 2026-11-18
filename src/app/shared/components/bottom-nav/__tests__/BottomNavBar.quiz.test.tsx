import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route } from "react-router-dom";
import BottomNavBar, { NavTabKey } from "../BottomNavBar";
import {
  clearQuizSession,
  resetQuizSessionCacheForTests,
  saveQuizSession,
} from "../../../../features/quiz/quiz-session";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let path = "";
let host: HTMLDivElement;
let root: Root;

function mount(at: string, active?: NavTabKey) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <MemoryRouter initialEntries={[at]}>
        <BottomNavBar active={active} />
        <Route
          path="*"
          render={({ location }) => {
            path = location.pathname;
            return null;
          }}
        />
      </MemoryRouter>,
    ),
  );
}

const quizTab = () => host.querySelectorAll<HTMLButtonElement>(".rfq-tab")[2];

beforeEach(() => {
  localStorage.clear();
  resetQuizSessionCacheForTests();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

test("with no quiz in progress the Quiz tab opens the quiz list, without a dot", () => {
  mount("/azkar", "azkar");

  expect(quizTab().querySelector(".rfq-tab-dot")).toBeNull();
  act(() => quizTab().click());
  expect(path).toBe("/quiz-list");
});

test("with a quiz in progress the Quiz tab returns to it and shows a dot", () => {
  saveQuizSession("mutashabihat", [{ id: "1:1" }], { idx: 0 });
  mount("/azkar", "azkar");

  expect(quizTab().querySelector(".rfq-tab-dot")).not.toBeNull();
  act(() => quizTab().click());
  expect(path).toBe("/mutashabihat-test");
});

test("ending the quiz removes the dot and the tab goes back to the list", () => {
  saveQuizSession("akmel-alayah", [{ id: "1:1" }], { idx: 0 });
  mount("/", "home");

  act(() => clearQuizSession());

  expect(quizTab().querySelector(".rfq-tab-dot")).toBeNull();
  act(() => quizTab().click());
  expect(path).toBe("/quiz-list");
});
