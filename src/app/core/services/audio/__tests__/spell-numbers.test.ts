import {
  SPELLED_NUMBER_CONFIDENCE,
  spellNumber,
  spellNumbersInText,
  spellNumbersInWords,
} from "../stt/spell-numbers";

describe("spellNumber", () => {
  it.each([
    [1, "واحد"],
    [2, "اثنين"],
    [7, "سبعة"],
    [10, "عشرة"],
    [11, "أحد عشر"],
    [12, "اثنا عشر"],
    [19, "تسعة عشر"],
    [20, "عشرين"],
    [40, "أربعين"],
    [99, "تسعة وتسعين"],
    [100, "مئة"],
    [200, "مئتين"],
    [300, "ثلاث مئة"],
    [309, "ثلاث مئة وتسعة"],
    [1000, "ألف"],
    [2000, "ألفين"],
    [3000, "ثلاثة آلاف"],
    [5000, "خمسة آلاف"],
    [50000, "خمسين ألف"],
    [100000, "مئة ألف"],
    [1950, "ألف وتسع مئة وخمسين"],
  ])("spells %i as %s", (n, words) => {
    expect(spellNumber(n)?.join(" ")).toBe(words);
  });

  it("leaves numbers it cannot spell", () => {
    expect(spellNumber(0)).toBeNull();
    expect(spellNumber(1_000_000)).toBeNull();
  });
});

describe("spellNumbersInText", () => {
  it("spells Western, Arabic-Indic and Persian digits", () => {
    expect(spellNumbersInText("عليها 19")).toBe("عليها تسعة عشر");
    expect(spellNumbersInText("عليها ١٩")).toBe("عليها تسعة عشر");
    expect(spellNumbersInText("عليها ۱۹")).toBe("عليها تسعة عشر");
  });

  it("keeps a letter prefix on the first word", () => {
    expect(spellNumbersInText("ب3000 من الملائكة")).toBe("بثلاثة آلاف من الملائكة");
  });

  it("reads thousands separators", () => {
    expect(spellNumbersInText("مقداره 50,000 سنة")).toBe("مقداره خمسين ألف سنة");
    expect(spellNumbersInText("مقداره ٥٠٬٠٠٠ سنة")).toBe("مقداره خمسين ألف سنة");
  });

  it("returns text without digits unchanged", () => {
    expect(spellNumbersInText("  الحمد  لله ")).toBe("  الحمد  لله ");
  });
});

describe("spellNumbersInWords", () => {
  it("spells digit words and lowers their confidence", () => {
    expect(
      spellNumbersInWords([
        { word: "تسع", confidence: 0.95 },
        { word: "و99", confidence: 0.9 },
      ]),
    ).toEqual([
      { word: "تسع", confidence: 0.95 },
      { word: "وتسعة", confidence: SPELLED_NUMBER_CONFIDENCE },
      { word: "وتسعين", confidence: SPELLED_NUMBER_CONFIDENCE },
    ]);
  });
});
