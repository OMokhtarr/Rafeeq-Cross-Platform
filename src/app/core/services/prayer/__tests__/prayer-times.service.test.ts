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
    requestExactAlarm: jest.fn().mockResolvedValue({ granted: true }),
    requestNotificationPermission: jest.fn(),
    getVisibleTimes: jest.fn(),
    setVisibleTimes: jest.fn(),
    getWidgetInfo: jest.fn(),
    requestPinWidget: jest.fn(),
    openAppSettings: jest.fn(),
    openHomeScreen: jest.fn(),
    openWidgetSettings: jest.fn(),
    getPlace: jest.fn(),
    locationServicesEnabled: jest.fn(),
    promptEnableLocation: jest.fn(),
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
  getVisibleTimes: jest.Mock;
  setVisibleTimes: jest.Mock;
  getWidgetInfo: jest.Mock;
  requestPinWidget: jest.Mock;
  openAppSettings: jest.Mock;
  openHomeScreen: jest.Mock;
  openWidgetSettings: jest.Mock;
  getPlace: jest.Mock;
  locationServicesEnabled: jest.Mock;
  promptEnableLocation: jest.Mock;
};
const {
  getTimes,
  setLocation,
  getConfig,
  getReminders,
  setReminders,
  requestNotificationPermission,
  getVisibleTimes,
  setVisibleTimes,
  getWidgetInfo,
  requestPinWidget,
  openAppSettings,
  openHomeScreen,
  openWidgetSettings,
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

describe("supplementary times", () => {
  it("carries duha, midnight and last third across the plugin boundary", async () => {
    getTimes.mockResolvedValue({
      hasLocation: true,
      times: {
        fajr: "2026-09-19T03:15:00.000Z",
        sunrise: "2026-09-19T04:41:00.000Z",
        duha: "2026-09-19T05:05:00.000Z",
        dhuhr: "2026-09-19T10:50:00.000Z",
        asr: "2026-09-19T14:18:00.000Z",
        maghrib: "2026-09-19T16:57:00.000Z",
        isha: "2026-09-19T18:14:00.000Z",
        midnight: "2026-09-19T21:03:00.000Z",
        last_third: "2026-09-19T22:46:00.000Z",
      },
      next: { name: "asr", at: "2026-09-19T14:18:00.000Z" },
    });

    const day = await service.loadPrayerDay();

    // Iterating PRAYER_KEYS alone would silently drop these three.
    expect(day.times!.duha).toBeInstanceOf(Date);
    expect(day.times!.midnight).toBeInstanceOf(Date);
    expect(day.times!.last_third).toBeInstanceOf(Date);
    expect(day.times!.duha.toISOString()).toBe("2026-09-19T05:05:00.000Z");
  });

  it("leaves them undefined when the engine reports none", async () => {
    getTimes.mockResolvedValue({
      hasLocation: true,
      times: {
        fajr: "2026-09-19T03:15:00.000Z",
        dhuhr: "2026-09-19T10:50:00.000Z",
      },
      next: { name: "dhuhr", at: "2026-09-19T10:50:00.000Z" },
    });

    const day = await service.loadPrayerDay();

    // Absent, not an Invalid Date — the page skips rows it cannot render.
    expect(day.times!.duha).toBeUndefined();
    expect(day.times!.midnight).toBeUndefined();
    expect(day.times!.fajr).toBeInstanceOf(Date);
  });
});

describe("requestLocation", () => {
  it("stores the fix and reports success when permission is granted", async () => {
    checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockResolvedValue({
      coords: { latitude: 30.0444, longitude: 31.2357 },
    });

    const ok = await service.requestLocation();

    expect(ok).toBe("granted");
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
    expect(ok).toBe("granted");
  });

  it("reports failure without storing anything when permission is denied", async () => {
    checkPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });
    requestPermissions.mockResolvedValue({ location: "denied", coarseLocation: "denied" });

    const ok = await service.requestLocation();

    expect(ok).toBe("denied");
    expect(setLocation).not.toHaveBeenCalled();
  });

  it("reports services-off when the fix fails and location services are off", async () => {
    checkPermissions.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
    getCurrentPosition.mockRejectedValue(new Error("position unavailable"));

    const ok = await service.requestLocation();

    expect(ok).toBe("services-off");
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

describe("visible times", () => {
  it("returns the set the plugin reports", async () => {
    getVisibleTimes.mockResolvedValue({ times: ["fajr", "dhuhr", "duha"] });

    const times = await service.getVisibleTimes();

    expect(times).toEqual(["fajr", "dhuhr", "duha"]);
  });

  it("passes a chosen set straight through to the plugin", async () => {
    await service.setVisibleTimes(["fajr", "dhuhr", "asr", "maghrib", "isha"]);

    expect(setVisibleTimes).toHaveBeenCalledWith({
      times: ["fajr", "dhuhr", "asr", "maghrib", "isha"],
    });
  });
});

describe("the home-screen widget", () => {
  it("reports what the launcher supports and how many are placed", async () => {
    getWidgetInfo.mockResolvedValue({ supported: true, placed: 2 });

    const info = await service.getWidgetInfo();

    expect(info).toEqual({ supported: true, placed: 2 });
  });

  it("treats a bridge failure as unsupported rather than throwing", async () => {
    // The page renders its button off `supported`, so a rejected call must
    // resolve to "no button" — an unhandled rejection here would break the
    // whole page load, which shares one Promise.all with the times.
    getWidgetInfo.mockRejectedValue(new Error("bridge error"));

    const info = await service.getWidgetInfo();

    expect(info).toEqual({ supported: false, placed: 0 });
  });

  it("does not claim blocked while the launcher's dialog is still open", async () => {
    // Regression test: an earlier version compared the placed count across
    // the call and reported "blocked" whenever it had not moved. The pin
    // dialog is asynchronous — the request returns at once and the user
    // answers seconds later — so the count is ALWAYS unchanged at that
    // instant, and every successful pin was warned about. The count must not
    // be consulted here at all.
    getWidgetInfo.mockResolvedValue({ supported: true, placed: 0 });
    requestPinWidget.mockResolvedValue({ requested: true, alreadyPlaced: false });

    expect(await service.requestPinWidget()).toEqual({
      requested: true,
      blocked: false,
      alreadyPlaced: false,
    });
    expect(getWidgetInfo).not.toHaveBeenCalled();
  });

  it("reports blocked only when the system itself refuses", async () => {
    // The one failure actually visible from here.
    getWidgetInfo.mockResolvedValue({ supported: true, placed: 0 });
    requestPinWidget.mockResolvedValue({ requested: false, alreadyPlaced: false });

    expect(await service.requestPinWidget()).toEqual({
      requested: false,
      blocked: true,
      alreadyPlaced: false,
    });
  });

  it("reports blocked rather than throwing when the plugin call fails", async () => {
    getWidgetInfo.mockResolvedValue({ supported: true, placed: 0 });
    requestPinWidget.mockRejectedValue(new Error("bridge error"));

    expect(await service.requestPinWidget()).toEqual({
      requested: false,
      blocked: true,
      alreadyPlaced: false,
    });
  });

  it("opens app settings so a launcher-gated permission can be granted", async () => {
    openAppSettings.mockResolvedValue({ opened: true });

    expect(await service.openAppSettings()).toBe(true);
    expect(openAppSettings).toHaveBeenCalled();
  });

  it("reports false rather than throwing when settings cannot be opened", async () => {
    openAppSettings.mockRejectedValue(new Error("no activity"));

    expect(await service.openAppSettings()).toBe(false);
  });

  it("reports alreadyPlaced without treating it as a failure", async () => {
    // One widget is the limit. The native side refuses a second, and that
    // refusal must not surface as the "your launcher refused" warning — the
    // page takes the user to the existing widget instead.
    requestPinWidget.mockResolvedValue({ requested: false, alreadyPlaced: true });

    expect(await service.requestPinWidget()).toEqual({
      requested: false,
      blocked: false,
      alreadyPlaced: true,
    });
  });

  it("opens the home screen so the placed widget is visible", async () => {
    openHomeScreen.mockResolvedValue({ opened: true });

    expect(await service.openHomeScreen()).toBe(true);
    expect(openHomeScreen).toHaveBeenCalled();
  });

  it("reports false rather than throwing when home cannot be opened", async () => {
    openHomeScreen.mockRejectedValue(new Error("no launcher"));

    expect(await service.openHomeScreen()).toBe(false);
  });

  it("opens the placed widget's appearance settings", async () => {
    openWidgetSettings.mockResolvedValue({ opened: true });

    expect(await service.openWidgetSettings()).toBe(true);
  });

  it("reports false when no widget is placed to configure", async () => {
    openWidgetSettings.mockResolvedValue({ opened: false });

    expect(await service.openWidgetSettings()).toBe(false);
  });
});

describe("requestLocation outcomes", () => {
  it("reports denied when the user refuses the permission", async () => {
    checkPermissions.mockResolvedValue({ location: "prompt" });
    requestPermissions.mockResolvedValue({ location: "denied" });

    await expect(service.requestLocation()).resolves.toBe("denied");
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it("reports services-off when the fix fails and location is switched off", async () => {
    // The distinction that matters: the permission is held, so telling the
    // user to grant it would be a dead end.
    checkPermissions.mockResolvedValue({ location: "granted" });
    getCurrentPosition.mockRejectedValue(new Error("location unavailable"));
    plugin.locationServicesEnabled.mockResolvedValue({ enabled: false });

    await expect(service.requestLocation()).resolves.toBe("services-off");
  });

  it("reports failed when the fix fails but location is on", async () => {
    checkPermissions.mockResolvedValue({ location: "granted" });
    getCurrentPosition.mockRejectedValue(new Error("timeout"));
    plugin.locationServicesEnabled.mockResolvedValue({ enabled: true });

    await expect(service.requestLocation()).resolves.toBe("failed");
  });

  it("reports granted and stores the fix", async () => {
    checkPermissions.mockResolvedValue({ location: "granted" });
    getCurrentPosition.mockResolvedValue({
      coords: { latitude: 30.0444, longitude: 31.2357 },
    });

    await expect(service.requestLocation()).resolves.toBe("granted");
    expect(setLocation).toHaveBeenCalledWith({
      lat: 30.0444,
      lng: 31.2357,
    });
  });
});

describe("getPlace", () => {
  it("returns the cached name", async () => {
    plugin.getPlace.mockResolvedValue({ name: "Cairo" });
    await expect(service.getPlace()).resolves.toBe("Cairo");
  });

  it("returns null when none has resolved, so the page can use its title", async () => {
    plugin.getPlace.mockResolvedValue({ name: null });
    await expect(service.getPlace()).resolves.toBeNull();
  });

  it("returns null rather than propagating a bridge failure", async () => {
    plugin.getPlace.mockRejectedValue(new Error("bridge"));
    await expect(service.getPlace()).resolves.toBeNull();
  });
});
