import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import AlarmsSheet from "../AlarmsSheet";
import { LanguageProvider } from "../../../core/context/LanguageContext";
import { STRINGS } from "../../../core/i18n/strings";
import type {
  AlarmSettings,
  PrayerAlarmWithNext,
} from "../../../core/services/prayer/prayer-alarms.types";

// The sheet's own behaviour is under test; the native calls behind it are
// stood in for, with formatOffset/newAlarm kept real. Implementations are
// set in beforeEach because react-scripts runs jest with resetMocks.
jest.mock("../../../core/services/prayer/prayer-alarms.service", () => {
  const actual = jest.requireActual("../../../core/services/prayer/prayer-alarms.service");
  return {
    formatOffset: actual.formatOffset,
    newAlarm: actual.newAlarm,
    alarmsSupported: () => true,
    saveAlarm: jest.fn(),
    deleteAlarm: jest.fn(),
    setAlarmSettings: jest.fn(),
    previewAlarm: jest.fn(),
    pickAlarmSound: jest.fn(),
    getAlarmHealth: jest.fn(),
    requestFullScreenAlarms: jest.fn(),
    prepareAlarmPermissions: jest.fn(),
  };
});
jest.mock("../../../core/services/prayer/prayer-times.service", () => ({
  requestExactAlarms: jest.fn(),
  requestNotificationPermission: jest.fn(),
  openAppSettings: jest.fn(),
}));

// The module is mocked above, so these are the jest.fn()s.
import * as service from "../../../core/services/prayer/prayer-alarms.service";
const mocked = service as unknown as Record<string, jest.Mock>;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const s = STRINGS.en.prayerAlarms;
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

const settings: AlarmSettings = {
  soundUri: null,
  soundName: null,
  snoozeMinutes: 10,
  vibrate: true,
  ramadanShiftDays: 0,
};

const suhoor: PrayerAlarmWithNext = {
  id: "a1",
  prayer: "fajr",
  offsetMinutes: -90,
  label: "Suhoor",
  enabled: true,
  days: [1, 2, 3, 4, 5, 6, 7],
  ramadanOnly: true,
  nextAt: null,
};

const at = (h: number) => new Date(2026, 9, 5, h, 0);
const times = { fajr: at(4), dhuhr: at(12), asr: at(15), maghrib: at(18), isha: at(19) };

let root: Root;
let onChanged: jest.Mock;

const healthy = {
  notifications: true,
  exactAlarms: true,
  fullScreen: true,
  batteryUnrestricted: true,
  aggressiveBattery: false,
};

beforeEach(() => {
  mocked.saveAlarm.mockImplementation(async (a) => ({ ...a, nextAt: null }));
  mocked.deleteAlarm.mockResolvedValue(undefined);
  mocked.setAlarmSettings.mockResolvedValue(undefined);
  mocked.previewAlarm.mockResolvedValue(null);
  mocked.pickAlarmSound.mockResolvedValue(null);
  mocked.getAlarmHealth.mockResolvedValue(healthy);
  mocked.requestFullScreenAlarms.mockResolvedValue(true);
  mocked.prepareAlarmPermissions.mockResolvedValue(true);
  localStorage.clear();
  localStorage.setItem("rafiq_lang_v1", "en");
  onChanged = jest.fn();
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

async function renderSheet(alarms: PrayerAlarmWithNext[]) {
  act(() =>
    root.render(
      <LanguageProvider>
        <AlarmsSheet
          open
          onClose={() => {}}
          onBack={() => {}}
          times={times}
          alarms={alarms}
          settings={settings}
          focusPrayer={null}
          onChanged={onChanged}
        />
      </LanguageProvider>,
    ),
  );
  await flush();
}

const byText = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

it("lists each alarm under its prayer", async () => {
  await renderSheet([suhoor]);
  const fajr = document.querySelector('[data-prayer="fajr"]')!;
  expect(fajr.textContent).toContain("Suhoor");
  expect(document.querySelector('[data-prayer="isha"]')!.textContent).not.toContain("Suhoor");
});

it("switching an alarm off saves it off without asking for permissions", async () => {
  await renderSheet([suhoor]);
  const toggle = document.querySelector('[data-alarm="a1"] input[type="checkbox"]') as HTMLInputElement;
  await act(async () => toggle.click());

  expect(mocked.saveAlarm).toHaveBeenCalledWith(expect.objectContaining({ id: "a1", enabled: false }));
  expect(mocked.prepareAlarmPermissions).not.toHaveBeenCalled();
  expect(onChanged).toHaveBeenCalled();
});

it("adds an alarm before Isha with the minutes stepped up", async () => {
  await renderSheet([]);
  const add = document.querySelector('[data-prayer="isha"] .as-add') as HTMLButtonElement;
  act(() => add.click());
  await flush();

  act(() => byText(s.before).click());
  act(() => (document.querySelector('[aria-label="More minutes"][data-step="5"]') as HTMLButtonElement).click());
  act(() => (document.querySelector('[aria-label="More minutes"][data-step="5"]') as HTMLButtonElement).click());
  await act(async () => byText(s.save).click());
  await flush();

  expect(mocked.prepareAlarmPermissions).toHaveBeenCalled();
  expect(mocked.saveAlarm).toHaveBeenCalledWith(
    expect.objectContaining({ prayer: "isha", offsetMinutes: -10, enabled: true }),
  );
});

it("does not save the first alarm when notifications are refused", async () => {
  mocked.prepareAlarmPermissions.mockResolvedValue(false);
  await renderSheet([]);
  act(() => (document.querySelector('[data-prayer="fajr"] .as-add') as HTMLButtonElement).click());
  await flush();
  await act(async () => byText(s.save).click());
  await flush();

  expect(mocked.saveAlarm).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain(s.notificationsNeeded);
});

it("deletes an alarm from its editor", async () => {
  await renderSheet([suhoor]);
  act(() => (document.querySelector('[data-alarm="a1"] .as-alarm-open') as HTMLButtonElement).click());
  await flush();
  await act(async () => byText(s.delete).click());

  expect(mocked.deleteAlarm).toHaveBeenCalledWith("a1");
});

it("shows a warning with a fix when exact alarms are off", async () => {
  mocked.getAlarmHealth.mockResolvedValue({ ...healthy, exactAlarms: false });
  await renderSheet([suhoor]);
  expect(document.body.textContent).toContain(s.warnExact);
});
