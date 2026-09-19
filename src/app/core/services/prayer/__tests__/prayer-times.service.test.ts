// The plugin and the geolocation plugin are native; both are mocked so the
// service's own branching is what gets tested.
//
// The jest.fn()s are created inside the factories (rather than as top-level
// consts referenced from the factories) because babel-plugin-jest-hoist only
// allows a mock factory to reference identifiers prefixed with "mock" — any
// other out-of-scope const is a hoist-time ReferenceError. Returning the same
// `plugin`/`geolocation` object from every call means the service and the
// test hold the exact same mock functions.
jest.mock("@capacitor/core", () => {
  const plugin = {
    getTimes: jest.fn(),
    setLocation: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    getReminders: jest.fn(),
    setReminders: jest.fn(),
    requestNotificationPermission: jest.fn(),
  };
  return {
    registerPlugin: () => plugin,
    // The service reads this once at module load to decide whether the native
    // bridge exists. These tests exercise the native path, so it is true here;
    // the web path is covered in its own file, which mocks it false.
    Capacitor: { isNativePlatform: () => true },
  };
});

jest.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    getCurrentPosition: jest.fn(),
    checkPermissions: jest.fn(),
    requestPermissions: jest.fn(),
  },
}));

import { registerPlugin } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import type { RawPrayerDay } from "../prayer-times.types";
import * as service from "../prayer-times.service";

const plugin = registerPlugin("RafeeqPrayer") as unknown as {
  getTimes: jest.Mock;
  setLocation: jest.Mock;
  getConfig: jest.Mock;
  setConfig: jest.Mock;
  getReminders: jest.Mock;
  setReminders: jest.Mock;
  requestNotificationPermission: jest.Mock;
};
const {
  getTimes,
  setLocation,
  getConfig,
  getReminders,
  setReminders,
  requestNotificationPermission,
} = plugin;

const geolocation = Geolocation as unknown as {
  getCurrentPosition: jest.Mock;
  checkPermissions: jest.Mock;
  requestPermissions: jest.Mock;
};
const { getCurrentPosition, checkPermissions, requestPermissions } = geolocation;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("loadPrayerDay", () => {
  it("reports no location rather than throwing when none is stored", async () => {
    const raw: RawPrayerDay = { hasLocation: false };
    getTimes.mockResolvedValue(raw);

    const day = await service.loadPrayerDay();

    expect(day.hasLocation).toBe(false);
    expect(day.times).toBeNull();
    expect(day.next).toBeNull();
  });

  it("parses the plugin's ISO strings into Dates", async () => {
    const raw: RawPrayerDay = {
      hasLocation: true,
      times: {
        fajr: "2026-09-19T03:15:00.000Z",
        sunrise: "2026-09-19T04:41:00.000Z",
        dhuhr: "2026-09-19T10:50:00.000Z",
        asr: "2026-09-19T14:18:00.000Z",
        maghrib: "2026-09-19T16:57:00.000Z",
        isha: "2026-09-19T18:14:00.000Z",
      },
      next: { name: "asr", at: "2026-09-19T14:18:00.000Z" },
    };
    getTimes.mockResolvedValue(raw);

    const day = await service.loadPrayerDay();

    expect(day.hasLocation).toBe(true);
    expect(day.times!.fajr).toBeInstanceOf(Date);
    expect(day.times!.fajr.toISOString()).toBe("2026-09-19T03:15:00.000Z");
    expect(day.next!.name).toBe("asr");
    expect(day.next!.at).toBeInstanceOf(Date);
  });

  it("tolerates a missing `next` at high latitude during midnight sun", async () => {
    // adhan-java returns no times inside the midnight-sun window, so the
    // plugin omits `next` entirely even though `times` is present.
    const raw: RawPrayerDay = {
      hasLocation: true,
      times: {
        fajr: "2026-06-19T00:15:00.000Z",
        sunrise: "2026-06-19T00:41:00.000Z",
        dhuhr: "2026-06-19T10:50:00.000Z",
        asr: "2026-06-19T14:18:00.000Z",
        maghrib: "2026-06-19T23:57:00.000Z",
        isha: "2026-06-19T23:59:00.000Z",
      },
      // next intentionally absent
    };
    getTimes.mockResolvedValue(raw);

    const day = await service.loadPrayerDay();

    expect(day.hasLocation).toBe(true);
    expect(day.times!.fajr).toBeInstanceOf(Date);
    expect(day.next).toBeNull();
  });

  it("skips an individual missing time entry rather than an Invalid Date", async () => {
    // The same midnight-sun condition that can drop `next` can drop a single
    // key inside `times`; the plugin never sends an Invalid Date sentinel.
    const raw = {
      hasLocation: true,
      times: {
        fajr: "2026-06-19T00:15:00.000Z",
        sunrise: "2026-06-19T00:41:00.000Z",
        dhuhr: "2026-06-19T10:50:00.000Z",
        asr: "2026-06-19T14:18:00.000Z",
        maghrib: "2026-06-19T23:57:00.000Z",
        // isha intentionally absent
      },
      next: { name: "asr", at: "2026-06-19T14:18:00.000Z" },
    } as unknown as RawPrayerDay;
    getTimes.mockResolvedValue(raw);

    const day = await service.loadPrayerDay();

    expect(day.times!.fajr).toBeInstanceOf(Date);
    expect(day.times!.isha).toBeUndefined();
  });
});

