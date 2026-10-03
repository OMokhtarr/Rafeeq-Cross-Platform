// The native plugin is mocked so the service's own conversions and ordering
// are what get tested. See prayer-times.service.test.ts for why the mocks are
// created inside the factory.
jest.mock("@capacitor/core", () => {
  const plugin = {
    getAlarms: jest.fn(),
    saveAlarm: jest.fn(),
    deleteAlarm: jest.fn(),
    setAlarmSettings: jest.fn(),
    previewAlarm: jest.fn(),
    pickAlarmSound: jest.fn(),
    getAlarmHealth: jest.fn(),
    requestFullScreenAlarms: jest.fn(),
    requestNotificationPermission: jest.fn(),
    requestExactAlarm: jest.fn(),
  };
  return {
    registerPlugin: () => plugin,
    Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
  };
});

jest.mock("@capacitor/geolocation", () => ({ Geolocation: {} }));

import { registerPlugin } from "@capacitor/core";
import * as alarms from "../prayer-alarms.service";
import type { PrayerAlarm } from "../prayer-alarms.types";

const plugin = registerPlugin("RafeeqPrayer") as unknown as Record<string, jest.Mock>;

const suhoor: PrayerAlarm = {
  id: "a1",
  prayer: "fajr",
  offsetMinutes: -90,
  label: "Suhoor",
  enabled: true,
  days: [1, 4],
  ramadanOnly: true,
};

const settings = {
  soundUri: null,
  soundName: null,
  snoozeMinutes: 10,
  vibrate: true,
  ramadanShiftDays: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
});

test("alarms are supported on Android", () => {
  expect(alarms.alarmsSupported()).toBe(true);
});

test("loaded alarms carry their next ring as a Date, or null when off", async () => {
  plugin.getAlarms.mockResolvedValue({
    alarms: [
      { ...suhoor, nextAt: "2027-02-08T01:00:00.000Z" },
      { ...suhoor, id: "a2", enabled: false, nextAt: null },
    ],
    settings,
  });

  const loaded = await alarms.loadAlarms();

  expect(loaded.alarms[0].nextAt).toEqual(new Date("2027-02-08T01:00:00.000Z"));
  expect(loaded.alarms[1].nextAt).toBeNull();
  expect(loaded.settings).toEqual(settings);
});

test("saving sends the alarm and returns the stored copy", async () => {
  plugin.saveAlarm.mockResolvedValue({
    alarm: { ...suhoor, label: "Suhoor", nextAt: "2027-02-08T01:00:00.000Z" },
  });

  const saved = await alarms.saveAlarm(suhoor);

  expect(plugin.saveAlarm).toHaveBeenCalledWith(suhoor);
  expect(saved.nextAt).toEqual(new Date("2027-02-08T01:00:00.000Z"));
});

test("a preview with no next ring is null", async () => {
  plugin.previewAlarm.mockResolvedValue({ nextAt: null });
  expect(await alarms.previewAlarm(suhoor)).toBeNull();
});

test("a cancelled sound pick resolves null", async () => {
  plugin.pickAlarmSound.mockResolvedValue({ cancelled: true });
  expect(await alarms.pickAlarmSound("system")).toBeNull();
});

test("a picked sound resolves its uri and name", async () => {
  plugin.pickAlarmSound.mockResolvedValue({ uri: "content://x", name: "Adhan" });
  expect(await alarms.pickAlarmSound("file")).toEqual({ uri: "content://x", name: "Adhan" });
  expect(plugin.pickAlarmSound).toHaveBeenCalledWith({ source: "file" });
});

test("without notification permission no alarm can be prepared", async () => {
  plugin.requestNotificationPermission.mockResolvedValue({ granted: false });

  expect(await alarms.prepareAlarmPermissions()).toBe(false);
  expect(plugin.requestExactAlarm).not.toHaveBeenCalled();
});

test("with notifications allowed, exact alarms are asked for next", async () => {
  plugin.requestNotificationPermission.mockResolvedValue({ granted: true });
  plugin.requestExactAlarm.mockResolvedValue({ granted: false });

  expect(await alarms.prepareAlarmPermissions()).toBe(true);
  expect(plugin.requestExactAlarm).toHaveBeenCalled();
});

test("a new alarm is on, at the prayer time, every day", () => {
  const a = alarms.newAlarm("isha");
  expect(a).toMatchObject({
    prayer: "isha",
    offsetMinutes: 0,
    label: "",
    enabled: true,
    days: [1, 2, 3, 4, 5, 6, 7],
    ramadanOnly: false,
  });
  expect(alarms.newAlarm("isha").id).not.toBe(a.id);
});

test("offsets read as signed hours and minutes", () => {
  expect(alarms.formatOffset(-90, "en")).toBe("−1:30");
  expect(alarms.formatOffset(15, "en")).toBe("+0:15");
  expect(alarms.formatOffset(-90, "ar")).toBe("−١:٣٠");
});
