import { useEffect, useRef } from "react";
import type {
  PlaybackControls,
  RepeatMode,
} from "../../core/hooks/usePlaybackQueue";

export interface PlaybackPrefs {
  reciter: string;
  playbackRate: number;
  repeatVerse: RepeatMode;
  repeatRange: RepeatMode;
}

type PrefSetters = Pick<
  PlaybackControls,
  "setReciter" | "setPlaybackRate" | "setRepeatVerse" | "setRepeatRange"
>;

/** Give the queue every saved setting, for a queue the user is about to start from the sheet. */
export function applyPlaybackPrefs(queue: PrefSetters, prefs: PlaybackPrefs): void {
  queue.setReciter(prefs.reciter);
  queue.setPlaybackRate(prefs.playbackRate);
  queue.setRepeatVerse(prefs.repeatVerse);
  queue.setRepeatRange(prefs.repeatRange);
}

/** Apply [value] when it changes, and on mount unless [alreadyInEffect]. */
function useApplyOnChange<T>(value: T, apply: (value: T) => void, alreadyInEffect: boolean): void {
  const applied = useRef<{ value: T } | null>(alreadyInEffect ? { value } : null);
  useEffect(() => {
    if (applied.current?.value === value) return;
    applied.current = { value };
    apply(value);
  }, [value, apply]);
}

/**
 * Keep the queue following the settings shown in the playback sheet. The sheet mounts every time it
 * opens, so a session that is already playing must be left alone at that point: it may have come
 * from the car or a reopened app, with its own reciter, speed and repeat state. Only a setting the
 * user then changes applies to it.
 */
export function useApplyPlaybackPrefs(
  queue: PrefSetters & { state: { currentVerse: string | null } },
  prefs: PlaybackPrefs,
): void {
  const sessionActive = queue.state.currentVerse !== null;
  useApplyOnChange(prefs.reciter, queue.setReciter, sessionActive);
  useApplyOnChange(prefs.playbackRate, queue.setPlaybackRate, sessionActive);
  useApplyOnChange(prefs.repeatVerse, queue.setRepeatVerse, sessionActive);
  useApplyOnChange(prefs.repeatRange, queue.setRepeatRange, sessionActive);
}
