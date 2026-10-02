import type { Mark } from "../../../../core/services/quran/recite-aligner.service";
import { hiddenCardTokens, quizProgress } from "../quizReciteProgress";

const target = { completeAt: 10, wordCount: 10 };
const at = (wordIndex: number) => ({ sura: 2, aya: 255, wordIndex });
const red = (wordIndex: number, kind: Mark["kind"] = "missed"): [string, Mark] => [
  `2:255:${wordIndex}`,
  { kind, position: wordIndex + 1 },
];

describe("quizProgress", () => {
  it("is complete only at the verse end with no red words left", () => {
    expect(quizProgress({ cursor: at(10), marks: new Map() }, target, 4).complete).toBe(true);
    expect(quizProgress({ cursor: at(10), marks: new Map([red(6)]) }, target, 4).complete).toBe(false);
    expect(quizProgress({ cursor: at(9), marks: new Map() }, target, 4).complete).toBe(false);
  });

  it("reports progress and red words relative to the hidden portion", () => {
    const p = quizProgress({ cursor: at(8), marks: new Map([red(6, "wrong")]) }, target, 4);
    expect(p.revealedWordCount).toBe(4);
    expect([...p.mistakeWordIndexes]).toEqual([2]);
  });

  it("reveals nothing new while the reciter is still in the shown snippet", () => {
    expect(quizProgress({ cursor: at(3), marks: new Map() }, target, 4).revealedWordCount).toBe(0);
  });
});

describe("hiddenCardTokens", () => {
  // 2:2's hidden half as the question card splits the verse text: each pause
  // mark is a token of its own, so token i is not word i.
  const tokens = ["ۛ", "فِيهِ", "ۛ", "هُدًى", "لِّلْمُتَّقِينَ"];
  const shown = (revealedWordCount: number, mistakes: number[], hintLevel = 0) =>
    hiddenCardTokens(tokens, { revealedWordCount, mistakeWordIndexes: new Set(mistakes) }, hintLevel).map(
      (t) => `${t.text}:${t.style}`,
    );

  it("puts the red on the word said wrongly, not on a pause mark before it", () => {
    expect(shown(3, [1])).toEqual([
      "ۛ:recited",
      "فِيهِ:recited",
      "ۛ:recited",
      "هُدًى:mistake",
      "لِّلْمُتَّقِينَ:recited",
    ]);
  });

  it("shows a recited word together with its pause marks", () => {
    expect(shown(1, [])).toEqual(["ۛ:recited", "فِيهِ:recited", "ۛ:recited"]);
  });

  it("still shows hint tokens past the recited words", () => {
    expect(shown(1, [], 4)).toEqual(["ۛ:recited", "فِيهِ:recited", "ۛ:recited", "هُدًى:hint"]);
  });

  it("shows nothing before anything is recited or hinted", () => {
    expect(shown(0, [])).toEqual([]);
  });
});
