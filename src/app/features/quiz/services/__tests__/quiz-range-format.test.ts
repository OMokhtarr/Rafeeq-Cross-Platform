import { rangeKey, rangeLabel, deriveName } from "../quiz-range-format";
import type { QuizRange } from "../../../../shared/models/verse.model";

// English labels keep the assertions readable; production passes Arabic.
const labels = {
  juzWord: "Juz",
  pageWord: "p.",
  others: "others",
  juzPlural: "juz",
  surahPlural: "surahs",
  pagePlural: "page ranges",
  surahName: (n: number) => `S${n}`,
  toNum: (n: number) => String(n),
};

describe("rangeKey", () => {
  it("gives equal ranges the same key", () => {
    expect(rangeKey({ kind: "juz", juz: 30 })).toBe(
      rangeKey({ kind: "juz", juz: 30 }),
    );
  });

  it("separates kinds that share a number", () => {
    expect(rangeKey({ kind: "juz", juz: 2 })).not.toBe(
      rangeKey({ kind: "surah", surah: 2 }),
    );
  });

  it("distinguishes page spans by both ends", () => {
    expect(rangeKey({ kind: "pages", from: 1, to: 10 })).not.toBe(
      rangeKey({ kind: "pages", from: 1, to: 11 }),
    );
  });
});

describe("rangeLabel", () => {
  it("labels a juz", () => {
    expect(rangeLabel({ kind: "juz", juz: 30 }, labels)).toBe("Juz 30");
  });

  it("labels a surah by name", () => {
    expect(rangeLabel({ kind: "surah", surah: 2 }, labels)).toBe("S2");
  });

  it("labels a page span with an en dash", () => {
    expect(rangeLabel({ kind: "pages", from: 100, to: 120 }, labels)).toBe(
      "p. 100–120",
    );
  });

  it("labels a single-page span without a dash", () => {
    expect(rangeLabel({ kind: "pages", from: 77, to: 77 }, labels)).toBe(
      "p. 77",
    );
  });
});

describe("deriveName", () => {
  it("uses the range's own label when there is exactly one", () => {
    expect(deriveName([{ kind: "juz", juz: 30 }], labels, [])).toBe("Juz 30");
  });

  it("counts several ranges of a single kind", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 1 },
      { kind: "juz", juz: 2 },
      { kind: "juz", juz: 3 },
    ];
    expect(deriveName(ranges, labels, [])).toBe("3 juz");
  });

  it("names the first range plus a remainder when kinds are mixed", () => {
    const ranges: QuizRange[] = [
      { kind: "juz", juz: 30 },
      { kind: "surah", surah: 2 },
      { kind: "pages", from: 1, to: 5 },
    ];
    expect(deriveName(ranges, labels, [])).toBe("Juz 30 + 2 others");
  });

  it("appends a suffix when the derived name is already taken", () => {
    expect(deriveName([{ kind: "juz", juz: 30 }], labels, ["Juz 30"])).toBe(
      "Juz 30 (2)",
    );
  });

  it("keeps counting up past the first collision", () => {
    expect(
      deriveName([{ kind: "juz", juz: 30 }], labels, ["Juz 30", "Juz 30 (2)"]),
    ).toBe("Juz 30 (3)");
  });

  it("returns an empty string for an empty list rather than throwing", () => {
    expect(deriveName([], labels, [])).toBe("");
  });
});
