import { registerPlugin } from "@capacitor/core";

export interface ReciterItem {
  id: string;
  name: string;
}

export interface SurahItem {
  number: number;
  name: string;
  arabicName: string;
}

export interface PageMarker {
  page: number;
  aya: number;
}

export interface DrivingModePlaybackState {
  isPlaying: boolean;
  surahName: string;
  verseKey: string;
  reciterName: string;
  positionMs: number;
  durationMs: number;
  /** Pages within the current surah; each entry is the first aya on that page. */
  pageMarkers?: PageMarker[];
  /** 1-based page number currently playing (used to highlight active page button). */
  currentPage?: number;
  /** Whether repeat-page mode is active (loop current page indefinitely). */
  repeatPageActive?: boolean;
}

export type CarActionType =
  | "play"
  | "pause"
  | "next"
  | "prev"
  | "stop"
  | "selectSurah"
  | "jumpToAya"
  | "replayPage"
  | "seekTo"
  // Fired by the native ExoPlayer when the current track finishes. The JS brain
  // applies repeat/range/page logic and feeds the next verse. `aya` carries the
  // index of the track that ended.
  | "nativeTrackEnded"
  // Fired ~1×/sec by the native ExoPlayer with the per-verse position (positionMs)
  // and duration (durationMs) so the in-app slider ticks live on Android.
  | "nativePosition"
  // Fired when a one-shot native intro (bismillah) finishes.
  | "nativeIntroEnded";

export interface CarActionEvent {
  action: CarActionType;
  reciter?: string;
  surah?: number;
  aya?: number;
  positionMs?: number;
  durationMs?: number;
}

export interface DrivingModePlugin {
  /** Signal to native that the JS carAction listener is registered and ready to receive events. */
  jsReady(): Promise<void>;

  setContentTree(options: {
    reciters: ReciterItem[];
    surahs: SurahItem[];
  }): Promise<void>;

  updatePlaybackState(state: DrivingModePlaybackState): Promise<void>;

  // ── Native ExoPlayer control (Android only) ───────────────────────────────
  // On web/iOS these are no-ops; the JS <audio> element plays instead.

  /** Load a single resolved source (http URL or file:// path) for one verse and play it. */
  loadNativeTrack(options: {
    url: string;
    index: number;
    title?: string;
    autoplay?: boolean;
  }): Promise<void>;

  /** Push the full resolved flat queue so native can persist it for cold-start car playback. */
  setNativeQueue(options: {
    urls: string[];
    startIndex: number;
    title?: string;
    autoplay?: boolean;
  }): Promise<void>;

  nativePlay(): Promise<void>;
  nativePause(): Promise<void>;
  nativeSeek(options: { positionMs: number }): Promise<void>;
  nativeSetSpeed(options: { speed: number }): Promise<void>;

  /** Play a one-shot intro (bismillah); a 'nativeIntroEnded' carAction follows. */
  playNativeIntro(options: { url: string }): Promise<void>;

  addListener(
    event: "carAction",
    handler: (data: CarActionEvent) => void,
  ): Promise<{ remove: () => void }>;

  removeAllListeners(): Promise<void>;
}

export const DrivingMode = registerPlugin<DrivingModePlugin>("RafeeqAuto", {
  // On web/Electron: no-op stub so the app doesn't crash
  web: {
    jsReady: async () => {},
    setContentTree: async () => {},
    updatePlaybackState: async () => {},
    loadNativeTrack: async () => {},
    setNativeQueue: async () => {},
    nativePlay: async () => {},
    nativePause: async () => {},
    nativeSeek: async () => {},
    nativeSetSpeed: async () => {},
    playNativeIntro: async () => {},
    addListener: async (_event: string, _handler: () => void) => ({ remove: () => {} }),
    removeAllListeners: async () => {},
  },
});
