import { logText } from "../stt/log-text";

describe("logText", () => {
  it("folds line breaks to spaces and caps the length at 120", () => {
    expect(logText("a\r\nb\nc\rd")).toBe("a b c d");
    expect(logText("x".repeat(300))).toHaveLength(120);
  });
  it("prints a missing value as empty", () => {
    expect(logText(undefined)).toBe("");
  });
});
