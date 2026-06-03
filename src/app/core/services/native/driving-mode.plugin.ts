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

export type CarActionType = "play" | "pause" | "next" | "prev" | "stop" | "selectSurah" | "jumpToAya" | "replayPage" | "seekTo";

export interface CarActionEvent {
  action: CarActionType;
  reciter?: string;
  surah?: number;
  aya?: number;
  positionMs?: number;
}

export interface DrivingModePlugin {
  setContentTree(options: {
    reciters: ReciterItem[];
    surahs: SurahItem[];
  }): Promise<void>;

  updatePlaybackState(state: DrivingModePlaybackState): Promise<void>;

  addListener(
    event: "carAction",
    handler: (data: CarActionEvent) => void,
  ): Promise<{ remove: () => void }>;

  removeAllListeners(): Promise<void>;
}

export const DrivingMode = registerPlugin<DrivingModePlugin>("RafeeqAuto", {
  // On web/Electron: no-op stub so the app doesn't crash
  web: {
    setContentTree: async () => {},
    updatePlaybackState: async () => {},
    addListener: async (_event: string, _handler: () => void) => ({ remove: () => {} }),
    removeAllListeners: async () => {},
  },
});
