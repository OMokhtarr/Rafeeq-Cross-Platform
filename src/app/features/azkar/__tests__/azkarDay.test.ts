jest.mock("@ionic/react", () => ({ useIonViewWillEnter: () => {} }));
jest.mock("../../../core/services/prayer/prayer-times.service", () => ({
  loadPrayerDay: jest.fn(),
}));

import { azkarDayKey } from "../azkarDay";
import type { PrayerDay } from "../../../core/services/prayer/prayer-times.types";

const at = (y: number, m: number, d: number, h: number, min = 0) => new Date(y, m - 1, d, h, min);

const withFajr = (fajr: Date): PrayerDay =>
  ({ hasLocation: true, times: { fajr }, next: null } as unknown as PrayerDay);

describe("azkarDayKey", () => {
  it("is unknown while prayer times are loading", () => {
    expect(azkarDayKey(at(2026, 11, 23, 10), null)).toBeNull();
  });

  it("uses the calendar day without a location", () => {
    const none: PrayerDay = { hasLocation: false, times: null, next: null };
    expect(azkarDayKey(at(2026, 11, 23, 1), none)).toBe("2026-11-23");
  });

  it("still counts as the previous day between midnight and Fajr", () => {
    const fajr = at(2026, 11, 23, 5, 10);
    expect(azkarDayKey(at(2026, 11, 23, 1), withFajr(fajr))).toBe("2026-11-22");
  });

  it("starts a new day at Fajr", () => {
    const fajr = at(2026, 11, 23, 5, 10);
    expect(azkarDayKey(at(2026, 11, 23, 5, 10), withFajr(fajr))).toBe("2026-11-23");
  });

  // Loaded yesterday, still mounted after midnight: guessing the calendar day
  // here would reset the evening's counters before today's Fajr is known.
  it("is unknown when the loaded times belong to an earlier date", () => {
    const yesterdaysFajr = at(2026, 11, 22, 5, 9);
    expect(azkarDayKey(at(2026, 11, 23, 0, 30), withFajr(yesterdaysFajr))).toBeNull();
  });
});
