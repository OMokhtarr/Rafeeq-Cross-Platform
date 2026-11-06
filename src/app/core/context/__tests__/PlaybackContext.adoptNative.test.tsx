import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { PlaybackProvider, usePlayback } from "../PlaybackContext";
import { DrivingMode, type CarActionEvent } from "../../services/native/driving-mode.plugin";
import { pushNativeQueue } from "../../services/audio/native-audio-output";
import { getColdStartUri } from "../../services/audio/audio-file-cache.service";

// The app was swiped away while the media service kept playing, then reopened: a brand-new brain
// (real provider + real queue hook) must continue what native is playing. Only the native bridge
// and the file/network layer are faked, so these assert what actually crosses to ExoPlayer.
jest.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => "android" },
  registerPlugin: () => ({}),
}));
jest.mock("@capacitor/app", () => ({
  App: { addListener: () => Promise.resolve({ remove: () => {} }) },
}));
jest.mock("../../services/native/driving-mode.plugin", () => ({
  DrivingMode: {
    addListener: jest.fn(),
    jsReady: jest.fn(),
    ackTrackEnded: jest.fn(),
    setContentTree: jest.fn(),
    updatePlaybackState: jest.fn(),
    loadNativeTrack: jest.fn(),
    setNativeQueue: jest.fn(),
    nativePlay: jest.fn(),
    nativePause: jest.fn(),
    nativeStop: jest.fn(),
    nativeSeek: jest.fn(),
    nativeSetSpeed: jest.fn(),
    getNativeState: jest.fn(),
    playNativeIntro: jest.fn(),
  },
}));
jest.mock("../../services/audio/audio-cache.service", () => ({
  getCachedOrDownload: () => Promise.resolve(""),
  downloadAndCache: () => Promise.resolve(),
  hasCached: () => Promise.resolve(true),
  getNativeAudioUri: (reciter: string, sura: number, aya: number) =>
    Promise.resolve(`file:///${reciter}/${sura}-${aya}.mp3`),
}));
jest.mock("../../services/audio/audio-file-cache.service", () => ({
  getColdStartUri: jest.fn(),
}));
jest.mock("../../services/audio/audio-duration.service", () => ({
  getRangeDurations: () => Promise.resolve({ perVerseSec: [10, 10, 10, 10], totalSec: 40 }),
}));
jest.mock("../../services/storage/recitation-history.service", () => ({
  recordRecitationSession: () => {},
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const bridge = DrivingMode as jest.Mocked<typeof DrivingMode>;
const coldStartUri = getColdStartUri as jest.MockedFunction<typeof getColdStartUri>;

// A page of Al-Baqarah that does NOT start at verse 1: the index native reports is relative to
// this range, so reading it as an index into the whole surah lands on the wrong verse.
const PAGE = "2:142,2:143,2:144,2:145";

let playback: ReturnType<typeof usePlayback>;
const Capture = () => {
  playback = usePlayback();
  return null;
};

let root: Root;
let listeners: Array<(event: CarActionEvent) => void>;
const fireCarAction = (event: CarActionEvent) => listeners.forEach((listener) => listener(event));

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const adopt = async (overrides: Partial<CarActionEvent> = {}) => {
  act(() =>
    fireCarAction({
      action: "adoptNative",
      verses: PAGE,
      aya: 2,
      positionMs: 5000,
      playing: true,
      rangeRemainingPasses: -1,
      ...overrides,
    }),
  );
  await settle();
};

const verseEnded = async () => {
  act(() => fireCarAction({ action: "nativeTrackEnded", sentAtMs: Date.now() }));
  await settle();
};

beforeEach(async () => {
  // CRA's resetMocks wipes jest.fn implementations before every test.
  listeners = [];
  bridge.addListener.mockImplementation(async (_event, handler) => {
    listeners.push(handler);
    return {
      remove: () => {
        listeners = listeners.filter((listener) => listener !== handler);
      },
    };
  });
  bridge.playNativeIntro.mockResolvedValue(undefined);
  bridge.jsReady.mockResolvedValue(undefined);
  bridge.ackTrackEnded.mockResolvedValue({ stale: false });
  bridge.setContentTree.mockResolvedValue(undefined);
  bridge.updatePlaybackState.mockResolvedValue(undefined);
  bridge.loadNativeTrack.mockResolvedValue(undefined);
  bridge.setNativeQueue.mockResolvedValue(undefined);
  bridge.nativePlay.mockResolvedValue(undefined);
  bridge.nativePause.mockResolvedValue(undefined);
  bridge.nativeStop.mockResolvedValue(undefined);
  bridge.nativeSeek.mockResolvedValue(undefined);
  bridge.nativeSetSpeed.mockResolvedValue(undefined);
  bridge.getNativeState.mockResolvedValue({
    nativeDriving: false,
    coldIndex: 2,
    positionMs: 5000,
    playing: true,
    resumable: true,
  });
  coldStartUri.mockImplementation(async (reciter, sura, aya) => `https://cdn/${reciter}/${sura}-${aya}.mp3`);

  root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      <PlaybackProvider>
        <Capture />
      </PlaybackProvider>,
    ),
  );
  await settle();
});

afterEach(() => act(() => root.unmount()));

describe("reopening the app while the media service is playing", () => {
  it("does not overwrite native's session with a new brain's defaults before adopting it", () => {
    // Native reads speed, repeat and range passes when it hands over. A startup push of the
    // defaults would erase them, and flip the notification to paused.
    expect(bridge.updatePlaybackState).not.toHaveBeenCalled();
  });

  it("reports to native once it has adopted the session", async () => {
    await adopt();
    expect(bridge.updatePlaybackState).toHaveBeenLastCalledWith(
      expect.objectContaining({ verseKey: "2:144", isPlaying: true, queueIndex: 2, queueLength: 4 }),
    );
  });

  it("still tells native when playback stops", async () => {
    await adopt({ aya: 3, rangeRemainingPasses: 1 });
    await verseEnded();
    expect(bridge.updatePlaybackState).toHaveBeenLastCalledWith(
      expect.objectContaining({ verseKey: "", isPlaying: false }),
    );
  });

  it("shows the verse native is on, inside the range that was playing", async () => {
    await adopt();
    expect(playback.state.currentVerse).toBe("2:144");
    expect(playback.queue).toEqual([
      { sura: 2, aya: 142 },
      { sura: 2, aya: 143 },
      { sura: 2, aya: 144 },
      { sura: 2, aya: 145 },
    ]);
    expect(playback.state.isPlaying).toBe(true);
  });

  it("does not reload the audio, so the verse carries on uninterrupted", async () => {
    await adopt();
    expect(bridge.loadNativeTrack).not.toHaveBeenCalled();
    expect(bridge.playNativeIntro).not.toHaveBeenCalled();
  });

  it("seeds the range position from the verses before the current one", async () => {
    await adopt();
    // Two 10 s verses precede index 2, and native is 5 s into it.
    expect(playback.state.positionMs).toBe(25000);
    expect(playback.state.durationMs).toBe(40000);
  });

  it("moves on to the next verse of the range when the current one ends", async () => {
    await adopt();
    await verseEnded();
    expect(bridge.loadNativeTrack).toHaveBeenCalledTimes(1);
    expect(bridge.loadNativeTrack).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///minshawi-murattal/2-145.mp3", index: 3 }),
    );
  });

  it("stays paused when native was paused", async () => {
    await adopt({ playing: false });
    expect(playback.state.currentVerse).toBe("2:144");
    expect(playback.state.isPlaying).toBe(false);
    expect(bridge.nativePlay).not.toHaveBeenCalled();
  });

  it("keeps the reciter native is playing for the verses that follow", async () => {
    await adopt({ reciter: "alafasy" });
    await verseEnded();
    expect(bridge.loadNativeTrack).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///7/2-145.mp3" }),
    );
  });

  it("stops at the end of the range when its last pass is the one playing", async () => {
    await adopt({ aya: 3, rangeRemainingPasses: 1 });
    await verseEnded();
    expect(bridge.loadNativeTrack).not.toHaveBeenCalled();
    expect(playback.state.currentVerse).toBeNull();
  });

  it("plays the range again when passes remain after this one", async () => {
    await adopt({ aya: 3, rangeRemainingPasses: 2 });
    await verseEnded();
    expect(bridge.loadNativeTrack).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///minshawi-murattal/2-142.mp3", index: 0 }),
    );
  });

  it("loops the range when native was looping it", async () => {
    await adopt({ aya: 3, rangeRemainingPasses: -1 });
    await verseEnded();
    expect(bridge.loadNativeTrack).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///minshawi-murattal/2-142.mp3", index: 0 }),
    );
  });

  it("keeps native's speed instead of reporting the default back to the notification", async () => {
    await adopt({ speed: 1.5 });
    expect(bridge.updatePlaybackState).toHaveBeenLastCalledWith(
      expect.objectContaining({ speed: 1.5 }),
    );
  });

  it("keeps looping the page when native was repeating it", async () => {
    await adopt({ repeatPageActive: true });
    expect(playback.state.repeatPageActive).toBe(true);
  });

  it("ignores a second adoption once the brain already owns a queue", async () => {
    await adopt();
    await adopt({ verses: "1:1,1:2", aya: 0 });
    expect(playback.state.currentVerse).toBe("2:144");
  });
});

