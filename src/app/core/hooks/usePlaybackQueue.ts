/**
 * PLAYBACK QUEUE HOOK
 *
 * Sequenced ayah-by-ayah audio playback for the Playback Settings screen.
 *
 * Owns a single shared <audio> element, walks through `queue` (an array of
 * "sura:aya" keys), and honors:
 *   - playbackRate            (mid-track speed change)
 *   - repeatVerse  (1..3 | "loop")
 *   - repeatRange  (1..3 | "loop")
 *
 * Audio URLs are resolved through the audio-cache service so cached blobs
 * play instantly while uncached verses stream from the Foundation API.
 *
 * Media Session metadata is wired so OS play/pause/next/previous work for
 * background playback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getPlayableUrl } from "../services/audio/audio-cache.service";
import { recordRecitationSession } from "../services/storage/recitation-history.service";

export type RepeatMode = number | "loop";

export interface VerseKey {
  sura: number;
  aya: number;
}

export interface PlaybackState {
  /** Index into the current queue (which verse we're on). */
  currentIndex: number;
  /** "sura:aya" of the verse currently playing, if any. */
  currentVerse: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  /** How many times the current verse has played so far (1-based). */
  verseRepeatCount: number;
  /** How many full passes through the queue have completed (0-based). */
  rangePassCount: number;
}

export interface PlaybackControls {
  state: PlaybackState;
  start: (queue: VerseKey[]) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  next: () => void;
  prev: () => void;
  setPlaybackRate: (rate: number) => void;
  setReciter: (reciter: string) => void;
  setRepeatVerse: (mode: RepeatMode) => void;
  setRepeatRange: (mode: RepeatMode) => void;
}

export interface UsePlaybackQueueOptions {
  reciter: string;
  playbackRate?: number;
  repeatVerse?: RepeatMode;
  repeatRange?: RepeatMode;
}

const INITIAL_STATE: PlaybackState = {
  currentIndex: -1,
  currentVerse: null,
  isPlaying: false,
  isLoading: false,
  error: null,
  verseRepeatCount: 0,
  rangePassCount: 0,
};

