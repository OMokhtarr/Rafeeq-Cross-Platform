/**
 * The web path, in its own file because the service reads
 * `Capacitor.isNativePlatform()` once at module load — a single file cannot
 * exercise both platforms.
 *
 * Running `npm start` in a desktop browser used to throw
 * `"RafeeqPrayer" plugin is not implemented on web` from every call, because
 * calculation is Kotlin-only (the home-screen widget has no WebView to run
 * JavaScript in). These tests hold the boundary that keeps the browser quiet.
 */

// Built inside the factory: babel-plugin-jest-hoist only lets a mock factory
// reference out-of-scope identifiers that are `mock`-prefixed. Returning the
// same object from every call means the test and the service share instances.
jest.mock("@capacitor/core", () => {
  const plugin = {
    getTimes: jest.fn(),
    setLocation: jest.fn(),
    getConfig: jest.fn(),
    setConfig: jest.fn(),
    getReminders: jest.fn(),
    setReminders: jest.fn(),
    requestNotificationPermission: jest.fn(),
    getVisibleTimes: jest.fn(),
    setVisibleTimes: jest.fn(),
    getWidgetInfo: jest.fn(),
    requestPinWidget: jest.fn(),
    openAppSettings: jest.fn(),
    getPlace: jest.fn(),
    locationServicesEnabled: jest.fn(),
  };
  return {
    registerPlugin: () => plugin,
    Capacitor: { isNativePlatform: () => false },
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
  getPlace: jest.Mock;
  locationServicesEnabled: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("on web, where the native plugin does not exist", () => {
  it("reports no location instead of calling the absent plugin", async () => {
    const day = await service.loadPrayerDay();

    expect(day).toEqual({ hasLocation: false, times: null, next: null });
    expect(plugin.getTimes).not.toHaveBeenCalled();
  });

  it("returns usable defaults from getPrayerConfig rather than throwing", async () => {
    const config = await service.getPrayerConfig();

    // The page renders these in its pickers before any user choice exists, so
    // they must be real values, not undefined.
    expect(config).toEqual({
      method: "egyptian",
      madhab: "shafi",
      hasLocation: false,
    });
    expect(plugin.getConfig).not.toHaveBeenCalled();
  });

  it("makes setPrayerConfig a no-op rather than an unhandled rejection", async () => {
    await expect(
      service.setPrayerConfig({ method: "karachi" }),
    ).resolves.toBeUndefined();
    expect(plugin.setConfig).not.toHaveBeenCalled();
  });

  it("declines to request a location it could not store anywhere", async () => {
    const ok = await service.requestLocation();

    expect(ok).toBe("failed");
    // No browser geolocation prompt for a fix that has nowhere to go.
    expect(Geolocation.checkPermissions).not.toHaveBeenCalled();
    expect(plugin.setLocation).not.toHaveBeenCalled();
  });

  it("returns a disabled reminders default rather than calling the absent plugin", async () => {
    const result = await service.getReminders();

    expect(result).toEqual({
      enabled: false,
      prayers: ["fajr", "dhuhr", "asr", "maghrib", "isha"],
    });
    expect(plugin.getReminders).not.toHaveBeenCalled();
  });

  it("makes setReminders a no-op rather than an unhandled rejection", async () => {
    await expect(
      service.setReminders({ enabled: true }),
    ).resolves.toBeUndefined();
    expect(plugin.setReminders).not.toHaveBeenCalled();
  });

  it("refuses to enable reminders since there is nothing to schedule", async () => {
    const ok = await service.enableReminders();

    expect(ok).toBe(false);
    expect(plugin.setReminders).not.toHaveBeenCalled();
  });

  it("declines to request a notification permission that does not exist off-device", async () => {
    const granted = await service.requestNotificationPermission();

    expect(granted).toBe(false);
    expect(plugin.requestNotificationPermission).not.toHaveBeenCalled();
  });
});

describe("visible times on web", () => {
  it("falls back to the full timetable without calling the plugin", async () => {
    const times = await service.getVisibleTimes();

    expect(times).toEqual(["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"]);
    expect(plugin.getVisibleTimes).not.toHaveBeenCalled();
  });

  it("makes setVisibleTimes a no-op", async () => {
    await expect(service.setVisibleTimes(["fajr"])).resolves.toBeUndefined();
    expect(plugin.setVisibleTimes).not.toHaveBeenCalled();
  });
});

describe("the home-screen widget on web", () => {
  it("reports the widget unsupported, so the page renders no button", async () => {
    // A browser has no home screen to pin to. `supported: false` is what the
    // page keys its button off, so this is the check that keeps a control
    // that cannot work from ever appearing off-device.
    const info = await service.getWidgetInfo();

    expect(info).toEqual({ supported: false, placed: 0 });
    expect(plugin.getWidgetInfo).not.toHaveBeenCalled();
  });

  it("declines to request a pin rather than throwing at the absent bridge", async () => {
    const outcome = await service.requestPinWidget();

    // Not "blocked": nothing refused it, there is simply no home screen. The
    // page never reaches this anyway, since the button is not rendered.
    expect(outcome).toEqual({ requested: false, blocked: false });
    expect(plugin.requestPinWidget).not.toHaveBeenCalled();
  });

  it("makes openAppSettings a no-op rather than an unhandled rejection", async () => {
    expect(await service.openAppSettings()).toBe(false);
    expect(plugin.openAppSettings).not.toHaveBeenCalled();
  });
});

describe("place and location services on web", () => {
  it("has no place name without a plugin to cache one", async () => {
    await expect(service.getPlace()).resolves.toBeNull();
    expect(plugin.getPlace).not.toHaveBeenCalled();
  });

  it("reports location services as off rather than guessing", async () => {
    await expect(service.locationServicesEnabled()).resolves.toBe(false);
    expect(plugin.locationServicesEnabled).not.toHaveBeenCalled();
  });

  it("reports requestLocation as failed, since there is nowhere to store a fix", async () => {
    await expect(service.requestLocation()).resolves.toBe("failed");
    expect(Geolocation.checkPermissions).not.toHaveBeenCalled();
  });
});