describe("stopping playback", () => {
  it("stops native for good, so a reopened app has nothing to bring back", async () => {
    await act(() => playback.start([{ sura: 2, aya: 142 }]));
    act(() => playback.stop());
    expect(bridge.nativeStop).toHaveBeenCalledTimes(1);
    expect(bridge.nativePause).not.toHaveBeenCalled();
  });

  it("only pauses native on a pause, so it can resume", async () => {
    await act(() => playback.start([{ sura: 2, aya: 142 }]));
    act(() => playback.pause());
    expect(bridge.nativePause).toHaveBeenCalledTimes(1);
    expect(bridge.nativeStop).not.toHaveBeenCalled();
  });
});

describe("the reciter native was playing", () => {
  const saved = () => JSON.parse(localStorage.getItem("rafiq_settings_v1") ?? "{}");

  beforeEach(() => localStorage.removeItem("rafiq_settings_v1"));

  it("becomes the app's saved reciter when adopted, so the playback sheet matches", async () => {
    await adopt({ reciter: "alafasy" });
    expect(saved().reciter).toBe("7");
  });

  it("becomes the app's saved reciter when the car selects a surah", async () => {
    act(() => fireCarAction({ action: "selectSurah", surah: 2, aya: 0, reciter: "sudais" }));
    await settle();
    expect(saved().reciter).toBe("3");
  });

  it("keeps the other saved settings", async () => {
    localStorage.setItem("rafiq_settings_v1", JSON.stringify({ mushaf: "x", reciter: "4" }));
    await adopt({ reciter: "7" });
    expect(saved()).toEqual({ mushaf: "x", reciter: "7" });
  });

  it("is not saved when it isn't a catalog id, which the sheet would reject", async () => {
    await adopt({ reciter: "some-new-slug" });
    expect(saved().reciter).toBeUndefined();
  });

  it("saves native's speed with it", async () => {
    await adopt({ speed: 1.5 });
    expect(saved().playbackRate).toBe(1.5);
  });
});

