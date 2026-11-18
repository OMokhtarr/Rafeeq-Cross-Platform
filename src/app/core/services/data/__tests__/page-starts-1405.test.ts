/**
 * Layout-aware page starts: the Madani 1405 (Tajweed) mushaf breaks 25 pages
 * differently from the 1421 layout every other mushaf shares.
 */

import * as fs from "fs";
import * as path from "path";
import {
  estimatePageForVerse,
  getActivePageLayout,
  getPageStart,
  getSurahEndPage,
  getSuraForPage,
  setActivePageLayout,
} from "../metadata.service";

jest.mock("../../storage/idb.service", () => ({ idb: {} }));
jest.mock("../../api/quran-data-provider", () => ({}));

const OVERRIDES_1405: Record<number, string> = {
  121: "5:77", 122: "5:83", 123: "5:90", 145: "6:132",
  532: "55:17", 533: "55:41", 534: "55:68", 565: "68:16",
  568: "69:35", 570: "70:40", 576: "74:18", 584: "79:16",
  586: "81:1", 588: "83:7", 589: "83:35", 590: "85:1",
  592: "87:16", 593: "89:1", 594: "89:24", 595: "91:1",
  596: "92:15", 597: "95:1", 598: "97:1", 599: "98:8",
  600: "100:10",
};

const key = (p: { sura: number; aya: number } | null) => (p ? `${p.sura}:${p.aya}` : null);

describe("page starts per layout", () => {
  afterEach(() => setActivePageLayout("1421"));

  it("defaults to the 1421 layout", () => {
    expect(getActivePageLayout()).toBe("1421");
  });

  it.each(Object.entries(OVERRIDES_1405))("1405 page %s starts at %s", (page, verse) => {
    setActivePageLayout("1405");
    expect(getActivePageLayout()).toBe("1405");
    expect(key(getPageStart(Number(page)))).toBe(verse);
  });

  it("places verses by the active layout", () => {
    expect(estimatePageForVerse(55, 17)).toBe(531);
    setActivePageLayout("1405");
    expect(estimatePageForVerse(55, 17)).toBe(532);
    expect(estimatePageForVerse(55, 41)).toBe(533);
    expect(estimatePageForVerse(92, 14)).toBe(595);
  });

  it("derives surah end pages from the active layout", () => {
    expect(getSurahEndPage(80)).toBe(586);
    expect(getSurahEndPage(96)).toBe(598);
    setActivePageLayout("1405");
    expect(getSurahEndPage(80)).toBe(585);
    expect(getSurahEndPage(96)).toBe(597);
  });

  it("derives the surah of a page from the active layout", () => {
    expect(getSuraForPage(586)).toBe(80);
    setActivePageLayout("1405");
    expect(getSuraForPage(586)).toBe(81);
  });
});

describe("Android Auto 1405 overrides", () => {
  it("matches the Android Auto 1405 overrides entry for entry", () => {
    const kt = fs.readFileSync(
      path.resolve(
        __dirname,
        "../../../../../../android/app/src/main/java/com/rafeeq/quranquiz/auto/RafeeqAudioUrls.kt",
      ),
      "utf8",
    );
    const body = kt.match(/PAGE_STARTS_1405_OVERRIDES: IntArray = intArrayOf\(([^)]*)\)/);
    expect(body).not.toBeNull();
    const nums = body![1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
    expect(nums).toHaveLength(25 * 3);
    const actual: Record<number, string> = {};
    for (let i = 0; i < nums.length; i += 3) {
      actual[nums[i]] = `${nums[i + 1]}:${nums[i + 2]}`;
    }
    expect(actual).toEqual(OVERRIDES_1405);
  });
});
