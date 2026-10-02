import type { Mark } from "../../../../core/services/quran/recite-aligner.service";
import { quizProgress } from "../quizReciteProgress";

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