describe("the reciter named on the notification and car screen", () => {
  const RANGE = [{ sura: 2, aya: 142 }];
  const named = async (reciter: string) => {
    act(() => playback.setReciter(reciter));
    await act(() => playback.start(RANGE));
    await settle();
    return bridge.updatePlaybackState.mock.lastCall?.[0].reciterName;
  };

  it("names the reciter chosen in the app, not the default", async () => {
    expect(await named("7")).toBe("العفاسي — Al-Afasy");
  });

  it.each([
    ["10", "الشريم — Ash-Shuraym"],
    ["11", "الطبلاوي — At-Tablawi"],
    ["12", "الحصري (معلم) — Al-Husary (Muallim)"],
  ])("names catalog reciter %s", async (id, name) => {
    expect(await named(id)).toBe(name);
  });
});

describe("the bismillah ending while the app was frozen", () => {
  const start = async () => {
    void playback.start([
      { sura: 2, aya: 1 },
      { sura: 2, aya: 2 },
    ]);
    await settle();
    bridge.loadNativeTrack.mockClear();
  };

  it("continues from where native took over when it already moved on", async () => {
    await start();
    bridge.ackTrackEnded.mockResolvedValue({ stale: true });
    bridge.getNativeState.mockResolvedValue({
      nativeDriving: true,
      coldIndex: 1,
      positionMs: 4000,
      playing: true,
      resumable: true,
    });
    act(() => fireCarAction({ action: "nativeIntroEnded" }));
    await settle();
    expect(bridge.loadNativeTrack).toHaveBeenCalledTimes(1);
    expect(bridge.loadNativeTrack).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///minshawi-murattal/2-2.mp3", index: 1 }),
    );
    expect(bridge.nativeSeek).toHaveBeenCalledWith({ positionMs: 4000 });
  });

  it("tells native it is alive and plays the first verse when native hasn't moved on", async () => {
    await start();
    act(() => fireCarAction({ action: "nativeIntroEnded" }));
    await settle();
    expect(bridge.ackTrackEnded).toHaveBeenCalled();
    expect(bridge.loadNativeTrack).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///minshawi-murattal/2-1.mp3", index: 0 }),
    );
  });
});

