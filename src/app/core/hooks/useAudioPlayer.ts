/**
 * AUDIO PLAYER HOOK
 *
 * Wraps a single HTMLAudioElement that survives across renders. Used for:
 *  - Per-ayah recitation playback in PageViewer (URL fetched from the API).
 *  - Quiz feedback sounds (correct.mp3 / wrong.mp3) — same hook, local URL.
 *
 * The hook tracks which "key" is currently playing so the caller can show a
 * playing/paused state on the matching button. Only one audio plays at a time.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface AudioPlayer {
  /** Play the given URL, tagged with `key` (e.g. "2:255"). Stops any prior. */
  play: (key: string, url: string) => Promise<void>;
  /** Stop playback and clear the current key. */
  stop: () => void;
  /** True while an audio element is actively playing. */
  isPlaying: boolean;
  /** Identifier of the verse/sound currently playing, if any. */
  playingKey: string | null;
}

export function useAudioPlayer(): AudioPlayer {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);

  // Lazy element — created on first play() so SSR / tests don't choke.
  const ensureEl = (): HTMLAudioElement => {
    if (!audioRef.current) {
      const el = new Audio();
      el.preload = "auto";
      el.addEventListener("ended", () => {
        setIsPlaying(false);
        setPlayingKey(null);
      });
      el.addEventListener("error", () => {
        setIsPlaying(false);
        setPlayingKey(null);
      });
      audioRef.current = el;
    }
    return audioRef.current;
  };

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setIsPlaying(false);
    setPlayingKey(null);
  }, []);

  const play = useCallback(
    async (key: string, url: string): Promise<void> => {
      const el = ensureEl();
      // If the same key is already playing, treat as a toggle and stop.
      if (playingKey === key && isPlaying) {
        stop();
        return;
      }
      try {
        el.pause();
        el.src = url;
        setPlayingKey(key);
        setIsPlaying(true);
        await el.play();
      } catch (err) {
        setIsPlaying(false);
        setPlayingKey(null);
        throw err;
      }
    },
    [isPlaying, playingKey, stop],
  );

  // Cleanup on unmount — release the element so it doesn't keep playing
  // after the host component leaves the DOM (e.g. nav from PageViewer).
  useEffect(() => {
    return () => {
      const el = audioRef.current;
      if (el) {
        el.pause();
        el.src = "";
      }
    };
  }, []);

  return { play, stop, isPlaying, playingKey };
}
