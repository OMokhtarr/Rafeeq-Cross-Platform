import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import PlaybackSettings from "../PlaybackSettings";
import { LanguageProvider } from "../../../core/context/LanguageContext";
import { usePlayback } from "../../../core/context/PlaybackContext";

// What opening the real sheet does to the queue. Only the queue, audio cache, network and Quran
// metadata behind it are stood in for.
jest.mock("@ionic/react", () => {
  const { createElement } = require("react");
  const Pass = ({ children }: { children?: unknown }) => createElement("div", null, children);
  return { IonPage: Pass, IonContent: Pass };
});
jest.mock("../../../core/context/PlaybackContext", () => {
  const queue = {
    state: { currentVerse: null as string | null, isLoading: false, isPlaying: false },
    start: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    setReciter: jest.fn(),
    setPlaybackRate: jest.fn(),
    setRepeatVerse: jest.fn(),
    setRepeatRange: jest.fn(),
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

const queue = (usePlayback as unknown as () => {
  state: { currentVerse: string | null; isPlaying: boolean };
  start: jest.Mock;
  resume: jest.Mock;
  pause: jest.Mock;
  setReciter: jest.Mock;
})();

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("rafiq_lang_v1", "en");
  localStorage.setItem("rafiq_settings_v1", JSON.stringify({ reciter: "4" }));
  queue.state.currentVerse = null;
  queue.state.isPlaying = false;
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const renderSheet = () =>
  act(() =>
    root.render(
      <MemoryRouter>
        <LanguageProvider>
          <PlaybackSettings currentPage={2} />
        </LanguageProvider>
      </MemoryRouter>,
    ),
  );

const buttons = () => Array.from(host.querySelectorAll("button")) as HTMLButtonElement[];
const cta = () => buttons().filter((b) => /play audio|resume|pause/i.test(b.textContent ?? "")).pop()!;
/** A tap as the quick-select panel listens for it: pointer down and up in the same place. */
const tapQuick = (label: RegExp) => {
  const b = Array.from(
    host.querySelectorAll('[data-tour~="viewer.playbackSheet.quick"] button'),
  ).find((x) => label.test(x.textContent ?? "")) as HTMLButtonElement;
  act(() => {
    b.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, clientX: 10, clientY: 10 }));
    b.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, clientX: 10, clientY: 10 }));
  });
};

describe("with a session already loaded", () => {
  beforeEach(() => {
    queue.state.currentVerse = "2:144";
  });

  it("plays the range the user just picked instead of resuming the old session", async () => {
    renderSheet();
    tapQuick(/juz/i);
    await act(async () => cta().click());
    expect(queue.start).toHaveBeenCalledTimes(1);
    expect(queue.start.mock.calls[0][0][0]).toEqual({ sura: 1, aya: 1 });
    expect(queue.resume).not.toHaveBeenCalled();
  });

  it("also replaces a session that is playing", async () => {
    queue.state.isPlaying = true;
    renderSheet();
    tapQuick(/juz/i);
    await act(async () => cta().click());
    expect(queue.start).toHaveBeenCalledTimes(1);
    expect(queue.pause).not.toHaveBeenCalled();
  });

  it("still resumes when the user hasn't picked a range", async () => {
    renderSheet();
    await act(async () => cta().click());
    expect(queue.resume).toHaveBeenCalledTimes(1);
    expect(queue.start).not.toHaveBeenCalled();
  });
});

it("leaves the car's reciter playing when the sheet opens during its session", () => {
  queue.state.currentVerse = "2:144";
  queue.state.isPlaying = true;
  renderSheet();
  expect(queue.setReciter).not.toHaveBeenCalled();
});

it("prepares the saved reciter when the sheet opens with nothing playing", () => {
  renderSheet();
  expect(queue.setReciter).toHaveBeenCalledWith("4");
});

it("starts a new queue in the reciter the sheet shows, after the old session ended under it", async () => {
  queue.state.currentVerse = "2:144";
  renderSheet();
  queue.state.currentVerse = null;
  renderSheet();
  const play = Array.from(host.querySelectorAll("button")).find((b) => /play audio/i.test(b.textContent ?? ""));
  await act(async () => play!.click());
  expect(queue.start).toHaveBeenCalledTimes(1);
  expect(queue.setReciter).toHaveBeenCalledWith("4");
  expect(queue.setReciter.mock.invocationCallOrder[0]).toBeLessThan(queue.start.mock.invocationCallOrder[0]);
});
