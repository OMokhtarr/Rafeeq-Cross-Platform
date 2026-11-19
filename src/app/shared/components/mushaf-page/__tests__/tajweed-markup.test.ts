import { parseTajweed, stripTajweed } from "../tajweed-markup";

describe("parseTajweed", () => {
  it("splits rule tags into coloured segments and keeps plain runs bare", () => {
    expect(
      parseTajweed(
        "<rule class=ham_wasl>ٱ</rule>لۡمَغۡرِبَ<rule class=madda_permissible>يۡ</rule>نِ",
      ),
    ).toEqual([
      { text: "ٱ", rule: "silent" },
      { text: "لۡمَ" },
      { text: "غۡ", rule: "heavy" },
      { text: "رِبَ" },
      { text: "يۡ", rule: "permissible" },
      { text: "نِ" },
    ]);
  });

  it("returns plain text as one segment", () => {
    expect(parseTajweed("رَبُّ")).toEqual([{ text: "رَبُّ" }]);
  });

  it.each(["خ", "ص", "ض", "غ", "ط", "ق", "ظ"])(
    "colours the always-heavy letter %s with its vowel marks",
    (letter) => {
      expect(parseTajweed(`يَ${letter}ُّونَ`)).toEqual([
        { text: "يَ" },
        { text: `${letter}ُّ`, rule: "heavy" },
        { text: "ونَ" },
      ]);
    },
  );

  it("leaves a heavy letter inside another rule to that rule", () => {
    // ق under qalqalah keeps the qalqalah colour.
    expect(parseTajweed("يَ<rule class=qalaqah>قۡ</rule>طَعُونَ")).toEqual([
      { text: "يَ" },
      { text: "قۡ", rule: "qalqalah" },
      { text: "طَ", rule: "heavy" },
      { text: "عُونَ" },
    ]);
  });

  it("does not colour ر or the lam of the Name, whose heaviness depends on context", () => {
    expect(parseTajweed("رَسُولُ ٱللَّهِ")).toEqual([{ text: "رَسُولُ ٱللَّهِ" }]);
  });

  it("gives the custom class no colour", () => {
    expect(parseTajweed("<rule class=custom>x</rule>")).toEqual([{ text: "x" }]);
  });

  it("gives an unknown class no colour", () => {
    expect(parseTajweed("<rule class=not_a_rule>x</rule>")).toEqual([{ text: "x" }]);
  });

  it("parses the hyphenated custom-alef-maksora class nested in a madda", () => {
    // Verbatim from the API (55:76 مُتَّكِـِٔينَ … عَبۡقَرِيٍّ area, page 533).
    expect(
      parseTajweed(
        "صِر<rule class=madda_normal><rule class=custom-alef-maksora>ٰ</rule></rule>طَ",
      ),
    ).toEqual([
      { text: "صِ", rule: "heavy" },
      { text: "ر" },
      { text: "ٰ", rule: "normal" },
      { text: "طَ", rule: "heavy" },
    ]);
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