describe("reopening before the queue reached its first verse", () => {
  it("starts a mid-range queue on the verse it was going to play", async () => {
    await adopt({ started: false, aya: 2 });
    expect(bridge.loadNativeTrack).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///minshawi-murattal/2-144.mp3", index: 2 }),
    );
  });

  it("starts a queue from its first verse with the bismillah again", async () => {
    await adopt({ started: false, verses: "2:1,2:2", aya: 0 });
    expect(bridge.playNativeIntro).toHaveBeenCalledTimes(1);
    expect(bridge.loadNativeTrack).not.toHaveBeenCalled();
    act(() => fireCarAction({ action: "nativeIntroEnded" }));
    await settle();
    expect(bridge.loadNativeTrack).toHaveBeenCalledWith(
      expect.objectContaining({ url: "file:///minshawi-murattal/2-1.mp3", index: 0 }),
    );
  });

  it("keeps the range's remaining passes", async () => {
    await adopt({ started: false, aya: 3, rangeRemainingPasses: 1 });
    await verseEnded();
    expect(playback.state.currentVerse).toBeNull();
  });
});

describe("finishing a queue native could only name", () => {
  it("resolves the urls when native has none for the adopted queue", async () => {
    await adopt({ needsUrls: true });
    expect(bridge.setNativeQueue).toHaveBeenCalledTimes(1);
    expect(bridge.setNativeQueue).toHaveBeenCalledWith(
      expect.objectContaining({
        verses: PAGE,
        startIndex: 2,
        urls: [
          "https://cdn/minshawi-murattal/2-142.mp3",
          "https://cdn/minshawi-murattal/2-143.mp3",
          "https://cdn/minshawi-murattal/2-144.mp3",
          "https://cdn/minshawi-murattal/2-145.mp3",
        ],
      }),
    );
  });

  it("makes no url requests when native already has them", async () => {
    await adopt();
    expect(coldStartUri).not.toHaveBeenCalled();
    expect(bridge.setNativeQueue).not.toHaveBeenCalled();
  });
});

