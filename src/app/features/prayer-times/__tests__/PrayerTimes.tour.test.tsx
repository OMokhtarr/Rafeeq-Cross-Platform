import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import PrayerTimes from "../PrayerTimes";
import { LanguageProvider } from "../../../core/context/LanguageContext";
import { TourProvider } from "../../onboarding/TourProvider";
import { ONBOARDING_COPY } from "../../onboarding/onboardingCopy";
import { ONBOARDING_KEY } from "../../onboarding/onboardingStore";

// The with-location page only exists on a device, so the platform pieces are
// stood in for; the page, its tour wiring and the spotlight are the real ones.
jest.mock("@ionic/react", () => {
  const { createElement } = require("react");
  const Pass = ({ children }: { children?: unknown }) => createElement("div", null, children);
  return {
    IonPage: Pass,
    IonContent: Pass,
    useIonViewWillEnter: () => {},
    useIonViewDidEnter: () => {},
    useIonViewWillLeave: () => {},
  };
});
jest.mock("../../../shared/components/bottom-nav/BottomNavBar", () => () => null);
jest.mock("../ShowTimesSheet", () => () => null);
jest.mock("../PrayerMenuSheet", () => () => null);
jest.mock("../WidgetSettingsSheet", () => () => null);

let mockGranted = false;
jest.mock("../../../core/services/prayer/prayer-times.service", () => {
  const at = (h: number) => new Date(2026, 9, 2, h, 0);
  return {
    loadPrayerDay: async () =>
      mockGranted
        ? {
            hasLocation: true,
            times: { fajr: at(4), sunrise: at(6), dhuhr: at(12), asr: at(15), maghrib: at(18), isha: at(19) },
            next: { name: "isha", at: new Date(Date.now() + 3600_000) },
          }
        : { hasLocation: false, times: null, next: null },
    requestLocation: async () => {
      mockGranted = true;
      return "granted";
    },
    getPrayerConfig: async () => ({ method: "MuslimWorldLeague", madhab: "shafi", hasLocation: mockGranted }),
    setPrayerConfig: async () => {},
    getVisibleTimes: async () => ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"],
    getPlace: async () => "Cairo",
    getWidgetInfo: async () => ({ supported: false, placed: 0 }),
  };
});
jest.mock("../../../core/services/prayer/qibla.service", () => ({
  loadQibla: async () => ({ hasLocation: true, bearing: 135, magneticBearing: 131 }),
  watchHeading: () => () => {},
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const copy = ONBOARDING_COPY.en;
const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const cardTitle = () => document.querySelector(".ob-card-title")?.textContent ?? null;
const primary = () => document.querySelector(".ob-card .ob-btn--primary") as HTMLButtonElement;

let root: Root;
beforeEach(() => {
  mockGranted = false;
  localStorage.clear();
  localStorage.setItem("rafiq_lang_v1", "en");
  Element.prototype.getBoundingClientRect = () =>
    ({ top: 100, left: 20, width: 120, height: 40, right: 140, bottom: 140, x: 20, y: 100, toJSON() {} }) as DOMRect;
  Element.prototype.scrollIntoView = () => {};
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

it("explains the location button, then once a location is granted walks next prayer → Qibla → menu", async () => {
  act(() =>
    root.render(
      <MemoryRouter>
        <LanguageProvider>
          <TourProvider initial={{ welcomeDone: true, seenTours: [], seenReleases: [] }}>
            <PrayerTimes />
          </TourProvider>
        </LanguageProvider>
      </MemoryRouter>,
    ),
  );
  await flush();
  await flush();

  expect(cardTitle()).toBe(copy.tours["prayerTimes.setup"].grant.title);
  act(() => primary().click());
  expect(cardTitle()).toBeNull();

  act(() => (document.querySelector('[data-tour~="prayerTimes.setup.grant"]') as HTMLButtonElement).click());
  await flush();
  await flush();

  const t = copy.tours.prayerTimes;
  expect(cardTitle()).toBe(t.next.title);
  act(() => primary().click());
  expect(cardTitle()).toBe(t.qibla.title);
  act(() => primary().click());
  expect(cardTitle()).toBe(t.menu.title);
  expect(primary().textContent).toBe(copy.controls.done);
  act(() => primary().click());
  expect(cardTitle()).toBeNull();

  const seen = JSON.parse(localStorage.getItem(ONBOARDING_KEY)!).seenTours;
  expect(seen).toEqual(expect.arrayContaining(["prayerTimes.setup", "prayerTimes"]));
});
