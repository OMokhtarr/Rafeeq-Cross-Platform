import React, { act } from "react";
import { createRoot, Root } from "react-dom/client";
import { Preferences } from "@capacitor/preferences";
import { LanguageProvider, useLang } from "../../../context/LanguageContext";
import { ThemeProvider, useTheme } from "../../../context/ThemeContext";
import { idb } from "../../storage/idb.service";
import { dirtyTime, installWriteHook } from "../local-changes";
import { pullSince, push } from "../sync-remote";
import { syncNow } from "../sync.service";
import type { SyncRow } from "../types";

jest.mock("../sync-remote", () => ({
  ...jest.requireActual("../sync-remote"),
  pullSince: jest.fn(),
  push: jest.fn(),
}));
jest.mock("../../auth/supabase.client", () => ({ getSupabase: () => null }));
jest.mock("@capacitor/preferences", () => ({ Preferences: { get: jest.fn(), set: jest.fn() } }));
jest.mock("../../data/metadata.service", () => ({}));
jest.mock("../../storage/idb.service", () => ({
  idb: { get: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock("../../../hooks/useSystemBarsTheme", () => ({ useSystemBarsTheme: jest.fn() }));
jest.mock("../../../hooks/useWidgetTheme", () => ({ useWidgetTheme: jest.fn(), useWidgetLanguage: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const THEME = "rafiq_theme_v1";
const LANG = "rafiq_lang_v1";
/** The cloud's choice, made months before this install. */
const MONTHS_AGO = "2026-05-01T00:00:00.000Z";

let theme: ReturnType<typeof useTheme>;
let lang: ReturnType<typeof useLang>;
let root: Root;

const Probe = () => {
  theme = useTheme();
  lang = useLang();
  return null;
};
const launch = () =>
  act(async () =>
    root.render(
      <ThemeProvider>
        <LanguageProvider>
          <Probe />
        </LanguageProvider>
      </ThemeProvider>,
    ),
  );
const row = (collection: string, value: string): SyncRow => ({
  collection,
  item_key: "value",
  value,
  edited_at: MONTHS_AGO,
  deleted: false,
  server_at: "2026-05-01T00:00:01.000Z",
});

beforeEach(() => {
  installWriteHook();
  localStorage.clear();
  (idb.get as jest.Mock).mockResolvedValue(undefined);
  (Preferences.get as jest.Mock).mockResolvedValue({ value: null });
  (push as jest.Mock).mockImplementation(async (rows: SyncRow[]) => rows);
  root = createRoot(document.createElement("div"));
});

afterEach(() => act(() => root.unmount()));

describe("first-launch defaults", () => {
  it("writes and stamps nothing on a fresh install", async () => {
    await launch();

    expect(localStorage.getItem(THEME)).toBeNull();
    expect(localStorage.getItem(LANG)).toBeNull();
    expect(dirtyTime("theme")).toBeNull();
    expect(dirtyTime("lang")).toBeNull();
  });

  it("a fresh install takes the cloud's older theme and language and leaves the cloud alone", async () => {
    (pullSince as jest.Mock).mockResolvedValue({
      rows: [row("theme", "day"), row("lang", "en")],
      cursor: MONTHS_AGO,
    });
    await launch();

    await act(async () => {
      await syncNow("u1");
    });

    expect(theme.theme).toBe("day");
    expect(lang.lang).toBe("en");
    const pushed = (push as jest.Mock).mock.calls.flatMap(([rows]) => rows as SyncRow[]);
    expect(pushed.filter((r) => r.collection === "theme" || r.collection === "lang")).toEqual([]);
  });

  it("a real choice is stored, including going back to the default", async () => {
    await launch();

    await act(async () => theme.setTheme("day"));
    expect(localStorage.getItem(THEME)).toBe("day");

    await act(async () => theme.setTheme("night"));
    expect(localStorage.getItem(THEME)).toBe("night");

    await act(async () => lang.setLang("en"));
    expect(localStorage.getItem(LANG)).toBe("en");
  });
});
