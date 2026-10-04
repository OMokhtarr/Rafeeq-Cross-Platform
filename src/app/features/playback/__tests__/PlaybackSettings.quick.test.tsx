import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import PlaybackSettings from "../PlaybackSettings";
import { LanguageProvider } from "../../../core/context/LanguageContext";

// The quick-select panel is under test; the queue, audio cache, network and
// Quran metadata behind the sheet are stood in for. Page 2 holds one surah
// (al-Baqarah), so the panel shows one surah button.
jest.mock("@ionic/react", () => {
  const { createElement } = require("react");
  const Pass = ({ children }: { children?: unknown }) => createElement("div", null, children);
  return { IonPage: Pass, IonContent: Pass };
});
// One stable object, as the real context provides: the sheet's effects depend
// on these functions' identity.
jest.mock("../../../core/context/PlaybackContext", () => {
  const noop = () => {};
  const queue = {
    state: { currentVerse: null, isLoading: false, isPlaying: false },
    start: async () => {},
    pause: noop,
    resume: noop,
    setReciter: noop,
    setPlaybackRate: noop,
    setRepeatVerse: noop,
    setRepeatRange: noop,
  };
  return { usePlayback: () => queue };
});
jest.mock("../../../core/hooks/useOfflineGuard", () => ({
  useOfflineGuard: () => ({ notifyOffline: () => {} }),
}));
jest.mock("../../../core/services/api/network.service", () => ({ isNetworkReachable: async () => true }));
jest.mock("../../../core/services/api/quran-api.client", () => ({ fetchRecitations: async () => [] }));
jest.mock("../../../core/services/audio/audio-cache.service", () => ({
  countCachedAudio: async () => 0,
  clearAllCachedAudio: async () => {},
  downloadAndCache: async () => {},
  getCachedCountsPerSurah: async () => ({}),
}));
jest.mock("../../../core/services/data/metadata.service", () => {
  const v = (sura: number, aya: number) => ({ sura, aya });
  return {
    getPageStart: (p: number) => (p <= 2 ? v(p === 1 ? 1 : 2, 1) : v(2, 6)),
    getChapters: () => [
      { id: 1, verses_count: 7, name_arabic: "الفاتحة", name_simple: "Al-Fatihah" },
      { id: 2, verses_count: 286, name_arabic: "البقرة", name_simple: "Al-Baqarah" },
    ],
    getSurahNameArabic: () => "البقرة",
    getSurahNameEnglish: () => "Al-Baqarah",
    getJuzStart: () => v(1, 1),
    getJuzEnd: () => v(2, 141),
    getHizbStart: () => v(1, 1),
    getHizbEnd: () => v(2, 74),
    getRubStart: () => v(1, 1),
    getRubEnd: () => v(2, 25),
    getRubNumberForPage: () => 1,
    estimatePageForVerse: () => 2,
  };
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("rafiq_lang_v1", "en");
  const host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => act(() => root.unmount()));

const quickButtons = () =>
  Array.from(document.querySelectorAll('[data-tour~="viewer.playbackSheet.quick"] button')) as HTMLButtonElement[];
const highlighted = () => quickButtons().filter((b) => b.classList.contains("is-active")).map((b) => b.textContent);

/** A tap as the panel listens for it: pointer down and up in the same place. */
function tap(label: RegExp) {
  const b = quickButtons().find((x) => label.test(x.textContent ?? ""))!;
  act(() => {
    b.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    b.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 }));
  });
}

function renderSheet() {
  act(() =>
    root.render(
      <MemoryRouter>
        <LanguageProvider>
          <PlaybackSettings currentPage={2} />
        </LanguageProvider>
      </MemoryRouter>,
    ),
  );
}

it("highlights only the surah after choosing a juz and then the surah", () => {
  renderSheet();
  tap(/juz/i);
  tap(/baqarah/i);
  expect(highlighted()).toHaveLength(1);
  expect(highlighted()[0]).toMatch(/baqarah/i);
});

it("highlights only the latest of two quick choices", () => {
  renderSheet();
  tap(/juz/i);
  tap(/hizb/i);
  expect(highlighted()).toHaveLength(1);
  expect(highlighted()[0]).toMatch(/hizb/i);
});
