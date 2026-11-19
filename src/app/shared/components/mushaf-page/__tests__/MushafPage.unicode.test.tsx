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

const v4Verses: Verse[] = [
  {
    sura: 55,
    aya: 17,
    text: "",
    page: 532,
    suraNameAr: "",
    words: [
      { ...word(1, 1, ""), codeV2: "ﱁ", textTajweed: undefined },
      { ...word(2, 1, ""), codeV2: "ﱂ", textTajweed: undefined },
    ],
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

  it.each([true, false])(
    "draws plain text whatever the tajweed setting (%s): 1405 offers no colours yet",
    async (showTajweedColors) => {
      select({ showTajweedColors });
      await renderPage();
      expect(container.querySelectorAll("[class*='mushaf-tj-']")).toHaveLength(0);
      expect(words()[1].textContent).toBe(STRIPPED);
      expect(container.querySelector("script")).toBeNull();
    },
  );

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

  it("stays on the V4 renderer for V4 data", async () => {
    await renderPage({ verses: v4Verses });
    expect(mockEnsurePageFont).toHaveBeenCalled();
    expect(mockEnsureHafsUnicodeFont).not.toHaveBeenCalled();
    expect(pageRoot().classList.contains("mushaf-page-unicode")).toBe(false);
  });

  it("follows the data, not the setting: 1405 data under a V4 setting draws Unicode", async () => {
    localStorage.setItem(
      "rafiq_settings_v1",
      JSON.stringify({ mushaf: "qpc_v4_tajweed" }),
    );
    await renderPage();
    expect(pageRoot().classList.contains("mushaf-page-unicode")).toBe(true);
    expect(mockEnsureHafsUnicodeFont).toHaveBeenCalled();
  });

  it("follows the data, not the setting: V4 data under a 1405 setting draws V4", async () => {
    select({});
    await renderPage({ verses: v4Verses });
    expect(pageRoot().classList.contains("mushaf-page-unicode")).toBe(false);
    expect(mockEnsurePageFont).toHaveBeenCalled();
  });
});

describe("MushafPage width fit", () => {
  // A 400x600 page: slot 40px, so the height-derived size is 20px, and a 36px
  // line (1.8em) means the text renders at that size. Three words of 160px
  // make a 480px line, which overflows the 400px line.
  let wordWidth = 160;
  let lineHeight = 36;
  const firstLine = () =>
    pageRoot().querySelector<HTMLElement>(".mushaf-line")!;
  beforeEach(() => {
    wordWidth = 160;
    lineHeight = 36;
    jest.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(400);
    jest
      .spyOn(Element.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: Element) {
        const isLine = this.classList.contains("mushaf-line");
        const width = !isLine && this.closest(".mushaf-line") ? wordWidth : 0;
        const height = isLine ? lineHeight : 0;
        return { width, height, top: 0, left: 0, right: width, bottom: height } as DOMRect;
      });
  });
  afterEach(() => jest.restoreAllMocks());

  it("keeps the common size and condenses only the overflowing line", async () => {
    // 400px / 17.5em allows 23px, the 40px slot floor(22.2) = 22; the long
    // line does not shrink the page, it is condensed to 400 / 480 instead.
    select({});
    await renderPage();
    expect(pageRoot().style.fontSize).toBe("22px");
    expect(firstLine().style.width).toBe("480px");
    expect(firstLine().style.transform).toMatch(/^scaleX\(0\.8333/);
  });

  it("leaves a line that fits uncondensed", async () => {
    wordWidth = 100;
    select({});
    await renderPage();
    expect(firstLine().style.transform).toBe("");
    expect(firstLine().style.width).toBe("");
  });

  it("grows a Unicode page to the typical line width, up to its slot", async () => {
    // 500px wide: the typical 17.5em line allows 29px, but a 36px line in a
    // 40px slot caps it at floor(20 × 40 / 36) = 22.
    jest.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(500);
    wordWidth = 100;
    select({});
    await renderPage();
    expect(pageRoot().style.fontSize).toBe("22px");
  });

  it("gives every page the same size, however long its lines", async () => {
    wordWidth = 100;
    select({});
    await renderPage();
    const shortLines = pageRoot().style.fontSize;
    // Turn to a page whose words are nearly twice as wide.
    wordWidth = 190;
    await renderPage({ page: 533 });
    expect(pageRoot().style.fontSize).toBe(shortLines);
    expect(firstLine().style.transform).toMatch(/^scaleX\(/);
  });

  it("leaves V4 at its height-derived size", async () => {
    await renderPage({ verses: v4Verses });
    expect(pageRoot().style.fontSize).toBe("20px");
  });
});
