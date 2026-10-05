/**
 * Hizb and rub' el-hizb boundaries.
 *
 * Expected verses are the Quran.com /hizbs and /rub_el_hizbs verse mappings
 * (Madani mushaf). Each quarter of a hizb must have its own range — the old
 * API-backed lookup collapsed every rub to its whole hizb.
 */

import {
  getHizbStart,
  getHizbEnd,
  getRubStart,
  getRubEnd,
  getRubStartPages,
  getHizbStartPages,
} from "../metadata.service";

jest.mock("../../storage/idb.service", () => ({ idb: {} }));
jest.mock("../../api/quran-data-provider", () => ({}));

const v = (sura: number, aya: number) => ({ sura, aya });

describe("rub' el-hizb boundaries", () => {
  it("gives each quarter of a hizb its own range", () => {
    expect([getRubStart(1), getRubEnd(1)]).toEqual([v(1, 1), v(2, 25)]);
    expect([getRubStart(2), getRubEnd(2)]).toEqual([v(2, 26), v(2, 43)]);
    expect([getRubStart(3), getRubEnd(3)]).toEqual([v(2, 44), v(2, 59)]);
    expect([getRubStart(4), getRubEnd(4)]).toEqual([v(2, 60), v(2, 74)]);
  });

  it("ends on the last verse of the previous surah when the next rub opens a surah", () => {
    // Rub 30 is 3:186 … 3:200; rub 31 opens An-Nisa.
    expect(getRubEnd(30)).toEqual(v(3, 200));
    expect(getRubStart(31)).toEqual(v(4, 1));
  });

  it("uses the Madani mark for rub 106", () => {
    expect(getRubStart(106)).toEqual(v(15, 49));
    expect(getRubEnd(105)).toEqual(v(15, 48));
  });

  it("ends the last rub at the end of the Quran", () => {
    expect(getRubStart(240)).toEqual(v(100, 9));
    expect(getRubEnd(240)).toEqual(v(114, 6));
  });
});

describe("hizb boundaries", () => {
  it("matches the Quran.com hizb verse mappings", () => {
    expect([getHizbStart(1), getHizbEnd(1)]).toEqual([v(1, 1), v(2, 74)]);
    expect([getHizbStart(2), getHizbEnd(2)]).toEqual([v(2, 75), v(2, 141)]);
    expect([getHizbStart(5), getHizbEnd(5)]).toEqual([v(2, 253), v(3, 14)]);
    expect([getHizbStart(60), getHizbEnd(60)]).toEqual([v(87, 1), v(114, 6)]);
  });

  it("splits each juz into two distinct hizbs", () => {
    expect(getHizbStart(2)).not.toEqual(getHizbStart(1));
    expect(getHizbEnd(1)).not.toEqual(getHizbEnd(2));
  });
});

describe("start pages", () => {
  it("lists 240 rub pages and 60 hizb pages in mushaf order", () => {
    const rubPages = getRubStartPages();
    expect(rubPages).toHaveLength(240);
    expect(getHizbStartPages()).toHaveLength(60);
    expect(rubPages[0]).toBe(1);
    rubPages.slice(1).forEach((p, i) => expect(p).toBeGreaterThanOrEqual(rubPages[i]));
  });
});
