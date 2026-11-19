import { lineSqueeze } from "../line-squeeze";

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
