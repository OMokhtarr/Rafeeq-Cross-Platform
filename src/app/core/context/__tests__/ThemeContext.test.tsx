import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, useTheme } from "../ThemeContext";
import { SYNC_APPLIED_EVENT } from "../../services/sync/sync-events";

jest.mock("../../hooks/useSystemBarsTheme", () => ({ useSystemBarsTheme: jest.fn() }));
jest.mock("../../hooks/useWidgetTheme", () => ({ useWidgetTheme: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const applied = (...collections: string[]) =>
  act(async () => {
    window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { collections } }));
  });

it("switches theme when sync applies the theme collection, and ignores other collections", async () => {
  localStorage.setItem("rafiq_theme_v1", "day");
  let theme = "";
  const Probe = () => {
    theme = useTheme().theme;
    return null;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () =>
    root.render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    ),
  );
  expect(theme).toBe("day");

  localStorage.setItem("rafiq_theme_v1", "night");
  await applied("notes");
  expect(theme).toBe("day");
  await applied("theme");
  expect(theme).toBe("night");
  act(() => root.unmount());
});
