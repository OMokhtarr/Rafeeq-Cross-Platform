import {
  DEFAULT_MUSHAF,
  MUSHAFS,
  layoutFor,
  mushafIdFor,
} from "../mushaf.config";
import { fetchVersesByPage } from "../quran-api.client";

const GLYPH = "ﱁ";

describe("madani_1405_tajweed mushaf kind", () => {
  it("maps kinds to their page layout", () => {
    expect(layoutFor("madani_1405_tajweed")).toBe("1405");
    expect(layoutFor("qpc_v4_tajweed")).toBe("1421");
  });

  it("is the default", () => {
    expect(DEFAULT_MUSHAF).toBe("madani_1405_tajweed");
  });

  it("asks the API for mushaf 2 with each word's glyph and glyph page", () => {
    expect(mushafIdFor("madani_1405_tajweed")).toBe(2);
    expect(MUSHAFS.madani_1405_tajweed.wordFields).toBe(
      "code_v2,v2_page,text_uthmani,line_number,page_number",
    );
  });
});

describe("fetchVersesByPage word fields", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("passes each word's glyph and glyph page through", async () => {
    // First call is the token broker, second the content API.
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ access_token: "t", expires_in: 3600 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          verses: [
            {
              id: 1,
              verse_number: 1,
              verse_key: "1:1",
              text_uthmani: "x",
              page_number: 5,
              juz_number: 1,
              words: [
                {
                  position: 1,
                  char_type_name: "word",
                  text_uthmani: "ٱلۡ",
                  code_v2: GLYPH,
                  v2_page: 4,
                  line_number: 3,
                  page_number: 5,
                },
              ],
            },
          ],
        }),
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const verses = await fetchVersesByPage(
      5,
      MUSHAFS.madani_1405_tajweed.wordFields,
      2,
    );
    expect(verses[0].words[0].codeV2).toBe(GLYPH);
    expect(verses[0].words[0].glyphPage).toBe(4);
  });
});