describe("requestLocation", () => {
  it("stores the fix and reports success when permission is granted", async () => {
    checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockResolvedValue({
      coords: { latitude: 30.0444, longitude: 31.2357 },
    });

    const ok = await service.requestLocation();

    expect(ok).toBe(true);
    expect(setLocation).toHaveBeenCalledWith({ lat: 30.0444, lng: 31.2357 });
  });

  it("asks for permission when it has not been granted yet", async () => {
    checkPermissions.mockResolvedValue({ location: "prompt", coarseLocation: "prompt" });
    requestPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockResolvedValue({
      coords: { latitude: 30.0444, longitude: 31.2357 },
    });

    const ok = await service.requestLocation();

    expect(requestPermissions).toHaveBeenCalled();
    expect(ok).toBe(true);
  });

  it("reports failure without storing anything when permission is denied", async () => {
    checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });
    requestPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });

    const ok = await service.requestLocation();

    expect(ok).toBe(false);
    expect(setLocation).not.toHaveBeenCalled();
  });

  it("reports failure when the fix itself fails, leaving any stored fix alone", async () => {
    checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockRejectedValue(new Error("position unavailable"));

    const ok = await service.requestLocation();

    expect(ok).toBe(false);
    expect(setLocation).not.toHaveBeenCalled();
  });
});

describe("reminders", () => {
  it("reads the enabled state and prayer list from the plugin", async () => {
    getReminders.mockResolvedValue({
      enabled: true,
      prayers: ["fajr", "maghrib"],
    });

    const result = await service.getReminders();

    expect(result.enabled).toBe(true);
    expect(result.prayers).toEqual(["fajr", "maghrib"]);
  });

  it("refuses to enable reminders without a stored location", async () => {
    getConfig.mockResolvedValue({
      method: "egyptian",
      madhab: "shafi",
      hasLocation: false,
    });
    checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });
    requestPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });

    const ok = await service.enableReminders();

    // Nothing to schedule without coordinates, so it reports failure rather
    // than silently enabling a toggle that can never fire.
    expect(ok).toBe(false);
    expect(setReminders).not.toHaveBeenCalled();
  });

  it("enables reminders directly when a location is already stored", async () => {
    getConfig.mockResolvedValue({
      method: "egyptian",
      madhab: "shafi",
      hasLocation: true,
    });
    requestNotificationPermission.mockResolvedValue({ granted: true });

    const ok = await service.enableReminders();

    expect(ok).toBe(true);
    expect(requestNotificationPermission).toHaveBeenCalled();
    expect(setReminders).toHaveBeenCalledWith({ enabled: true });
  });

  it("returns false and does not call setReminders when the notification permission is refused", async () => {
    getConfig.mockResolvedValue({
      method: "egyptian",
      madhab: "shafi",
      hasLocation: true,
    });
    requestNotificationPermission.mockResolvedValue({ granted: false });

    const ok = await service.enableReminders();

    expect(ok).toBe(false);
    expect(setReminders).not.toHaveBeenCalled();
  });

  it("requests the notification permission only after location succeeds", async () => {
    getConfig.mockResolvedValue({
      method: "egyptian",
      madhab: "shafi",
      hasLocation: false,
    });
    checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockResolvedValue({
      coords: { latitude: 30.0444, longitude: 31.2357 },
    });
    requestNotificationPermission.mockResolvedValue({ granted: true });

    const ok = await service.enableReminders();

    expect(ok).toBe(true);
    expect(setLocation).toHaveBeenCalled();
    expect(requestNotificationPermission).toHaveBeenCalled();
    expect(setReminders).toHaveBeenCalledWith({ enabled: true });
  });
});

describe("requestNotificationPermission", () => {
  it("returns the granted flag from the plugin", async () => {
    requestNotificationPermission.mockResolvedValue({ granted: true });

    const granted = await service.requestNotificationPermission();

    expect(granted).toBe(true);
  });

  it("reports false rather than throwing when the plugin call fails", async () => {
    requestNotificationPermission.mockRejectedValue(new Error("bridge error"));

    const granted = await service.requestNotificationPermission();

    expect(granted).toBe(false);
  });
});
