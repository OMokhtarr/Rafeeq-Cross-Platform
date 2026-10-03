// Off Android there is nothing to ring alarms with: the service answers
// without touching the bridge, so the page can hide the feature.
jest.mock("@capacitor/core", () => {
  const plugin = { getAlarms: jest.fn(), getAlarmHealth: jest.fn() };
  return {
    registerPlugin: () => plugin,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => "ios" },
  };
});

jest.mock("@capacitor/geolocation", () => ({ Geolocation: {} }));

import { registerPlugin } from "@capacitor/core";
import * as alarms from "../prayer-alarms.service";

const plugin = registerPlugin("RafeeqPrayer") as unknown as Record<string, jest.Mock>;

test("alarms are not supported off Android", () => {
  expect(alarms.alarmsSupported()).toBe(false);
});

test("loading off Android returns no alarms without calling the plugin", async () => {
  const loaded = await alarms.loadAlarms();
  expect(loaded.alarms).toEqual([]);
  expect(plugin.getAlarms).not.toHaveBeenCalled();
});

test("alarm health off Android is unknown", async () => {
  expect(await alarms.getAlarmHealth()).toBeNull();
  expect(plugin.getAlarmHealth).not.toHaveBeenCalled();
});
