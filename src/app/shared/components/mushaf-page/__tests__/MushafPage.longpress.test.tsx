import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import MushafPage from "../MushafPage";
import type { Verse } from "../../../models/verse.model";

jest.mock("../../../../core/context/ThemeContext", () => ({
  useTheme: () => ({ theme: "day" }),
}));
jest.mock("../../../../core/services/api/font.loader", () => ({
  ensurePageFont: () => Promise.resolve(),
  ensureBismillahFont: () => Promise.resolve(),
  ensureSurahNamesFont: () => Promise.resolve(),
  fontFamilyForPage: () => "QPC_V4_P001",
  paletteNameForPage: () => "--tw-P001-light",
  setMonoPaletteColor: () => {},
  BISMILLAH_FONT_FAMILY: "QPC_BSML",
}));
jest.mock("../../../../core/services/data/metadata.service", () => ({
  getSurahNameArabic: () => "",
}));

// charType is inverted in this codebase: recitable words are "end".
const word = (position: number, text: string) => ({
  position,
  charType: "end" as const,
  text_uthmani: text,
  codeV2: text,
  lineNumber: 3,
  pageNumber: 1,
});
const verses: Verse[] = [
  { sura: 1, aya: 1, text: "", page: 1, suraNameAr: "", words: [word(1, "a"), word(2, "b")] },
];

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  (document as any).fonts = { load: () => Promise.resolve([]), ready: Promise.resolve() };
});
beforeEach(() => {
  jest.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

const renderPage = async (onVerseLongPress: jest.Mock) => {
  await act(async () => {
    root.render(<MushafPage page={1} verses={verses} onVerseLongPress={onVerseLongPress} />);
  });
};

const wordEl = () => container.querySelector('[data-verse-key="1:1"]') as HTMLElement;
const fire = (el: HTMLElement, type: string) =>
  act(() => {
    el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
  });

describe("MushafPage long-press", () => {
  it("opens the verse after a held touch", async () => {
    const onLong = jest.fn();
    await renderPage(onLong);
    fire(wordEl(), "touchstart");
    act(() => jest.advanceTimersByTime(1000));
    expect(onLong).toHaveBeenCalledWith("1:1");
  });

  // Android's edge-swipe Back claims the touch: the WebView sees touchstart and
  // then touchcancel, never a move or an end. The press must not fire then.
  it("does not open the verse when the system cancels the touch", async () => {
    const onLong = jest.fn();
    await renderPage(onLong);
    fire(wordEl(), "touchstart");
    fire(wordEl(), "touchcancel");
    act(() => jest.advanceTimersByTime(1000));
    expect(onLong).not.toHaveBeenCalled();
  });
});