describe("telling native about a new queue before anything can go wrong", () => {
  const unresolvable = () => new Promise<string>(() => {});
  const announcement = (verses: string, startIndex: number) =>
    expect.objectContaining({ urls: [], verses, startIndex, sura: 2 });
  const RANGE = [
    { sura: 2, aya: 142 },
    { sura: 2, aya: 143 },
  ];

  it("announces a new queue while its urls are still resolving", async () => {
    coldStartUri.mockImplementation(unresolvable);
    await act(() => playback.start(RANGE));
    expect(bridge.setNativeQueue).toHaveBeenCalledWith(announcement("2:142,2:143", 0));
  });

  it("announces the queue before its first verse loads", async () => {
    await act(() => playback.start(RANGE));
    expect(bridge.setNativeQueue.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.loadNativeTrack.mock.invocationCallOrder[0],
    );
  });

  it("announces the queue before the bismillah plays", async () => {
    void playback.start([{ sura: 2, aya: 1 }]);
    await settle();
    expect(bridge.playNativeIntro).toHaveBeenCalled();
    expect(bridge.setNativeQueue.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.playNativeIntro.mock.invocationCallOrder[0],
    );
    act(() => fireCarAction({ action: "nativeIntroEnded" }));
    await settle();
  });

  it("announces a bookmark resume at the verse it resumes", async () => {
    coldStartUri.mockImplementation(unresolvable);
    await act(() =>
      playback.resumeSession({
        queue: RANGE,
        verseKey: "2:143",
        elapsedSeconds: 0,
        reciter: "7",
      }),
    );
    expect(bridge.setNativeQueue).toHaveBeenCalledWith(announcement("2:142,2:143", 1));
    expect(bridge.setNativeQueue.mock.invocationCallOrder[0]).toBeLessThan(
      bridge.loadNativeTrack.mock.invocationCallOrder[0],
    );
  });

  it("does not let an older queue's slow urls overwrite a newer queue", async () => {
    let finishOlder: (uri: string) => void = () => {};
    coldStartUri.mockImplementationOnce(
      () => new Promise<string>((resolve) => { finishOlder = resolve; }),
    );
    const older = pushNativeQueue("9", [{ sura: 1, aya: 1 }], 0, "");
    await pushNativeQueue("9", [{ sura: 2, aya: 142 }], 0, "");
    finishOlder("https://cdn/older.mp3");
    await older;
    expect(bridge.setNativeQueue).not.toHaveBeenCalledWith(
      expect.objectContaining({ urls: ["https://cdn/older.mp3"] }),
    );
    expect(bridge.setNativeQueue).toHaveBeenLastCalledWith(
      expect.objectContaining({ urls: ["https://cdn/9/2-142.mp3"], verses: "2:142" }),
    );
  });
});

describe("keeping native's persisted queue identical to what plays", () => {
  it("names the verses of a resumed bookmark session", async () => {
    await act(() =>
      playback.resumeSession({
        queue: [
          { sura: 18, aya: 1 },
          { sura: 18, aya: 2 },
        ],
        verseKey: "18:2",
        elapsedSeconds: 0,
        reciter: "7",
      }),
    );
    await settle();
    expect(bridge.setNativeQueue).toHaveBeenCalledWith(
      expect.objectContaining({ verses: "18:1,18:2", startIndex: 1, reciter: "7" }),
    );
  });

  it("leaves unresolved verses out of the names, as native drops their empty URLs", async () => {
    coldStartUri.mockImplementation(async (_reciter, _sura, aya) => {
      if (aya === 143) throw new Error("offline");
      return `https://cdn/${aya}.mp3`;
    });
    await pushNativeQueue(
      "9",
      [
        { sura: 2, aya: 142 },
        { sura: 2, aya: 143 },
        { sura: 2, aya: 144 },
      ],
      0,
      "",
    );
    expect(bridge.setNativeQueue).toHaveBeenCalledWith(
      expect.objectContaining({ verses: "2:142,2:144" }),
    );
  });
});
