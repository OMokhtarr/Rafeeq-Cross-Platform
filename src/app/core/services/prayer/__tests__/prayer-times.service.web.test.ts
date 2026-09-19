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

    expect(ok).toBe(false);
    // No browser geolocation prompt for a fix that has nowhere to go.
    expect(Geolocation.checkPermissions).not.toHaveBeenCalled();
    expect(plugin.setLocation).not.toHaveBeenCalled();
  });
});
