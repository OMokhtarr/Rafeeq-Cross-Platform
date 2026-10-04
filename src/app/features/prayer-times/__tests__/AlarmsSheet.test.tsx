import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import AlarmsSheet from "../AlarmsSheet";
import { LanguageProvider } from "../../../core/context/LanguageContext";
import { STRINGS } from "../../../core/i18n/strings";
import type {
  AlarmPrayer,
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
const tp = STRINGS.en.prayerTimes;
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
  nextAt: new Date(2026, 9, 6, 3, 0),
};

const iftar: PrayerAlarmWithNext = {
  id: "a2",
  prayer: "maghrib",
  offsetMinutes: -5,
  label: "Iftar",
  enabled: true,
  days: [1, 2, 3, 4, 5, 6, 7],
  ramadanOnly: false,
  nextAt: new Date(2026, 9, 5, 17, 55),
};

const at = (h: number) => new Date(2026, 9, 5, h, 0);
const times = { fajr: at(4), dhuhr: at(12), asr: at(15), maghrib: at(18), isha: at(19) };

const healthy = {
  notifications: true,
  exactAlarms: true,
  fullScreen: true,
  batteryUnrestricted: true,
  aggressiveBattery: false,
};

let root: Root;
let onChanged: jest.Mock;

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

async function renderSheet(alarms: PrayerAlarmWithNext[], focusPrayer: AlarmPrayer | null = null) {
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
          focusPrayer={focusPrayer}
          onChanged={onChanged}
        />
      </LanguageProvider>,
    ),
  );
  await flush();
}

const byText = (text: string) =>
  Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const tab = (prayer: AlarmPrayer) => document.querySelector(`[role="tab"][data-prayer="${prayer}"]`) as HTMLButtonElement;
const cards = () => Array.from(document.querySelectorAll("[data-alarm]")).map((c) => c.getAttribute("data-alarm"));

it("shows only the chosen prayer's alarms", async () => {
  await renderSheet([suhoor, iftar], "fajr");
  expect(cards()).toEqual(["a1"]);
  act(() => tab("maghrib").click());
  expect(cards()).toEqual(["a2"]);
  expect(tab("maghrib").getAttribute("aria-selected")).toBe("true");
});

it("opens on the prayer of the next alarm when none is asked for", async () => {
  await renderSheet([suhoor, iftar]);
  expect(tab("maghrib").getAttribute("aria-selected")).toBe("true");
});

it("shows the soonest alarm in the next-alarm card", async () => {
  await renderSheet([suhoor, iftar]);
  const next = document.querySelector(".as-next")!;
  expect(next.textContent).toContain("Iftar");
  expect(next.textContent).not.toContain("Suhoor");
});

it("hides the next-alarm card when nothing is due", async () => {
  await renderSheet([{ ...suhoor, enabled: false, nextAt: null }]);
  expect(document.querySelector(".as-next")).toBeNull();
});

it("counts each prayer's alarms on its tab", async () => {
  await renderSheet([suhoor, iftar]);
  expect(tab("fajr").textContent).toContain("1 alarm");
  expect(tab("asr").textContent).toContain(s.countNone);
});

it("says how far from the adhan an alarm rings", async () => {
  await renderSheet([suhoor], "fajr");
  expect(document.querySelector('[data-alarm="a1"]')!.textContent).toContain("1 h 30 min before the adhan");
});

it("switching an alarm off saves it off without asking for permissions", async () => {
  await renderSheet([suhoor], "fajr");
  const toggle = document.querySelector('[data-alarm="a1"] input[type="checkbox"]') as HTMLInputElement;
  await act(async () => toggle.click());

  expect(mocked.saveAlarm).toHaveBeenCalledWith(expect.objectContaining({ id: "a1", enabled: false }));
  expect(mocked.prepareAlarmPermissions).not.toHaveBeenCalled();
  expect(onChanged).toHaveBeenCalled();
});

it("adds an alarm before Isha with the minutes stepped up", async () => {
  await renderSheet([]);
  act(() => tab("isha").click());
  act(() => byText(s.newTitle.replace("{prayer}", tp.isha)).click());
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
  act(() => byText(s.newTitle.replace("{prayer}", tp.fajr)).click());
  await flush();
  await act(async () => byText(s.save).click());
  await flush();

  expect(mocked.saveAlarm).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain(s.notificationsNeeded);
});

it("deletes an alarm from its editor", async () => {
  await renderSheet([suhoor], "fajr");
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
