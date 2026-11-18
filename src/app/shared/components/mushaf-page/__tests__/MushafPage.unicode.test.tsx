import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import MushafPage from "../MushafPage";
import type { Verse } from "../../../models/verse.model";

const mockEnsurePageFont = jest.fn(() => Promise.resolve());
const mockEnsureHafsUnicodeFont = jest.fn(() => Promise.resolve());

jest.mock("../../../../core/context/ThemeContext", () => ({
  useTheme: () => ({ theme: "day" }),
}));
jest.mock("../../../../core/services/api/font.loader", () => ({
  ensurePageFont: () => mockEnsurePageFont(),
  ensureHafsUnicodeFont: () => mockEnsureHafsUnicodeFont(),
  ensureBismillahFont: () => Promise.resolve(),
  ensureSurahNamesFont: () => Promise.resolve(),
  fontFamilyForPage: (p: number) => `QPC_V4_P${String(p).padStart(3, "0")}`,
  paletteNameForPage: (p: number, v: string) => `--tw-P${String(p).padStart(3, "0")}-${v}`,
  setMonoPaletteColor: () => {},
  BISMILLAH_FONT_FAMILY: "QPC_BSML",
  HAFS_UNICODE_FONT_FAMILY: "UthmanicHafsV18",
}));
jest.mock("../../../../core/services/data/metadata.service", () => ({
  getSurahNameArabic: () => "",
}));

const MARKUP =
  "<rule class=ham_wasl>ٱ</rule>لۡمَغۡرِبَ<rule class=madda_permissible>يۡ</rule>نِ";
const STRIPPED = "ٱلۡمَغۡرِبَيۡنِ";

// charType is inverted in this codebase: recitable words are "end".
const word = (position: number, line: number, tajweed: string) => ({
  position,
  charType: "end" as const,
  // The 1405 kind does not request code_v2.
  codeV2: "",
  text_uthmani: "uthmani",
  textTajweed: tajweed,
  lineNumber: line,
  pageNumber: 532,
});
const verses: Verse[] = [
  {
    sura: 55,
    aya: 17,
    text: "",
    page: 532,
    suraNameAr: "",
    words: [word(1, 1, "رَبُّ"), word(2, 1, MARKUP), word(3, 1, "١٧")],
  },
];

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
  // react-scripts sets resetMocks, which wipes the implementations each test.
  mockEnsurePageFont.mockResolvedValue(undefined);
  mockEnsureHafsUnicodeFont.mockResolvedValue(undefined);
});
afterEach(() => {
  act(() => root.unmount());
  localStorage.clear();
});

beforeAll(() => {
  (global as any).ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  (document as any).fonts = {
    load: () => Promise.resolve([]),
    ready: Promise.resolve(),
  };
});

const select = (settings: Record<string, unknown>) =>
  localStorage.setItem(
    "rafiq_settings_v1",
    JSON.stringify({ mushaf: "madani_1405_tajweed", ...settings }),
  );

const renderPage = async (props: Partial<React.ComponentProps<typeof MushafPage>> = {}) => {
  await act(async () => {
    root.render(<MushafPage page={532} verses={verses} {...props} />);
  });
};

const pageRoot = () => container.querySelector(".mushaf-page-glyph") as HTMLElement;
const words = () =>
  Array.from(container.querySelectorAll<HTMLElement>("[data-verse-key]"));

describe("MushafPage in Unicode-tajweed mode", () => {
  it("loads the Hafs Unicode font instead of the page font", async () => {
    select({});
    await renderPage();
    expect(mockEnsureHafsUnicodeFont).toHaveBeenCalled();
    expect(mockEnsurePageFont).not.toHaveBeenCalled();
  });

  it("draws the rule classes as coloured spans", async () => {
    select({ showTajweedColors: true });
    await renderPage();
    const silent = container.querySelector("span.mushaf-tj-silent");
    expect(silent?.textContent).toBe("ٱ");
    expect(container.querySelector("span.mushaf-tj-permissible")?.textContent).toBe("يۡ");
    expect(container.querySelector("script")).toBeNull();
  });

  it("draws plain text when tajweed colours are off", async () => {
    select({ showTajweedColors: false });
    await renderPage();
    expect(container.querySelectorAll("[class*='mushaf-tj-']")).toHaveLength(0);
    expect(words()[1].textContent).toBe(STRIPPED);
  });

  it("follows the tajweed toggle live", async () => {
    select({ showTajweedColors: true });
    await renderPage();
    select({ showTajweedColors: false });
    await act(async () => {
      window.dispatchEvent(new CustomEvent("rafiq-settings-changed"));
    });
    expect(container.querySelectorAll("[class*='mushaf-tj-']")).toHaveLength(0);
  });

  it("uses the Hafs font family and no font palette on the root", async () => {
    select({});
    await renderPage();
    expect(pageRoot().style.fontFamily).toBe("UthmanicHafsV18");
    expect(pageRoot().style.fontPalette ?? "").toBe("");
    expect(pageRoot().classList.contains("mushaf-page-unicode")).toBe(true);
  });

  it("keeps a data-verse-key on every word, end marker included", async () => {
    select({});
    await renderPage();
    expect(words().map((w) => w.dataset.verseKey)).toEqual(["55:17", "55:17", "55:17"]);
    expect(words()[2].textContent).toBe("١٧");
    expect(words()[2].classList.contains("mushaf-verse-end-marker")).toBe(true);
  });

  it("glows with a plain-text overlay and no font palette", async () => {
    select({ showTajweedColors: true });
    await renderPage({ glow: new Map([["55:17:2", 1]]) });
    const overlay = container.querySelector(".mushaf-word-glow") as HTMLElement;
    expect(overlay.textContent).toBe(STRIPPED);
    expect(overlay.style.fontPalette ?? "").toBe("");
    expect(overlay.querySelector("[class*='mushaf-tj-']")).toBeNull();
  });

  it("stays on the V4 renderer when the default mushaf is selected", async () => {
    await renderPage();
    expect(mockEnsurePageFont).toHaveBeenCalled();
    expect(mockEnsureHafsUnicodeFont).not.toHaveBeenCalled();
    expect(pageRoot().classList.contains("mushaf-page-unicode")).toBe(false);
  });
});

describe("MushafPage width fit", () => {
  // A 400x600 page: slot 40px, so the height-derived size is 20px. Three
  // words of 160px make a 480px line, which overflows by 20%.
  beforeEach(() => {
    jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        const width = this.closest(".mushaf-line") ? 160 : 0;
        return { width, height: 0, top: 0, left: 0, right: width, bottom: 0 } as DOMRect;
      });
  });
  afterEach(() => jest.restoreAllMocks());

  it("shrinks a Unicode page until its widest line fits", async () => {
    select({});
    await renderPage();
    expect(pageRoot().style.fontSize).toBe("16px");
  });

  it("leaves V4 at its height-derived size", async () => {
    await renderPage();
    expect(pageRoot().style.fontSize).toBe("20px");
  });
});
