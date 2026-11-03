import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import Account from "../Account";
import { useSync } from "../../../core/context/SyncContext";
import { loadPlanAsync } from "../../hifz/hifz.service";
import { fetchAllNotes } from "../../../core/services/storage/notes.service";
import { parseBackup, readBackupFile, restoreBackup, summarizeBackup } from "../../../core/services/storage/backup.service";
import { STRINGS } from "../../../core/i18n/strings";

jest.mock("../../../core/context/SyncContext", () => ({ useSync: jest.fn() }));
jest.mock("@ionic/react", () => ({
  IonPage: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  IonContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useIonViewWillEnter: () => {},
}));
jest.mock("react-router-dom", () => ({ useHistory: () => ({ push: jest.fn() }) }));
jest.mock("../../../shared/components/bottom-nav/BottomNavBar", () => () => null);
jest.mock("../StreakPanel", () => () => null);
jest.mock("../AccountIdentityRow", () => () => null);
jest.mock("../SubscriptionRow", () => () => null);
jest.mock("../DeleteAccountSheet", () => () => null);
jest.mock("../../onboarding/usePageTour", () => ({ usePageTour: () => {} }));
jest.mock("../../onboarding/tourCatalog", () => ({ tourAttr: () => ({}) }));
jest.mock("../../hifz/hifz.service", () => ({
  loadPlanAsync: jest.fn(),
  settleHifzFreezes: jest.fn(),
}));
jest.mock("../../../core/services/storage/notes.service", () => ({
  fetchAllNotes: jest.fn(),
  deleteNote: jest.fn(),
}));
jest.mock("../../../core/services/storage/backup.service", () => ({
  BackupError: class BackupError extends Error {},
  exportBackupToFile: jest.fn(),
  readBackupFile: jest.fn(),
  parseBackup: jest.fn(),
  restoreBackup: jest.fn(),
  summarizeBackup: jest.fn(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const KEEP_NOTE = STRINGS.ar.account.syncKeepNote;
let host: HTMLDivElement;
let root: Root;

async function openRestoreConfirm(active: boolean) {
  (useSync as jest.Mock).mockReturnValue({ active, status: "off", lastSyncedAt: null, syncNow: jest.fn() });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(<Account />));
  const input = host.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(["{}"], "backup.json", { type: "application/json" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

// resetMocks is on, so every mock gets its behaviour here.
beforeEach(() => {
  (loadPlanAsync as jest.Mock).mockResolvedValue(null);
  (fetchAllNotes as jest.Mock).mockResolvedValue([]);
  (readBackupFile as jest.Mock).mockResolvedValue("{}");
  (parseBackup as jest.Mock).mockReturnValue({});
  (summarizeBackup as jest.Mock).mockReturnValue({
    notes: 1, bookmarks: 0, hifzStreakDays: 0, hasHifzPlan: false,
    trackerDays: 0, azkarFavorites: 0, quizRangeSets: 0, exportedAt: "",
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("tells a synced device that the file adds to its account data", async () => {
  await openRestoreConfirm(true);
  expect(document.body.textContent).toContain(KEEP_NOTE);
});

it("shows no extra line when sync is not active", async () => {
  await openRestoreConfirm(false);
  expect(document.body.textContent).toContain("سيحل محتوى هذا الملف");
  expect(document.body.textContent).not.toContain(KEEP_NOTE);
});

it.each([true, false])("asks the restore to keep local items only while syncing (active: %s)", async (active) => {
  await openRestoreConfirm(active);
  const confirm = document.body.querySelector(".amod-request-submit") as HTMLButtonElement;

  await act(async () => confirm.click());

  expect(restoreBackup).toHaveBeenCalledWith(expect.anything(), { keepLocal: active });
});
