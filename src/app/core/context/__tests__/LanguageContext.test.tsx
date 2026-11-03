import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { LanguageProvider, useLang } from "../LanguageContext";
import { SYNC_APPLIED_EVENT } from "../../services/sync/sync-events";

jest.mock("../../hooks/useWidgetTheme", () => ({ useWidgetLanguage: jest.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const applied = (...collections: string[]) =>
  act(async () => {
    window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { collections } }));
  });

it("switches language when sync applies the lang collection, and ignores other collections", async () => {
  localStorage.setItem("rafiq_lang_v1", "ar");
  let lang = "";
  const Probe = () => {
    lang = useLang().lang;
    return null;
  };
  const root = createRoot(document.createElement("div"));
  await act(async () =>
    root.render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    ),
  );
  expect(lang).toBe("ar");

  localStorage.setItem("rafiq_lang_v1", "en");
  await applied("theme");
  expect(lang).toBe("ar");
  await applied("lang");
  expect(lang).toBe("en");
  act(() => root.unmount());
});
