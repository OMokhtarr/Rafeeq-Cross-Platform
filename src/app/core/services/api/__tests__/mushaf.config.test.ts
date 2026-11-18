import {
  MUSHAFS,
  layoutFor,
  mushafIdFor,
  rendererFor,
} from "../mushaf.config";
import { fetchVersesByPage } from "../quran-api.client";

const TAJWEED = "<rule class=ham_wasl>ٱ</rule>لۡ";

describe("madani_1405_tajweed mushaf kind", () => {
  it("maps kinds to their page layout", () => {
    expect(layoutFor("madani_1405_tajweed")).toBe("1405");
    expect(layoutFor("qpc_v4_tajweed")).toBe("1421");
  });

  it("uses the unicode-tajweed renderer, and v4-glyph for the rest", () => {
    expect(rendererFor("madani_1405_tajweed")).toBe("unicode-tajweed");
    expect(rendererFor("qpc_v4_tajweed")).toBe("v4-glyph");
    expect(rendererFor("uthmani")).toBe("v4-glyph");
  });

  it("asks the API for mushaf 2 and the tajweed word field", () => {
    expect(mushafIdFor("madani_1405_tajweed")).toBe(2);
    expect(MUSHAFS.madani_1405_tajweed.wordFields).toBe(
      "text_uthmani,text_uthmani_tajweed,line_number,page_number",
    );
  });
});

describe("fetchVersesByPage tajweed text", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it("passes text_uthmani_tajweed through as textTajweed", async () => {
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
                  text_uthmani_tajweed: TAJWEED,
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
    expect(verses[0].words[0].textTajweed).toBe(TAJWEED);
  });
});
