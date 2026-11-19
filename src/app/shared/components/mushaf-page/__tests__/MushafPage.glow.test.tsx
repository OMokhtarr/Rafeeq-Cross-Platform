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
  fontFamilyForPage: (p: number) => `QPC_V4_P${String(p).padStart(3, "0")}`,
  paletteNameForPage: (p: number, v: string) =>
    `--tw-P${String(p).padStart(3, "0")}-${
      { day: "light", night: "dark", mono: "mono", "glow-day": "glow-light", "glow-night": "glow-dark" }[v]
    }`,
  setMonoPaletteColor: () => {},
  BISMILLAH_FONT_FAMILY: "QPC_BSML",
}));
jest.mock("../../../../core/services/data/metadata.service", () => ({
  getSurahNameArabic: () => "",
}));

// charType is inverted in this codebase: recitable words are "end".
const word = (position: number, line: number, text: string) => ({
  position,
  charType: "end" as const,
  text_uthmani: text,
  codeV2: text,
  lineNumber: line,
  pageNumber: 1,
});
const verse = (aya: number, line: number): Verse => ({
  sura: 1,
  aya,
  text: "",
  page: 1,
  suraNameAr: "",
  words: [word(1, line, "a"), word(2, line, "b"), word(3, line, "c")],
});
const verses = [verse(1, 3), verse(2, 4)];

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLElement;
let root: Root;
beforeEach(() => {
  container = document.createElement("div");
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
});

// MushafPage flips to ready after its font promises resolve.
const renderPage = async (props: Partial<React.ComponentProps<typeof MushafPage>>) => {
  await act(async () => {
    root.render(<MushafPage page={1} verses={verses} {...props} />);
  });
};

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

describe("MushafPage glow overlay", () => {
  it("renders one green-palette overlay inside the glowing word", async () => {
    await renderPage({ glow: new Map([["1:1:2", 7]]) });
    const overlays = container.querySelectorAll(".mushaf-word-glow");
    expect(overlays).toHaveLength(1);
    const overlay = overlays[0] as HTMLElement;
    expect(overlay.style.fontPalette).toBe("--tw-P001-glow-light");
    expect(overlay.getAttribute("aria-hidden")).toBe("true");
    const parent = overlay.parentElement!;
    expect(parent.classList.contains("mushaf-word--glowing")).toBe(true);
    expect(parent.textContent).toBe("bb");
  });

  it("does not overlay a hidden word", async () => {
    await renderPage({
      hidden: new Set(["1:1"]),
      glow: new Map([["1:1:2", 7]]),
    });
    expect(container.querySelector("[data-verse-key]")).not.toBeNull();
    expect(container.querySelectorAll(".mushaf-word-glow")).toHaveLength(0);
  });
});

describe("MushafPage with words from another page's font (1405)", () => {
  // Page 121 in the 1405 layout opens with words held by 1421 page 120.
  const relaid: Verse[] = [
    {
      ...verse(1, 3),
      words: [
        { ...word(1, 3, "a"), glyphPage: 120 },
        { ...word(2, 3, "b"), glyphPage: 1 },
        { ...word(3, 3, "c"), glyphPage: 1 },
      ],
    },
  ];

  it("draws each word in its own page's font and palette", async () => {
    await renderPage({ verses: relaid });
    const spans = container.querySelectorAll<HTMLElement>("[data-verse-key]");
    expect(spans[0].style.fontFamily).toBe("QPC_V4_P120");
    expect(spans[0].style.fontPalette).toBe("--tw-P120-light");
    // The page's own words inherit the container's font.
    expect(spans[1].style.fontFamily).toBe("");
  });

  it("glows a word in its own page's palette", async () => {
    await renderPage({ verses: relaid, glow: new Map([["1:1:1", 3]]) });
    const overlay = container.querySelector<HTMLElement>(".mushaf-word-glow")!;
    expect(overlay.style.fontPalette).toBe("--tw-P120-glow-light");
  });
});
