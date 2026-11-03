import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import WorshipTracker from "../WorshipTracker";
import { LanguageProvider } from "../../../core/context/LanguageContext";
import { STRINGS } from "../../../core/i18n/strings";
import { SYNC_APPLIED_EVENT } from "../../../core/services/sync/sync-events";
import { OPTIONAL_SECTIONS } from "../trackerCatalog";

jest.mock("@ionic/react", () => {
  const { createElement } = require("react");
  const Pass = ({ children }: { children?: unknown }) => createElement("div", null, children);
  return { IonPage: Pass, IonContent: Pass, useIonViewWillEnter: () => {} };
});
jest.mock("../../../shared/components/bottom-nav/BottomNavBar", () => () => null);
jest.mock("../../onboarding/usePageTour", () => ({ usePageTour: () => {} }));
jest.mock("../../../core/services/data/metadata.service", () => ({ getSurahStartPage: () => 1 }));
jest.mock("../../../core/services/prayer/prayer-times.service", () => ({
  loadPrayerDay: async () => ({ hasLocation: false, times: null, next: null }),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SETTINGS = "rafeeq.tracker.settings";
const WEIGHTS = "rafeeq.tracker.weights";
const tt = STRINGS.en.tracker;
const [first, second] = OPTIONAL_SECTIONS;

let root: Root;
let host: HTMLDivElement;

const applied = (...collections: string[]) =>
  act(async () => {
    window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { collections } }));
  });
const openSheet = () =>
  act(async () =>
    (host.querySelector(`button[aria-label="${tt.menuSettings}"]`) as HTMLButtonElement).click(),
  );

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem("rafiq_lang_v1", "en");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter>
        <LanguageProvider>
          <WorshipTracker />
        </LanguageProvider>
      </MemoryRouter>,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("WorshipTracker and sync", () => {
  it("a settings toggle on a kept-open page keeps a section sync switched off", async () => {
    localStorage.setItem(SETTINGS, JSON.stringify({ [first]: false }));
    await applied("trackerSettings");

    await openSheet();
    await act(async () =>
      (document.body.querySelector(`input[aria-label="${tt.sections[second]}"]`) as HTMLInputElement).click(),
    );

    const stored = JSON.parse(localStorage.getItem(SETTINGS) as string);
    expect(stored[first]).toBe(false);
    expect(stored[second]).toBe(false);
  });

  it("a weight change on a kept-open page keeps a weight sync applied", async () => {
    const synced = JSON.parse(localStorage.getItem(WEIGHTS) ?? "{}");
    synced[first] = 3;
    localStorage.setItem(WEIGHTS, JSON.stringify(synced));
    await applied("trackerWeights");

    await openSheet();
    await act(async () =>
      (document.body.querySelector(
        `button[aria-label="${tt.settings.more} ${tt.sections[second]}"]`,
      ) as HTMLButtonElement).click(),
    );

    expect(JSON.parse(localStorage.getItem(WEIGHTS) as string)[first]).toBe(3);
  });
});
