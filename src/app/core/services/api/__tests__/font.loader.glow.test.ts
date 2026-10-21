import {
  fontFamilyForPage,
  injectPalettesForPage,
  paletteNameForPage,
} from "../font.loader";

describe("glow palettes", () => {
  it("names the glow variants", () => {
    expect(paletteNameForPage(3, "glow-day")).toBe("--tw-P003-glow-light");
    expect(paletteNameForPage(3, "glow-night")).toBe("--tw-P003-glow-dark");
  });

  it("injects an all-green override palette for light and dark", () => {
    injectPalettesForPage(3, fontFamilyForPage(3));
    const css = document.getElementById("qpc-v4-palettes")!.textContent!;
    expect(css).toMatch(
      /@font-palette-values --tw-P003-glow-light \{[^}]*override-colors: 0 #00a33d, 1 #00a33d[^}]*9 #00a33d;/,
    );
    expect(css).toMatch(
      /@font-palette-values --tw-P003-glow-dark \{[^}]*override-colors: 0 #4cff9a, 1 #4cff9a[^}]*9 #4cff9a;/,
    );
  });
});
