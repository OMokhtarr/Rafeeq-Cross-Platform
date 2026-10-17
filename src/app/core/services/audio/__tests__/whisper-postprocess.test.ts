import {
  isLikelyHallucination,
  stitchSeam,
  wordsFromSegments,
} from "../stt/whisper/whisper-postprocess";

describe("isLikelyHallucination", () => {
  it("keeps real recitation that scores just over 0.6 no_speech but is confident", () => {
    expect(isLikelyHallucination({ text: "الحمد لله", no_speech_prob: 0.61, avg_logprob: -0.2 })).toBe(false);
  });
  it("drops subtitle-credit hallucinations but not words that merely contain a trigger", () => {
    expect(isLikelyHallucination({ text: "ترجمة نانسي قنقر" })).toBe(true);
    expect(isLikelyHallucination({ text: "والملائكة" })).toBe(false);
  });
  it("does not treat a missing avg_logprob as a pass or a fail", () => {
    expect(isLikelyHallucination({ text: "قل هو الله أحد", no_speech_prob: 0.7 })).toBe(false);
  });
  it("drops very high no_speech, unconfident, repetitive and degenerate segments", () => {
    expect(isLikelyHallucination({ text: "قل", no_speech_prob: 0.9 })).toBe(true);
    expect(isLikelyHallucination({ text: "قل", no_speech_prob: 0.7, avg_logprob: -0.8 })).toBe(true);
    expect(isLikelyHallucination({ text: "قل", avg_logprob: -1.2 })).toBe(true);
    expect(isLikelyHallucination({ text: "قل", compression_ratio: 3 })).toBe(true);
    expect(isLikelyHallucination({ text: "ششششش" })).toBe(true);
  });
});

describe("wordsFromSegments", () => {
  it("drops words timed inside silence", () => {
    const seg = { text: "", words: [{ word: "قل", start: 0.1, end: 0.4 }, { word: "أعوذ", start: 2.0, end: 2.4 }] };
    expect(wordsFromSegments([seg], [{ startMs: 0, endMs: 600 }])).toEqual(["قل"]);
  });
  it("falls back to segment text when Whisper gives no word timings", () => {
    expect(wordsFromSegments([{ text: " بسم الله " }], [])).toEqual(["بسم", "الله"]);
  });
  it("skips hallucinated segments", () => {
    expect(wordsFromSegments([{ text: "ترجمة نانسي قنقر" }, { text: "قل" }], [])).toEqual(["قل"]);
  });
});

describe("stitchSeam", () => {
  it("removes the overlap at a forced-cut seam", () => {
    expect(stitchSeam(["الرحمن", "الرحيم"], ["الرحيم", "مالك", "يوم"])).toEqual(["مالك", "يوم"]);
  });
  it("keeps everything when the head does not match the tail", () => {
    expect(stitchSeam(["تكذبان"], ["فبأي", "آلاء", "ربكما", "تكذبان"])).toEqual(["فبأي", "آلاء", "ربكما", "تكذبان"]);
  });
});
