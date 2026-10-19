import { htmlToText } from "../html-text.util";

describe("htmlToText", () => {
  it("removes the markup tafsir text arrives with", () => {
    // Shape of the Ibn Kathir (Arabic) records seen rendering raw in the sheet.
    const raw =
      '<p>ولهذا قال : <span class="arabic qpc-hafs">( فمن يعمل مثقال ذرة خيرا يره )</span></p>' +
      '<p lang="ar" class="ar">قال البخاري : <span class="blue">عن أبي هريرة</span></p>';
    const text = htmlToText(raw);
    expect(text).not.toMatch(/[<>]/);
    expect(text).toContain("ولهذا قال : ( فمن يعمل مثقال ذرة خيرا يره )");
    expect(text).toContain("قال البخاري : عن أبي هريرة");
  });

  it("keeps paragraphs and line breaks as line breaks", () => {
    expect(htmlToText("<p>one</p><p>two<br/>three</p>")).toBe("one\n\ntwo\nthree");
  });

  it("drops footnote markers with their content", () => {
    expect(htmlToText("word<sup foot_note=\"1\">1</sup> next")).toBe("word next");
  });

  it("decodes entities after stripping, so escaped brackets stay text", () => {
    expect(htmlToText("a&nbsp;&amp;&nbsp;b &lt;c&gt; &#1601;")).toBe("a & b <c> ف");
  });

  it("collapses runs of spaces inside a line", () => {
    expect(htmlToText("  a \t  b  ")).toBe("a b");
  });

  it("leaves plain text alone", () => {
    expect(htmlToText("فمن يعمل")).toBe("فمن يعمل");
  });
});
