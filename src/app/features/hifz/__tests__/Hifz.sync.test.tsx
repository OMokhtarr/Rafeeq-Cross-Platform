import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Hifz from "../Hifz";
import { Preferences } from "@capacitor/preferences";
import { idb } from "../../../core/services/storage/idb.service";
import { installWriteHook } from "../../../core/services/sync/local-changes";
import { pullSince, push } from "../../../core/services/sync/sync-remote";
import { syncNow } from "../../../core/services/sync/sync.service";
import type { SyncRow } from "../../../core/services/sync/types";
import { loadPlanStrict, savePlanStrict, type HifzPlan } from "../hifz.service";

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
jest.mock("../../../core/services/sync/sync-remote", () => ({
  ...jest.requireActual("../../../core/services/sync/sync-remote"),
  pullSince: jest.fn(),
  push: jest.fn(),
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

const session = (id: string, fromPage: number, done: boolean) => ({
  id,
  label: id,
  fromPage,
  toPage: fromPage,
  done,
  ...(done ? { doneDate: "2026-10-20" } : {}),
});
const plan = (s2Done: boolean): HifzPlan =>
  ({
    memorized: [],
    goal: { quantity: 1, unit: "pages" },
    createdAt: "2026-10-01T08:00:00.000Z",
    sessions: [session("s1", 1, false), session("s2", 2, s2Done), session("s3", 3, false)],
  }) as unknown as HifzPlan;

let idbStore: Map<string, unknown>;
let cloud: Map<string, SyncRow>;
let tick: number;
let root: Root;
let host: HTMLDivElement;

const planRow = (value: unknown): SyncRow => ({
  collection: "hifzPlan",
  item_key: "current",
  value,
  edited_at: "2099-01-01T00:00:00.000Z",
  deleted: false,
  server_at: new Date(Date.UTC(2026, 10, 1) + ++tick * 1000).toISOString(),
});

const flush = () => act(() => new Promise<void>((r) => setTimeout(r, 0)));
const render = async () => {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <Hifz />
      </MemoryRouter>,
    ),
  );
  await flush();
};
const applyCloud = async () => {
  await act(async () => {
    await syncNow("u1");
  });
  await flush();
};
const checks = () => Array.from(host.querySelectorAll<HTMLButtonElement>(".hifz-session-check"));
const doneIds = async () => ((await loadPlanStrict()) as HifzPlan).sessions.filter((s) => s.done).map((s) => s.id);

beforeEach(() => {
  installWriteHook();
  localStorage.clear();
  localStorage.setItem("rafiq_lang_v1", "en");
  idbStore = new Map();
  cloud = new Map();
  tick = 0;
  (idb.get as jest.Mock).mockImplementation(async (_s: string, id: string) => idbStore.get(id));
  (idb.put as jest.Mock).mockImplementation(async (_s: string, rec: { id: string }) => {
    idbStore.set(rec.id, rec);
  });
  (idb.delete as jest.Mock).mockImplementation(async (_s: string, id: string) => {
    idbStore.delete(id);
  });
  (Preferences.get as jest.Mock).mockResolvedValue({ value: null });
  (pullSince as jest.Mock).mockImplementation(async (cursor: string | null) => {
    const rows = [...cloud.values()].filter((r) => cursor === null || (r.server_at as string) > cursor);
    return { rows: JSON.parse(JSON.stringify(rows)), cursor: rows.length ? (rows[rows.length - 1].server_at as string) : cursor };
  });
  (push as jest.Mock).mockImplementation(async (rows: SyncRow[]) =>
    rows.map((row) => {
      const stored = { ...row, server_at: new Date(Date.UTC(2026, 10, 1) + ++tick * 1000).toISOString() };
      cloud.set(`${row.collection}/${row.item_key}`, stored);
      return stored;
    }),
  );
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("Hifz while sync applies a plan", () => {
  it("toggling a session after a remote plan arrived keeps the remote session done", async () => {
    await savePlanStrict(plan(false));
    await syncNow("u1");
    await render();

    cloud.set("hifzPlan/current", planRow(plan(true)));
    await applyCloud();
    expect(await doneIds()).toEqual(["s2"]);

    // The first open session on the dashboard is s1 whichever copy is on screen.
    const open = checks().find((b) => !b.classList.contains("checked")) as HTMLButtonElement;
    await act(async () => open.click());
    await flush();

    expect(await doneIds()).toEqual(["s1", "s2"]);
  });

  it("leaves the setup screen when a plan syncs in, so a new plan cannot replace it", async () => {
    await render();
    expect(checks()).toHaveLength(0);

    cloud.set("hifzPlan/current", planRow(plan(true)));
    await applyCloud();

    expect(checks().length).toBeGreaterThan(0);
  });

  it("auto-completing from synced read pages keeps the remote session done, with no tap", async () => {
    await savePlanStrict(plan(false));
    await syncNow("u1");
    await render();

    cloud.set("hifzPlan/current", planRow(plan(true)));
    cloud.set("hifzReading/value", {
      ...planRow({ ranges: [], readPages: [1], sessionIds: [] }),
      collection: "hifzReading",
      item_key: "value",
    });
    await applyCloud();

    expect(await doneIds()).toEqual(["s1", "s2"]);
  });
});

describe("starting a new round", () => {
  it("writes the best record to the platform store sync reads", async () => {
    const finished = plan(true);
    finished.sessions = finished.sessions.map((s) => ({ ...s, done: true, doneDate: "2026-10-20" }));
    await savePlanStrict(finished);
    await render();

    await act(async () => (host.querySelector(".hifz-new-round-btn") as HTMLButtonElement).click());
    await act(async () => (host.querySelector(".hifz-confirm-yes") as HTMLButtonElement).click());
    await flush();

    expect(idbStore.get("best-plan")).toBeDefined();
  });
});
