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
  /** Current index within the active queue (the selected range). Lets a native stall fallback
   *  continue the persisted RANGE from the exact position and stop/loop at the range end,
   *  instead of playing past it into the rest of the surah. */
  queueIndex?: number;
  /** Queue length (number of verses in the selected range). */
  queueLength?: number;
  /** Whether the range loops at its end ("loop") vs. plays once. True = loop. */
  rangeLoops?: boolean;
  /** Full range passes still to play, including the one in progress. -1 = loop (infinite). Lets
   *  the native stall fallback stop a finite Nx range after exactly N passes while locked. */
  rangeRemainingPasses?: number;
  /** Current playback speed (e.g. 1, 1.25, 1.5). Keeps the car's speed-button label in sync when
   *  the user changes speed IN-APP. Omitted → native keeps its current speed. */
  speed?: number;
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
  // Fired when the car's speed button cycles the playback speed. The new speed is carried in
  // positionMs as (speed × 1000). The JS brain applies it to its rate and persists it.
  | "setSpeed"
  // Fired by the native ExoPlayer when the current track finishes. The JS brain
  // applies repeat/range/page logic and feeds the next verse. `aya` carries the
  // index of the track that ended.
  | "nativeTrackEnded"
  // Fired ~1×/sec by the native ExoPlayer with the per-verse position (positionMs)
  // and duration (durationMs) so the in-app slider ticks live on Android.
  | "nativePosition"
  // Fired when a one-shot native intro (bismillah) finishes.
  | "nativeIntroEnded"
  // Fired when ExoPlayer's actual play/pause state changes (e.g. user paused from the
  // notification), so the in-app play/pause button stays in sync. `surah`: 1=playing,0=paused.
  | "nativePlaying"
  // Sent once to a brand-new brain (the app was closed, then reopened) when native is still
  // holding a session. `verses` is the queue, `aya` the queue index and `positionMs` the in-verse
  // position. Native has already handed control over, so the brain must NOT reload the audio.
  | "adoptNative";

export interface CarActionEvent {
  action: CarActionType;
  reciter?: string;
  surah?: number;
  aya?: number;
  positionMs?: number;
  durationMs?: number;
  /** Native wall-clock time (ms) the event was sent; used to spot events that sat queued while the WebView was frozen. */
  sentAtMs?: number;
  /** adoptNative: the queue as comma-separated "sura:aya" keys, e.g. "2:142,2:143". */
  verses?: string;
  /** adoptNative: whether the native player is playing (false = paused). */
  playing?: boolean;
  /** adoptNative: full range passes left including this one; -1 = loop. */
  rangeRemainingPasses?: number;
  /** adoptNative: whether native is looping the current page. */
  repeatPageActive?: boolean;
  /** adoptNative: the native player's current speed. */
  speed?: number;
  /** adoptNative: false when the queue hasn't reached its first verse, so it must be started. */
  started?: boolean;
  /** adoptNative: native couldn't build this queue's urls; the brain should resolve them. */
  needsUrls?: boolean;
}

export interface DrivingModePlugin {
  /** Signal to native that the JS carAction listener is registered and ready to receive events. */
  jsReady(): Promise<void>;

  /** Acknowledge — synchronously, before any async verse resolution — that the brain received a
   *  'nativeTrackEnded' event and is alive. Native's stall watchdog only self-advances if NO ack
   *  arrives (a truly frozen WebView can't run JS at all, so it never acks); this stops the
   *  watchdog from firing merely because the next verse's download is slow (>timeout), which
   *  otherwise made native take over the persisted queue and jump to a different range. */
  ackTrackEnded(): Promise<{ stale: boolean }>;

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
    /** Surah of the (single-surah) queue, so native can self-advance with page-nav/repeat
     *  intact if the app/brain is closed mid-playback. */
    sura?: number;
    /** Reciter (numeric id or slug) so a native stall fallback keeps the same reciter. */
    reciter?: string;
    /** The queue's verses as comma-separated "sura:aya" keys, in the same order as the non-empty
     *  `urls` (native drops empty ones). A new brain needs them to re-adopt a partial range. */
    verses?: string;
  }): Promise<void>;

  nativePlay(): Promise<void>;
  nativePause(): Promise<void>;
  /** End the session: unlike a pause, nothing is left to resume or to hand to a reopened app. */
  nativeStop(): Promise<void>;
  nativeSeek(options: { positionMs: number }): Promise<void>;
  nativeSetSpeed(options: { speed: number }): Promise<void>;

  /** Read the native player's position so the brain can re-sync after the WebView was frozen
   *  (phone locked) while native kept advancing the range. */
  getNativeState(): Promise<{
    /** True if native (not the brain) is currently the playback driver. */
    nativeDriving: boolean;
    /** Cold-list/queue index native is on (== brain queue index; -1 if not native-driving). */
    coldIndex: number;
    /** Current verse's in-verse position (ms). */
    positionMs: number;
    /** Whether the native player is actually playing (false once a range stopped or paused). */
    playing: boolean;
    /** False when the player has finished (ended/idle) and a play press would stay silent;
     *  true when a track is loaded and merely paused. */
    resumable?: boolean;
  }>;

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
    ackTrackEnded: async () => ({ stale: false }),
    setContentTree: async () => {},
    updatePlaybackState: async () => {},
    loadNativeTrack: async () => {},
    setNativeQueue: async () => {},
    nativePlay: async () => {},
    nativePause: async () => {},
    nativeStop: async () => {},
    nativeSeek: async () => {},
    nativeSetSpeed: async () => {},
    getNativeState: async () => ({
      nativeDriving: false,
      coldIndex: -1,
      positionMs: 0,
      playing: false,
    }),
    playNativeIntro: async () => {},
    addListener: async (_event: string, _handler: () => void) => ({ remove: () => {} }),
    removeAllListeners: async () => {},
  },
});
