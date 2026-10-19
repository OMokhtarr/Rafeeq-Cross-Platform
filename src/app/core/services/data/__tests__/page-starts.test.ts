/**
 * The bundled page-start table.
 *
 * Expected verses are the QF content API's /pages/lookup first_verse_key,
 * which /verses/by_page — what the viewer renders — agrees with. Every
 * selectable mushaf (V4 19, Uthmani 4, IndoPak 3, and the default layout
 * Imlaei falls back to) shares these 604 page breaks. The table had drifted
 * from them on the pages pinned here, so hide mode, playback page turns and
 * page ranges put verses on the neighbouring page.
 */

import * as fs from "fs";
import * as path from "path";
import { estimatePageForVerse, getPageStart } from "../metadata.service";

jest.mock("../../storage/idb.service", () => ({ idb: {} }));
jest.mock("../../api/quran-data-provider", () => ({}));

const CORRECTED: Record<number, string> = {
  121: "5:78", 122: "5:84", 123: "5:91", 145: "6:131",
  532: "55:19", 533: "55:42", 534: "55:70", 565: "68:17",
  568: "69:36", 570: "70:41", 576: "74:19", 584: "79:17",
  586: "80:41", 588: "83:5", 589: "83:34", 590: "84:25",
  592: "87:11", 593: "88:23", 594: "89:23", 595: "90:19",
  596: "92:10", 597: "94:3", 598: "96:13", 599: "98:6",
  600: "100:6",
};

const key = (p: { sura: number; aya: number } | null) => (p ? `${p.sura}:${p.aya}` : null);

describe("page starts", () => {
  it.each(Object.entries(CORRECTED))("page %s starts at %s", (page, verse) => {
    expect(key(getPageStart(Number(page)))).toBe(verse);
  });

  it("places the verses either side of a corrected break on the right page", () => {
    // Al-Layl 10 opens page 596, Al-Fajr 23 opens page 594.
    expect(estimatePageForVerse(92, 9)).toBe(595);
    expect(estimatePageForVerse(92, 10)).toBe(596);
    expect(estimatePageForVerse(89, 22)).toBe(593);
    expect(estimatePageForVerse(89, 23)).toBe(594);
    // Juz 7 (5:82) begins on page 121, not 122.
    expect(estimatePageForVerse(5, 82)).toBe(121);
  });

  it("matches the Android Auto copy entry for entry", () => {
    const kt = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../../../../android/app/src/main/java/com/rafeeq/quranquiz/auto/RafeeqAudioUrls.kt",
      ),
      "utf8",
    );
    const body = kt.match(/PAGE_STARTS: IntArray = intArrayOf\(([^)]*)\)/);
    expect(body).not.toBeNull();
    const nums = body![1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
    for (let page = 1; page <= 604; page++) {
      expect(`${page} ${nums[page * 2]}:${nums[page * 2 + 1]}`).toBe(
        `${page} ${key(getPageStart(page))}`,
      );
    }
  });
});
