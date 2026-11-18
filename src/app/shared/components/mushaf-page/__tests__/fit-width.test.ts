import { fitFontToWidth } from "../fit-width";

describe("fitFontToWidth", () => {
  it("shrinks proportionally to the widest line when it overflows", () => {
    expect(fitFontToWidth(30, [300, 360], 330)).toBe(27);
  });

  it("keeps the height-derived size when every line fits", () => {
    expect(fitFontToWidth(30, [300], 330)).toBe(30);
  });

  it("keeps the height-derived size when nothing was measured", () => {
    expect(fitFontToWidth(30, [], 330)).toBe(30);
    expect(fitFontToWidth(30, [0, 0], 330)).toBe(30);
  });
});
