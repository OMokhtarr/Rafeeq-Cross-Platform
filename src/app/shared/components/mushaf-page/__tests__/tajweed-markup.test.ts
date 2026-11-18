import { parseTajweed, stripTajweed } from "../tajweed-markup";

describe("parseTajweed", () => {
  it("splits rule tags into coloured segments and keeps plain runs bare", () => {
    expect(
      parseTajweed(
        "<rule class=ham_wasl>ٱ</rule>لۡمَغۡرِبَ<rule class=madda_permissible>يۡ</rule>نِ",
      ),
    ).toEqual([
      { text: "ٱ", rule: "silent" },
      { text: "لۡمَغۡرِبَ" },
      { text: "يۡ", rule: "permissible" },
      { text: "نِ" },
    ]);
  });

  it("returns plain text as one segment", () => {
    expect(parseTajweed("رَبُّ")).toEqual([{ text: "رَبُّ" }]);
  });

  it("gives the custom class no colour", () => {
    expect(parseTajweed("<rule class=custom>x</rule>")).toEqual([{ text: "x" }]);
  });

  it("gives an unknown class no colour", () => {
    expect(parseTajweed("<rule class=not_a_rule>x</rule>")).toEqual([{ text: "x" }]);
  });

  it.each([
    ["madda_necessary", "necessary"],
    ["madda_obligatory_mottasel", "obligatory"],
    ["madda_obligatory_monfasel", "obligatory"],
    ["madda_normal", "normal"],
    ["ikhafa_shafawi", "ghunnah"],
    ["iqlab", "ghunnah"],
    ["qalaqah", "qalqalah"],
    ["idgham_mutaqaribayn", "silent"],
  ])("maps %s to %s", (cls, color) => {
    expect(parseTajweed(`<rule class=${cls}>x</rule>`)).toEqual([
      { text: "x", rule: color },
    ]);
  });

  it("keeps any other markup as literal text", () => {
    expect(parseTajweed("<script>alert(1)</script>")).toEqual([
      { text: "<script>alert(1)</script>" },
    ]);
  });
});

describe("stripTajweed", () => {
  it("joins the segment text without tags", () => {
    expect(stripTajweed("ءَال<rule class=madda_obligatory_mottasel>َا</rule>ٓءِ")).toBe(
      "ءَال" + "َا" + "ٓءِ",
    );
  });
});
