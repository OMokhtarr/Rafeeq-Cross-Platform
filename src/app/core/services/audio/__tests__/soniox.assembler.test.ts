import { createSonioxAssembler, tokensToWords } from "../stt/soniox.assembler";

const t = (text: string, is_final = false, confidence = 0.9) => ({ text, is_final, confidence });

describe("soniox assembler", () => {
  it("emits a cumulative interim of finals plus non-finals", () => {
    const a = createSonioxAssembler();
    a.push([t("بسم", true), t(" ", true)]);
    expect(a.push([t("الل"), t("ه")])).toEqual([
      {
        text: "بسم الله",
        isFinal: false,
        words: [
          { word: "بسم", confidence: 0.9 },
          { word: "الله", confidence: 0.9 },
        ],
      },
    ]);
  });

  it("emits a final at <end> and starts a fresh window", () => {
    const a = createSonioxAssembler();
    a.push([t("الحمد", true), t(" ", true), t("لله", true)]);
    const out = a.push([t("<end>", true), t("رب", false)]);
    expect(out.map((e) => [e.text, e.isFinal])).toEqual([
      ["الحمد لله", true],
      ["رب", false],
    ]);
  });

  it("treats <fin> like <end> and never shows markers", () => {
    const a = createSonioxAssembler();
    expect(a.push([t("مالك", true), t("<fin>", true)])).toEqual([
      { text: "مالك", isFinal: true, words: [{ word: "مالك", confidence: 0.9 }] },
    ]);
  });

  it("starts the next utterance with finals that follow the marker", () => {
    const a = createSonioxAssembler();
    a.push([t("الرحمن", true)]);
    const out = a.push([t("<end>", true), t("الرحيم", true), t(" ", true), t("مال")]);
    expect(out.map((e) => [e.text, e.isFinal])).toEqual([
      ["الرحمن", true],
      ["الرحيم مال", false],
    ]);
    expect(a.push([t("<end>", true)]).map((e) => [e.text, e.isFinal])).toEqual([["الرحيم", true]]);
  });

  it("settles an empty window with a final when an interim was shown", () => {
    const a = createSonioxAssembler();
    a.push([t("رب")]);
    expect(a.push([t("<end>", true)])).toEqual([{ text: "", isFinal: true, words: [] }]);
  });

  it("uses the lowest piece confidence for a word", () => {
    expect(tokensToWords([t("الر", true, 0.95), t("حمن", true, 0.4)])).toEqual([
      { word: "الرحمن", confidence: 0.4 },
    ]);
  });

  it("counts a missing confidence as 1 and splits on whitespace inside a token", () => {
    expect(tokensToWords([{ text: "قل هو" }, { text: " الله", confidence: 0.7 }])).toEqual([
      { word: "قل", confidence: 1 },
      { word: "هو", confidence: 1 },
      { word: "الله", confidence: 0.7 },
    ]);
  });

  it("skips an interim that repeats the last one", () => {
    const a = createSonioxAssembler();
    expect(a.push([t("بسم", true), t(" ", true), t("الل")])).toHaveLength(1);
    // A message with no new tokens re-sends the same guess.
    expect(a.push([t("الل")])).toEqual([]);
    expect(a.push([t("الله")]).map((e) => e.text)).toEqual(["بسم الله"]);
  });

  it("emits no final for an empty utterance", () => {
    expect(createSonioxAssembler().push([t("<end>", true)])).toEqual([]);
  });
});