export function usePlaybackQueue(
  initial: UsePlaybackQueueOptions,
): PlaybackControls {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<VerseKey[]>([]);
  const indexRef = useRef(0);
  // Repeat counters live in refs so callbacks see the latest value without
  // re-binding to React state.
  const verseRepeatCountRef = useRef(0);
  const rangePassCountRef = useRef(0);

  const reciterRef = useRef(initial.reciter);
  const currentVerseKeyRef = useRef<string | null>(null);
  const playbackRateRef = useRef(initial.playbackRate ?? 1);
  const repeatVerseRef = useRef<RepeatMode>(initial.repeatVerse ?? 1);
  const repeatRangeRef = useRef<RepeatMode>(initial.repeatRange ?? 1);

  // Track the current blob: URL so we can revoke it before loading the next.
  const currentBlobUrlRef = useRef<string | null>(null);

  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);

  const ensureEl = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;
    const el = new Audio();
    el.preload = "auto";
    el.playbackRate = playbackRateRef.current;
    audioRef.current = el;
    return el;
  }, []);

  const updateMediaSession = useCallback((verseKey: string) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const [s, a] = verseKey.split(":");
    try {
      // Title is intentionally minimal — surah name is unavailable inside
      // this hook, but the screen overrides this with a richer title when
      // it has the surah list. The "sura:aya" form is a safe fallback.
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `${s}:${a}`,
        artist: "Rafeeq",
      });
    } catch {
      /* MediaMetadata unsupported on some browsers — non-fatal */
    }
  }, []);

  const releaseCurrentBlob = useCallback(() => {
    if (currentBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(currentBlobUrlRef.current);
      } catch {}
      currentBlobUrlRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    const el = audioRef.current;
    if (el && currentVerseKeyRef.current) {
      recordRecitationSession(
        currentVerseKeyRef.current,
        el.currentTime,
        reciterRef.current,
      );
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    releaseCurrentBlob();
    currentVerseKeyRef.current = null;
    queueRef.current = [];
    indexRef.current = 0;
    verseRepeatCountRef.current = 0;
    rangePassCountRef.current = 0;
    setState(INITIAL_STATE);
  }, [releaseCurrentBlob]);

  const playIndex = useCallback(
    async (idx: number) => {
      const queue = queueRef.current;
      if (idx < 0 || idx >= queue.length) {
        stop();
        return;
      }
      const { sura, aya } = queue[idx];
      const verseKey = `${sura}:${aya}`;
      indexRef.current = idx;
      currentVerseKeyRef.current = verseKey;

      setState((s) => ({
        ...s,
        currentIndex: idx,
        currentVerse: verseKey,
        isLoading: true,
        error: null,
        verseRepeatCount: verseRepeatCountRef.current + 1,
        rangePassCount: rangePassCountRef.current,
      }));

      try {
        const { url, cached } = await getPlayableUrl(
          reciterRef.current,
          sura,
          aya,
        );
        // Drop any stale blob from the previous verse before swapping src.
        releaseCurrentBlob();
        if (cached) currentBlobUrlRef.current = url;
        const el = ensureEl();
        el.src = url;
        el.playbackRate = playbackRateRef.current;
        verseRepeatCountRef.current += 1;
        await el.play();
        updateMediaSession(verseKey);
        setState((s) => ({
          ...s,
          isPlaying: true,
          isLoading: false,
          verseRepeatCount: verseRepeatCountRef.current,
        }));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "playback failed";
        setState((s) => ({
          ...s,
          isPlaying: false,
          isLoading: false,
          error: message,
        }));
      }
    },
    [ensureEl, releaseCurrentBlob, stop, updateMediaSession],
  );

  // Decide what to play after the current track ends, applying both repeat
  // modes. Resets verseRepeatCountRef before advancing to a new verse.
  const advance = useCallback(() => {
    const queue = queueRef.current;
    if (queue.length === 0) {
      stop();
      return;
    }
    const repeatVerse = repeatVerseRef.current;
    const verseTarget =
      repeatVerse === "loop"
        ? Number.POSITIVE_INFINITY
        : Math.max(1, repeatVerse);
    if (verseRepeatCountRef.current < verseTarget) {
      // Replay the same verse — counter increments inside playIndex.
      void playIndex(indexRef.current);
      return;
    }
    // Move to next verse in the queue.
    verseRepeatCountRef.current = 0;
    const nextIdx = indexRef.current + 1;
    if (nextIdx < queue.length) {
      void playIndex(nextIdx);
      return;
    }
    // End of the range → apply range-level repeat.
    rangePassCountRef.current += 1;
    const repeatRange = repeatRangeRef.current;
    const rangeTarget =
      repeatRange === "loop"
        ? Number.POSITIVE_INFINITY
        : Math.max(1, repeatRange);
    if (rangePassCountRef.current < rangeTarget) {
      void playIndex(0);
      return;
    }
    stop();
  }, [playIndex, stop]);

  // Wire <audio> events once the element exists. We attach lazily on the
  // first play so SSR / tests don't need a DOM Audio shim.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onEnded = () => advance();
    const onError = () => {
      setState((s) => ({
        ...s,
        isPlaying: false,
        isLoading: false,
        error: "audio error",
      }));
    };
    const onPause = () =>
      setState((s) => (s.isPlaying ? { ...s, isPlaying: false } : s));
    const onPlay = () =>
      setState((s) => (s.isPlaying ? s : { ...s, isPlaying: true }));
    el.addEventListener("ended", onEnded);
    el.addEventListener("error", onError);
    el.addEventListener("pause", onPause);
    el.addEventListener("play", onPlay);
    return () => {
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("error", onError);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("play", onPlay);
    };
    // We want this to re-run when `advance` changes (it captures the latest
    // repeat-mode refs through closure indirection — actually it doesn't,
    // since refs are stable, but the closure does need the freshest fn).
  }, [advance, state.currentVerse]);

  // Media Session action handlers — registered once.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) {
      return;
    }
    const ms = navigator.mediaSession;
    const onPlay = async () => {
      const el = audioRef.current;
      if (el && el.src) await el.play().catch(() => {});
    };
    const onPause = () => {
      const el = audioRef.current;
      if (el) el.pause();
    };
    const onNext = () => {
      // Skip to next verse — bypass per-verse repeat.
      verseRepeatCountRef.current = 0;
      const next = indexRef.current + 1;
      if (next < queueRef.current.length) {
        void playIndex(next);
      } else {
        stop();
      }
    };
    const onPrev = () => {
      verseRepeatCountRef.current = 0;
      const prev = indexRef.current - 1;
      if (prev >= 0) void playIndex(prev);
    };
    try {
      ms.setActionHandler("play", onPlay);
      ms.setActionHandler("pause", onPause);
      ms.setActionHandler("nexttrack", onNext);
      ms.setActionHandler("previoustrack", onPrev);
    } catch {}
    return () => {
      try {
        ms.setActionHandler("play", null);
        ms.setActionHandler("pause", null);
        ms.setActionHandler("nexttrack", null);
        ms.setActionHandler("previoustrack", null);
      } catch {}
    };
  }, [playIndex, stop]);

  // Cleanup on unmount — release blob URL but keep the audio element alive
  // only if it's currently playing? In React this hook is owned by the
  // PlaybackSettings screen; closing that screen should NOT stop playback
  // per the spec. We therefore intentionally do NOT pause on unmount —
  // the `<audio>` element keeps playing detached until the user stops it.
  useEffect(() => {
    return () => {
      // Just revoke the blob URL — the <audio> element keeps a reference
      // internally so the browser will hold the resource alive until ended.
      // Actually we can't safely revoke while playing; revoke when stopped.
    };
  }, []);

  const start = useCallback(
    async (queue: VerseKey[]) => {
      if (queue.length === 0) return;
      // Reset for a fresh range.
      queueRef.current = queue.slice();
      indexRef.current = 0;
      verseRepeatCountRef.current = 0;
      rangePassCountRef.current = 0;
      // Touch the audio element so the lifecycle effect can attach listeners.
      ensureEl();
      await playIndex(0);
    },
    [ensureEl, playIndex],
  );

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (el && currentVerseKeyRef.current) {
      recordRecitationSession(
        currentVerseKeyRef.current,
        el.currentTime,
        reciterRef.current,
      );
    }
    el?.pause();
  }, []);
  const resume = useCallback(async () => {
    const el = audioRef.current;
    if (el && el.src) {
      await el.play().catch(() => {});
    }
  }, []);

  const next = useCallback(() => {
    verseRepeatCountRef.current = 0;
    const target = indexRef.current + 1;
    if (target < queueRef.current.length) {
      void playIndex(target);
    } else {
      stop();
    }
  }, [playIndex, stop]);

  const prev = useCallback(() => {
    verseRepeatCountRef.current = 0;
    const target = indexRef.current - 1;
    if (target >= 0) void playIndex(target);
  }, [playIndex]);

  const setPlaybackRate = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    if (audioRef.current) audioRef.current.playbackRate = rate;
  }, []);

  const setReciter = useCallback((r: string) => {
    reciterRef.current = r;
  }, []);
  const setRepeatVerse = useCallback((m: RepeatMode) => {
    repeatVerseRef.current = m;
  }, []);
  const setRepeatRange = useCallback((m: RepeatMode) => {
    repeatRangeRef.current = m;
  }, []);

  return {
    state,
    start,
    pause,
    resume,
    stop,
    next,
    prev,
    setPlaybackRate,
    setReciter,
    setRepeatVerse,
    setRepeatRange,
  };
}
