import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { usePlaybackQueue } from "../usePlaybackQueue";
import * as nativeOut from "../../services/audio/native-audio-output";

jest.mock("../../services/audio/native-audio-output", () => ({
  isNativeOutput: () => true,
  nativePlayVerse: jest.fn(),
  nativeBismillahIntro: jest.fn(),
  nativePause: jest.fn(),
  nativeResume: jest.fn(),
  nativeSeek: jest.fn(),
  nativeSetSpeed: jest.fn(),
  nativeGetState: jest.fn(),
  pushNativeQueue: jest.fn(),
}));
jest.mock("../../services/audio/audio-cache.service", () => ({
  getCachedOrDownload: () => Promise.resolve(""),
  downloadAndCache: () => Promise.resolve(),
  hasCached: () => Promise.resolve(true),
}));
jest.mock("../../services/audio/audio-duration.service", () => ({
  getRangeDurations: () => Promise.resolve({ perVerseSec: [], totalSec: 0 }),
}));
jest.mock("../../services/data/metadata.service", () => ({
  getSurahNameArabic: () => "",
}));
jest.mock("../../services/storage/recitation-history.service", () => ({
  recordRecitationSession: () => {},
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocked = nativeOut as jest.Mocked<typeof nativeOut>;
// A range finished natively: the player is idle at the end and has nothing to resume.
const FINISHED = { nativeDriving: false, coldIndex: -1, positionMs: 0, playing: false, resumable: false };
const PAUSED = { ...FINISHED, resumable: true };
const RANGE = [3, 4, 5, 6].map((aya) => ({ sura: 2, aya }));

type Queue = ReturnType<typeof usePlaybackQueue>;
let queue: Queue;
const Harness = () => {
  queue = usePlaybackQueue({ reciter: "9", repeatRange: 1 });
  return null;
};

let root: Root;
beforeEach(async () => {
  mocked.nativePlayVerse.mockResolvedValue(undefined);
  mocked.pushNativeQueue.mockResolvedValue(undefined);
  root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
  // Play the range up to its 3rd verse, then the WebView freezes (phone locked).
  await act(() => queue.start(RANGE));
  await act(async () => queue.jumpToIndex(2));
  mocked.nativePlayVerse.mockClear();
});
afterEach(() => act(() => root.unmount()));

it("clears the frozen verse when native finished the range while the app was asleep", async () => {
  mocked.nativeGetState.mockResolvedValue(FINISHED);
  await act(() => queue.syncFromNative({ afterStall: true }));
  expect(queue.state.currentVerse).toBeNull();
});

it("keeps the verse when native was only paused while the app was asleep", async () => {
  mocked.nativeGetState.mockResolvedValue(PAUSED);
  await act(() => queue.syncFromNative({ afterStall: true }));
  expect(queue.state.currentVerse).toBe("2:5");
});

it("replays the range from its first verse when resuming a range native already finished", async () => {
  mocked.nativeGetState.mockResolvedValue(FINISHED);
  await act(() => queue.resume());
  expect(mocked.nativeResume).not.toHaveBeenCalled();
  expect(mocked.nativePlayVerse).toHaveBeenCalledWith("9", 2, 3, 0, "");
});

it("resumes in place when native is merely paused", async () => {
  mocked.nativeGetState.mockResolvedValue(PAUSED);
  await act(() => queue.resume());
  expect(mocked.nativeResume).toHaveBeenCalled();
  expect(mocked.nativePlayVerse).not.toHaveBeenCalled();
});
