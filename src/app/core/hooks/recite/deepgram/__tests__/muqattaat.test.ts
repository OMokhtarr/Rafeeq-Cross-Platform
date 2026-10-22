import { correctMuqattaatOpening } from "../muqattaat";

describe("correctMuqattaatOpening", () => {
  it("rewrites a fused letter-name opening", () => {
    expect(correctMuqattaatOpening("ياسين والقران الحكيم")).toBe("يس والقران الحكيم");
  });

  it("rewrites a stretched five-letter opening", () => {
    expect(correctMuqattaatOpening("كافهايا عيييين صاد ذكر")).toBe("كهيعص ذكر");
  });

  it("rewrites separate letter names", () => {
    expect(correctMuqattaatOpening("الف لاميم أم يقولون")).toBe("الم ام يقولون");
  });

  it("leaves ordinary speech alone", () => {
    expect(correctMuqattaatOpening("قال لهم")).toBe("قال لهم");
  });
});
