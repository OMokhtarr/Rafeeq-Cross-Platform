import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Settings from "../Settings";
import { LanguageProvider } from "../../../core/context/LanguageContext";
import { STRINGS } from "../../../core/i18n/strings";
import * as prayer from "../../../core/services/prayer/prayer-times.service";

jest.mock("@ionic/react", () => {
  const { createElement } = require("react");
  const Pass = ({ children }: { children?: unknown }) => createElement("div", null, children);
  return { IonPage: Pass, IonContent: Pass, useIonViewDidEnter: () => {}, useIonViewWillEnter: () => {}, useIonViewWillLeave: () => {} };
});
jest.mock("../../../shared/components/bottom-nav/BottomNavBar", () => () => null);
jest.mock("../../onboarding/usePageTour", () => ({ usePageTour: () => {} }));
jest.mock("../../../core/services/sync/content-sync.service", () => ({
  runSync: async () => {},
  getSyncStatus: async () => null,
}));
jest.mock("../../../core/services/prayer/prayer-times.service", () => ({
  enableAzkarReminders: jest.fn(),
  enableFastingReminders: jest.fn(),
  enableReminders: jest.fn(),
  enableStreakReminder: jest.fn(),
  getStreakReminder: jest.fn(),
  isNativeReminders: jest.fn(),
  setStreakReminder: jest.fn(),
  DEFAULT_STREAK_REMINDER_MINUTE: 1260,
  getAzkarReminders: jest.fn(),
  getFastingReminders: jest.fn(),
  getReminderHealth: jest.fn(),
  getReminders: jest.fn(),
  openAppSettings: jest.fn(),
  requestExactAlarms: jest.fn(),
  setAzkarReminders: jest.fn(),
  setFastingReminders: jest.fn(),
  setReminders: jest.fn(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ts = STRINGS.en.settings;
const mocked = prayer as jest.Mocked<typeof prayer>;

let root: Root;
let host: HTMLDivElement;

const render = async () => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <LanguageProvider>
          <Settings />
        </LanguageProvider>
      </MemoryRouter>,
    ),
  );
};
const streakSwitch = () =>
  host.querySelector<HTMLInputElement>(`input[aria-label="${ts.streakReminder}"]`) as HTMLInputElement;

beforeEach(() => {
  // react-scripts runs jest with resetMocks: implementations go here, not in the factory.
  mocked.getReminders.mockResolvedValue({ enabled: false, prayers: [] });
  mocked.getAzkarReminders.mockResolvedValue(false);
  mocked.getFastingReminders.mockResolvedValue(false);
  mocked.getReminderHealth.mockResolvedValue({ exactAlarms: true, batteryUnrestricted: true, aggressiveBattery: false });
  mocked.enableFastingReminders.mockResolvedValue(true);
  mocked.setFastingReminders.mockResolvedValue();
  mocked.isNativeReminders.mockReturnValue(true);
  mocked.getStreakReminder.mockResolvedValue({ enabled: false, minuteOfDay: 1260 });
  mocked.enableStreakReminder.mockResolvedValue(true);
  mocked.setStreakReminder.mockResolvedValue();

  localStorage.clear();
  localStorage.setItem("rafiq_lang_v1", "en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Hifz streak reminder in Settings", () => {
  it("shows the streak reminder switch", async () => {
    await render();
    expect(streakSwitch()).not.toBeNull();
  });

  it("turning it on enables with the stored time", async () => {
    await render();
    await act(async () => streakSwitch().click());
    expect(mocked.enableStreakReminder).toHaveBeenCalledWith(1260);
    expect(streakSwitch().checked).toBe(true);
  });

  it("counts toward the exact-alarm warning", async () => {
    mocked.getStreakReminder.mockResolvedValue({ enabled: true, minuteOfDay: 1260 });
    mocked.getReminderHealth.mockResolvedValue({ exactAlarms: false, batteryUnrestricted: true, aggressiveBattery: false });
    await render();
    expect(host.textContent).toContain(ts.exactAlarmsDesc);
  });
});
