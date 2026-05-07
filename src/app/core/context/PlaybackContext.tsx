import React, { createContext, useContext } from "react";
import {
  usePlaybackQueue,
  type PlaybackControls,
  type UsePlaybackQueueOptions,
} from "../hooks/usePlaybackQueue";

const PlaybackContext = createContext<PlaybackControls | null>(null);

const DEFAULT_OPTS: UsePlaybackQueueOptions = {
  reciter: "minshawi-murattal",
  playbackRate: 1,
  repeatVerse: 1,
  repeatRange: "loop",
};

export const PlaybackProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queue = usePlaybackQueue(DEFAULT_OPTS);
  return (
    <PlaybackContext.Provider value={queue}>
      {children}
    </PlaybackContext.Provider>
  );
};

export function usePlayback(): PlaybackControls {
  const ctx = useContext(PlaybackContext);
  if (!ctx) throw new Error("usePlayback must be used inside PlaybackProvider");
  return ctx;
}
