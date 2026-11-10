import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Settings from "../Settings";
import { LanguageProvider } from "../../../core/context/LanguageContext";
import { STRINGS } from "../../../core/i18n/strings";
import { SYNC_APPLIED_EVENT } from "../../../core/services/sync/sync-events";

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
  enableAzkarReminders: async () => {},
  enableReminders: async () => {},
  getAzkarReminders: async () => false,
  getReminderHealth: async () => null,
  getReminders: async () => ({ enabled: false }),
  openAppSettings: async () => {},
  requestExactAlarms: async () => {},
  setAzkarReminders: async () => {},
  setReminders: async () => {},
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEY = "rafiq_settings_v1";
const ts = STRINGS.en.settings;
/** Longer than the page's save debounce. */
const pastDebounce = () => act(() => new Promise<void>((r) => setTimeout(r, 300)));
const stored = () => JSON.parse(localStorage.getItem(KEY) as string);

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
const toggle = (label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`) as HTMLInputElement;

beforeEach(() => {
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

describe("Settings and sync", () => {
  it("opening the page writes nothing", async () => {
    await render();
    await pastDebounce();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("a real change is saved", async () => {
    await render();
    await act(async () => toggle(ts.azkarVibration).click());
    await pastDebounce();
    expect(stored().azkarVibration).toBe(false);
  });

  it("a toggle on a kept-open page keeps a setting sync applied", async () => {
    await render();
    await pastDebounce();

    localStorage.setItem(KEY, JSON.stringify({ azkarCounterSound: true }));
    await act(async () => {
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { collections: ["settings"] } }));
    });
    await pastDebounce();
    // Showing what sync applied is not itself an edit.
    expect(stored()).toEqual({ azkarCounterSound: true });
    expect(toggle(ts.azkarCounterSound).checked).toBe(true);

    await act(async () => toggle(ts.azkarVibration).click());
    await pastDebounce();

    expect(stored()).toMatchObject({ azkarCounterSound: true, azkarVibration: false });
  });

  it("a toggle not yet saved when sync applies is kept alongside what sync applied", async () => {
    await render();
    await pastDebounce();

    await act(async () => toggle(ts.azkarVibration).click());
    localStorage.setItem(KEY, JSON.stringify({ azkarCounterSound: true }));
    await act(async () => {
      window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { collections: ["settings"] } }));
    });
    await pastDebounce();

    expect(stored()).toMatchObject({ azkarCounterSound: true, azkarVibration: false });
    expect(toggle(ts.azkarVibration).checked).toBe(false);
  });
});
