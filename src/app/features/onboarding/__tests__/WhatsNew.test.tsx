import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { App } from "@capacitor/app";
import { WhatsNew } from "../WhatsNew";
import { LanguageProvider } from "../../../core/context/LanguageContext";
import type { Release } from "../tourCatalog";

// The heading reads the installed app's versionName through @capacitor/app;
// set per test because react-scripts runs jest with resetMocks.
jest.mock("@capacitor/app", () => ({ App: { getInfo: jest.fn() } }));
const getInfo = App.getInfo as jest.Mock;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const releases: Release[] = [
  { features: [{ key: "prayerAlarms", art: "qibla", route: "/prayer-times", tourId: "prayerTimes.alarms" }] },
];

let root: Root;
beforeEach(() => {
  localStorage.clear();
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

async function heading(lang: "ar" | "en") {
  localStorage.setItem("rafiq_lang_v1", lang);
  act(() =>
    root.render(
      <LanguageProvider>
        <WhatsNew releases={releases} onDone={() => {}} onShowMe={() => {}} />
      </LanguageProvider>,
    ),
  );
  await act(() => new Promise<void>((r) => setTimeout(r, 0)));
  return document.querySelector(".ob-deck-eyebrow")?.textContent;
}

it("names the installed version", async () => {
  getInfo.mockResolvedValue({ version: "1.2.0", build: "10" });
  expect(await heading("en")).toBe("What's new in 1.2.0");
});

it("names the installed version in Arabic digits", async () => {
  getInfo.mockResolvedValue({ version: "1.2.0", build: "10" });
  expect(await heading("ar")).toBe("الجديد في الإصدار ١٫٢٫٠");
});

it("falls back to a plain heading where there is no version", async () => {
  getInfo.mockRejectedValue(new Error("not implemented on web"));
  expect(await heading("en")).toBe("What's new");
});
