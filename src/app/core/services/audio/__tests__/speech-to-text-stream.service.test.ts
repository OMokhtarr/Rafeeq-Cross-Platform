import { parseStreamMessage } from "../speech-to-text-stream.service";

describe("parseStreamMessage", () => {
  it("reads the transcript, finality and per-word confidences", () => {
    const frame = JSON.stringify({
      type: "Results",
      is_final: true,
      channel: {
        alternatives: [
          {
            transcript: "الحمد لله",
            words: [
              { word: "الحمد", confidence: 0.91, start: 0, end: 0.4 },
              { word: "لله", confidence: 0.62 },
            ],
          },
        ],
      },
    });
    expect(parseStreamMessage(frame)).toEqual({
      text: "الحمد لله",
      isFinal: true,
      words: [
        { word: "الحمد", confidence: 0.91 },
        { word: "لله", confidence: 0.62 },
      ],
    });
  });

  it("ignores frames that are not results", () => {
    expect(parseStreamMessage(JSON.stringify({ type: "Metadata" }))).toBeNull();
    expect(parseStreamMessage("not json")).toBeNull();
  });

  it("tolerates a result without a word list", () => {
    const frame = JSON.stringify({ type: "Results", channel: { alternatives: [{ transcript: "" }] } });
    expect(parseStreamMessage(frame)).toEqual({ text: "", isFinal: false, words: undefined });
  });
});
