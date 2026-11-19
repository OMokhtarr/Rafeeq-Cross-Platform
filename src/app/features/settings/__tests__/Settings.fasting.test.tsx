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
const fastingSwitch = () =>
  host.querySelector<HTMLInputElement>(`input[aria-label="${ts.fastingReminders}"]`) as HTMLInputElement;

beforeEach(() => {
  // react-scripts runs jest with resetMocks: implementations go here, not in the factory.
  mocked.getReminders.mockResolvedValue({ enabled: false, prayers: [] });
  mocked.getAzkarReminders.mockResolvedValue(false);
  mocked.getFastingReminders.mockResolvedValue(false);
  mocked.getReminderHealth.mockResolvedValue({ exactAlarms: true, batteryUnrestricted: true, aggressiveBattery: false });
  mocked.enableFastingReminders.mockResolvedValue(true);
  mocked.setFastingReminders.mockResolvedValue();

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

describe("Sunnah fasting reminders switch", () => {
  it("shows what native has stored", async () => {
    mocked.getFastingReminders.mockResolvedValue(true);
    await render();
    expect(fastingSwitch().checked).toBe(true);
  });

  it("turning it on enables the reminders", async () => {
    await render();
    await act(async () => fastingSwitch().click());
    expect(mocked.enableFastingReminders).toHaveBeenCalledTimes(1);
    expect(fastingSwitch().checked).toBe(true);
  });

  it("a denied permission leaves it off and says why", async () => {
    mocked.enableFastingReminders.mockResolvedValue(false);
    await render();
    await act(async () => fastingSwitch().click());
    expect(fastingSwitch().checked).toBe(false);
    expect(host.textContent).toContain(ts.notificationsDenied);
  });

  it("turning it off disables the reminders", async () => {
    mocked.getFastingReminders.mockResolvedValue(true);
    await render();
    await act(async () => fastingSwitch().click());
    expect(mocked.setFastingReminders).toHaveBeenCalledWith(false);
    expect(fastingSwitch().checked).toBe(false);
  });
});
