import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import StreakCalendar from "../StreakCalendar";
import { recordStreakDay } from "../../hifz/hifz.service";
import { localDateStr } from "../../../core/utils/local-date.util";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

function mount(lang = "ar") {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<StreakCalendar sessions={[]} lang={lang} />));
}

const back = () => host.querySelectorAll<HTMLButtonElement>(".ac-cal-nav")[0];
const forward = () => host.querySelectorAll<HTMLButtonElement>(".ac-cal-nav")[1];
const title = () => host.querySelector(".ac-cal-title")!.textContent;
const monthTitle = (offset: number, lang = "ar") => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1).toLocaleDateString(
    lang === "ar" ? "ar-u-nu-latn" : "en",
    { month: "long", year: "numeric" },
  );
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("opens on the current month with nowhere to go before any streak", () => {
  mount();
  expect(title()).toBe(monthTitle(0));
  expect(back().disabled).toBe(true);
  expect(forward().disabled).toBe(true);
});

it("goes back as far as the first streak month, and forward to today's", () => {
  const now = new Date();
  recordStreakDay(localDateStr(new Date(now.getFullYear(), now.getMonth() - 2, 15)));
  mount();
  expect(back().disabled).toBe(false);

  act(() => back().click());
  act(() => back().click());
  expect(title()).toBe(monthTitle(-2));
  expect(back().disabled).toBe(true);
  expect(forward().disabled).toBe(false);

  act(() => forward().click());
  act(() => forward().click());
  expect(title()).toBe(monthTitle(0));
  expect(forward().disabled).toBe(true);
});

it("marks kept days and counts them for the month", () => {
  const now = new Date();
  recordStreakDay(localDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 3)));
  recordStreakDay(localDateStr(new Date(now.getFullYear(), now.getMonth() - 1, 4)));
  mount("en");
  act(() => back().click());
  const kept = Array.from(host.querySelectorAll(".ac-cal-day.ac-week-day--on")).map((d) => d.textContent);
  expect(kept).toEqual(["3", "4"]);
  expect(host.querySelector(".ac-cal-sum")!.textContent).toBe("Streak days this month: 2");
});

it("starts the week on Saturday in Arabic and Sunday in English", () => {
  const firstWeekday = () => host.querySelector(".ac-cal-wd")!.textContent;
  const narrow = (date: Date, lang: string) => date.toLocaleDateString(lang, { weekday: "narrow" });
  mount("ar");
  expect(firstWeekday()).toBe(narrow(new Date(2026, 0, 3), "ar")); // a Saturday
  act(() => root.unmount());
  host.remove();
  mount("en");
  expect(firstWeekday()).toBe(narrow(new Date(2026, 0, 4), "en")); // a Sunday
});
