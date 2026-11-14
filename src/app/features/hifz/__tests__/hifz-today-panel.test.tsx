import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter, Route } from "react-router-dom";
import type { Location } from "history";
import Hifz from "../Hifz";
import { Preferences } from "@capacitor/preferences";
import { idb } from "../../../core/services/storage/idb.service";
import { todayStr } from "../../../core/utils/local-date.util";
import { savePlanStrict, type HifzPlan } from "../hifz.service";

jest.mock("@ionic/react", () => {
  const { createElement } = require("react");
  const Pass = ({ children }: { children?: unknown }) => createElement("div", null, children);
  return { IonPage: Pass, IonContent: Pass, useIonViewDidEnter: () => {}, useIonViewWillEnter: () => {}, useIonViewWillLeave: () => {} };
});
jest.mock("../../../shared/components/bottom-nav/BottomNavBar", () => () => null);
jest.mock("../../onboarding/usePageTour", () => ({ usePageTour: () => {} }));
jest.mock("../../../core/hooks/useFreezeToast", () => ({
  useFreezeToast: () => ({ toastFrozen: () => {}, toastEarned: () => {} }),
}));
jest.mock("../../../core/services/auth/supabase.client", () => ({ getSupabase: () => null }));
jest.mock("@capacitor/preferences", () => ({ Preferences: { get: jest.fn(), set: jest.fn() } }));
jest.mock("../../../core/services/storage/idb.service", () => ({
  idb: { get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock("../../../core/services/data/metadata.service", () => ({
  initMetadata: async () => {},
  getChapters: () => [],
  getSurahNameArabic: () => "",
  getSurahNameEnglish: () => "",
  getSurahStartPage: () => 1,
  getSurahEndPage: () => 2,
  getPageStart: () => null,
  getRubBoundaries: () => [],
  getHizbBoundaries: () => [],
  getRubStartPages: () => [],
  getHizbStartPages: () => [],
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = (id: string, fromPage: number, doneDate?: string) => ({
  id,
  label: id,
  fromPage,
  toPage: fromPage,
  done: doneDate !== undefined,
  ...(doneDate ? { doneDate } : {}),
});

let root: Root;
let host: HTMLDivElement;
let location: Location | undefined;

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));

const renderWithPlan = async (sessions: ReturnType<typeof session>[]) => {
  await savePlanStrict({
    memorized: [],
    goal: { quantity: 1, unit: "pages" },
    createdAt: "2026-10-01T08:00:00.000Z",
    sessions,
  } as unknown as HifzPlan);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={["/hifz"]}>
        <Hifz />
        <Route
          path="*"
          render={({ location: l }) => {
            location = l;
            return null;
          }}
        />
      </MemoryRouter>,
    ),
  );
  await flush();
};

// The modal portals to document.body, so query the whole document.
const panel = () => document.querySelector(".hifz-today-panel");
const openTodayPanel = async () => {
  const chip = document.querySelector<HTMLElement>(".hifz-stat-chip-today");
  await act(async () => chip!.click());
};
const panelCards = () => panel()!.querySelectorAll(".hifz-session");

beforeEach(() => {
  localStorage.clear();
  const store = new Map<string, unknown>();
  (idb.get as jest.Mock).mockImplementation(async (_s: string, id: string) => store.get(id));
  (idb.put as jest.Mock).mockImplementation(async (_s: string, rec: { id: string }) => {
    store.set(rec.id, rec);
  });
  (idb.delete as jest.Mock).mockImplementation(async (_s: string, id: string) => {
    store.delete(id);
  });
  (Preferences.get as jest.Mock).mockResolvedValue({ value: null });
  location = undefined;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Hifz today panel", () => {
  it("lists only the sessions completed today", async () => {
    await renderWithPlan([
      session("s1", 1, "2026-01-01"),
      session("s2", 2, todayStr()),
      session("s3", 3, todayStr()),
      session("s4", 4),
    ]);

    await openTodayPanel();

    expect(panelCards()).toHaveLength(2);
    expect(panel()!.querySelector(".hifz-empty-hint")).toBeNull();
  });

  it("opening a session from the panel closes it and opens the reader at that session", async () => {
    await renderWithPlan([session("s1", 1, "2026-01-01"), session("s2", 7, todayStr()), session("s3", 8)]);

    await openTodayPanel();
    const openBtn = panel()!.querySelector<HTMLButtonElement>(".hifz-session-open-btn");
    await act(async () => openBtn!.click());

    expect(panel()).toBeNull();
    expect(location?.pathname).toBe("/viewer");
    expect(location?.search).toBe("?page=7");
  });

  it("shows an empty hint when nothing is done today", async () => {
    await renderWithPlan([session("s1", 1, "2026-01-01"), session("s2", 2)]);

    await openTodayPanel();

    expect(panelCards()).toHaveLength(0);
    expect(panel()!.querySelector(".hifz-empty-hint")).not.toBeNull();
  });
});
