import { fitUnicodeFontPx, lineSqueeze } from "../fit-width";

// Lines are 1.8em tall, so a 36px line means the text renders at 20px.
describe("fitUnicodeFontPx", () => {
  it("sizes every page to the typical line width", () => {
    // 350px / 17.5em = 20px rendered.
    expect(fitUnicodeFontPx(20, 350, 36, 40)).toBe(20);
    // Twice the width: 40px.
    expect(fitUnicodeFontPx(20, 700, 36, 80)).toBe(40);
  });

  it("rounds the width target to the nearest pixel", () => {
    // 366px / 17.5em = 20.91px.
    expect(fitUnicodeFontPx(20, 366, 36, 80)).toBe(21);
  });

  it("stops at the line slot", () => {
    // Typical allows 40px; a 36px line in a 54px slot allows 30px.
    expect(fitUnicodeFontPx(20, 700, 36, 54)).toBe(30);
  });

  it("reads the rendered size from the line height, not the requested size", () => {
    // Asked for 20px but lines are 46.8px: text renders at 26px, so reaching
    // the typical 20px means asking for round(20 × 20 / 26) = 15.
    expect(fitUnicodeFontPx(20, 350, 46.8, 60)).toBe(15);
  });

  it("keeps the size when no line was laid out", () => {
    expect(fitUnicodeFontPx(30, 330, 0, 40)).toBe(30);
  });
});

describe("lineSqueeze", () => {
  it("leaves a line whose words fit", () => {
    expect(lineSqueeze(300, 364)).toBe(1);
    expect(lineSqueeze(364, 364)).toBe(1);
  });

  it("condenses a line whose words overflow to exactly the line width", () => {
    expect(lineSqueeze(400, 360)).toBe(0.9);
  });

  it("leaves a line with no measured width", () => {
    expect(lineSqueeze(400, 0)).toBe(1);
  });
});
