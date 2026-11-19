import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import StreakReminderRow from "../StreakReminderRow";
import { STRINGS } from "../../../core/i18n/strings";
import { formatClock } from "../../prayer-times/alarmFormat";
import * as prayer from "../../../core/services/prayer/prayer-times.service";

jest.mock("../../../core/services/prayer/prayer-times.service", () => ({
  isNativeReminders: jest.fn(),
  getStreakReminder: jest.fn(),
  setStreakReminder: jest.fn(),
  enableStreakReminder: jest.fn(),
  DEFAULT_STREAK_REMINDER_MINUTE: 1260,
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const h = STRINGS.en.hifz;
const mocked = prayer as jest.Mocked<typeof prayer>;
const clock = (minuteOfDay: number) =>
  formatClock(new Date(2026, 0, 1, Math.floor(minuteOfDay / 60), minuteOfDay % 60), "en");

let root: Root;
let host: HTMLDivElement;

const render = async () => {
  await act(async () => root.render(<StreakReminderRow lang="en" />));
};
const reminderSwitch = () =>
  host.querySelector<HTMLInputElement>(`input[aria-label="${h.streakReminder}"]`) as HTMLInputElement;
const timeInput = () => host.querySelector<HTMLInputElement>('input[type="time"]') as HTMLInputElement;

/** React tracks input values, so set through the native setter and fire `input`. */
const pickTime = async (value: string) => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setter.call(timeInput(), value);
    timeInput().dispatchEvent(new Event("input", { bubbles: true }));
  });
};

beforeEach(() => {
  // react-scripts runs jest with resetMocks: implementations go here, not in the factory.
  mocked.isNativeReminders.mockReturnValue(true);
  mocked.getStreakReminder.mockResolvedValue({ enabled: false, minuteOfDay: 1260 });
  mocked.setStreakReminder.mockResolvedValue();
  mocked.enableStreakReminder.mockResolvedValue(true);

  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Streak reminder row", () => {
  it("renders nothing off-device", async () => {
    mocked.isNativeReminders.mockReturnValue(false);
    await render();
    expect(host.innerHTML).toBe("");
  });

  it("shows the stored state and time", async () => {
    mocked.getStreakReminder.mockResolvedValue({ enabled: true, minuteOfDay: 1260 });
    await render();
    expect(reminderSwitch().checked).toBe(true);
    expect(host.textContent).toContain(clock(1260));
  });

  it("turning on asks permission and keeps the time", async () => {
    await render();
    await act(async () => reminderSwitch().click());
    expect(mocked.enableStreakReminder).toHaveBeenCalledWith(1260);
    expect(reminderSwitch().checked).toBe(true);
  });

  it("denied permission keeps it off and shows the note", async () => {
    mocked.enableStreakReminder.mockResolvedValue(false);
    await render();
    await act(async () => reminderSwitch().click());
    expect(reminderSwitch().checked).toBe(false);
    expect(host.textContent).toContain(STRINGS.en.settings.notificationsDenied);
  });

  it("turning off saves off with the time", async () => {
    mocked.getStreakReminder.mockResolvedValue({ enabled: true, minuteOfDay: 1260 });
    await render();
    await act(async () => reminderSwitch().click());
    expect(mocked.setStreakReminder).toHaveBeenCalledWith({ enabled: false, minuteOfDay: 1260 });
    expect(reminderSwitch().checked).toBe(false);
  });

  it("picking a time saves it", async () => {
    mocked.getStreakReminder.mockResolvedValue({ enabled: true, minuteOfDay: 1260 });
    await render();
    await pickTime("07:45");
    expect(mocked.setStreakReminder).toHaveBeenCalledWith({ enabled: true, minuteOfDay: 465 });
    expect(host.textContent).toContain(clock(465));
  });
});
