/**
 * PLAYBACK QUEUE HOOK
 *
 * Sequenced ayah‑by‑ayah audio playback for the Playback Settings screen.
 * Owns a single shared <audio> element, walks through `queue` (an array of
 * "sura:aya" keys), and honors:
 *   - playbackRate
 *   - repeatVerse  (1..3 | "loop")
 *   - repeatRange  (1..3 | "loop")
 *
 * Audio URLs are resolved through the audio‑cache service. Cached blobs
 * play instantly while uncached verses are downloaded on‑the‑fly. When a
 * range is started, all uncached verses in the range are downloaded in the
 * background so subsequent verses play without delay.
 *
 * The `ended` event is manually re‑bound after every `play()` to guarantee
 * automatic advance to the next verse.
 *
 * Sessions are recorded (with the queue) so they can be resumed later.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCachedOrDownload,
  downloadAndCache,
  hasCached,
} from "../services/audio/audio-cache.service";
import { recordRecitationSession } from "../services/storage/recitation-history.service";

export type RepeatMode = number | "loop";

export interface VerseKey {
  sura: number;
  aya: number;
}

export interface PlaybackState {
  currentIndex: number;
  currentVerse: string | null;
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  verseRepeatCount: number;
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
  resumeSession: (session: {
    queue: VerseKey[];
    verseKey: string;
    elapsedSeconds: number;
    reciter: string;
  }) => Promise<void>;
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
  const verseRepeatCountRef = useRef(0);
  const rangePassCountRef = useRef(0);

  const reciterRef = useRef(initial.reciter);
  const currentVerseKeyRef = useRef<string | null>(null);
  const playbackRateRef = useRef(initial.playbackRate ?? 1);
  const repeatVerseRef = useRef<RepeatMode>(initial.repeatVerse ?? 1);
  const repeatRangeRef = useRef<RepeatMode>(initial.repeatRange ?? 1);

  const currentBlobUrlRef = useRef<string | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);

  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);

  // Ref to store the playIndex function to break circular dependency
  const playIndexRef = useRef<(idx: number) => Promise<void>>(async () => {});

  const ensureEl = useCallback((): HTMLAudioElement => {
    if (audioRef.current) return audioRef.current;

    const el = new Audio();
    el.preload = "auto";
    el.playbackRate = playbackRateRef.current;

    // Attach state‑updating listeners — ignore events that fire during
    // verse transitions (isLoading true) to prevent play/pause icon flicker.
    el.addEventListener("pause", () =>
      setState((s) => (s.isPlaying && !s.isLoading ? { ...s, isPlaying: false } : s)),
    );
    el.addEventListener("play", () =>
      setState((s) => (s.isPlaying ? s : { ...s, isPlaying: true })),
    );
    el.addEventListener("error", () =>
      setState((s) => ({
        ...s,
        isPlaying: false,
        isLoading: false,
        error: "audio error",
      })),
    );

    audioRef.current = el;
    return el;
  }, []);

  const updateMediaSession = useCallback((verseKey: string, playing: boolean) => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
    const [s, a] = verseKey.split(":");
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `سورة ${s} — آية ${a}`,
        artist: "رفيق",
        album: "القرآن الكريم",
        artwork: [
          { src: "/images/rafeeq.png", sizes: "512x512", type: "image/png" },
        ],
      });
      navigator.mediaSession.playbackState = playing ? "playing" : "paused";
    } catch {
      /* ignore */
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
    prefetchAbortRef.current?.abort();
    const el = audioRef.current;
    if (el && currentVerseKeyRef.current) {
      recordRecitationSession(
        currentVerseKeyRef.current,
        el.currentTime,
        reciterRef.current,
        queueRef.current.length > 0 ? queueRef.current : undefined,
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
    try {
      if ("mediaSession" in navigator)
        navigator.mediaSession.playbackState = "none";
    } catch {}
    setState(INITIAL_STATE);
  }, [releaseCurrentBlob]);

  // advance logic – defined before playIndex, using the ref
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
      void playIndexRef.current(indexRef.current);
      return;
    }
    verseRepeatCountRef.current = 0;
    const nextIdx = indexRef.current + 1;
    if (nextIdx < queue.length) {
      void playIndexRef.current(nextIdx);
      return;
    }
    rangePassCountRef.current += 1;
    const repeatRange = repeatRangeRef.current;
    const rangeTarget =
      repeatRange === "loop"
        ? Number.POSITIVE_INFINITY
        : Math.max(1, repeatRange);
    if (rangePassCountRef.current < rangeTarget) {
      void playIndexRef.current(0);
      return;
    }
    stop();
  }, [stop]);

  const bindEnded = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const handler = () => advance();
    el.removeEventListener("ended", handler);
    el.addEventListener("ended", handler);
  }, [advance]);

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
        const blobUrl = await getCachedOrDownload(
          reciterRef.current,
          sura,
          aya,
        );
        releaseCurrentBlob();
        currentBlobUrlRef.current = blobUrl;

        const el = ensureEl();
        el.src = blobUrl;
        el.playbackRate = playbackRateRef.current;

        // Wait until ready to play
        await new Promise<void>((resolve, reject) => {
          const onCanPlay = () => {
            el.removeEventListener("canplay", onCanPlay);
            el.removeEventListener("error", onError);
            resolve();
          };
          const onError = () => {
            el.removeEventListener("canplay", onCanPlay);
            el.removeEventListener("error", onError);
            reject(new Error("audio load error"));
          };
          el.addEventListener("canplay", onCanPlay);
          el.addEventListener("error", onError);
          if (el.readyState >= 3) onCanPlay();
        });

        verseRepeatCountRef.current += 1;
        await el.play();

        // Re‑bind ended after every successful play
        bindEnded();

        updateMediaSession(verseKey, true);
        setState((s) => ({
          ...s,
          isPlaying: true,
          isLoading: false,
          verseRepeatCount: verseRepeatCountRef.current,
        }));

        // Prefetch next verse
        const nextIdx = idx + 1;
        if (nextIdx < queue.length) {
          const { sura: ns, aya: na } = queue[nextIdx];
          downloadAndCache(reciterRef.current, ns, na).catch(() => {});
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "playback failed";
        setState((s) => ({
          ...s,
          isPlaying: false,
          isLoading: false,
          error: message,
        }));
      }
    },
    [bindEnded, ensureEl, releaseCurrentBlob, stop, updateMediaSession],
  );

  // Store playIndex in ref for advance
  playIndexRef.current = playIndex;

  // Media Session actions
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator))
      return;
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
      verseRepeatCountRef.current = 0;
      const next = indexRef.current + 1;
      if (next < queueRef.current.length) void playIndexRef.current(next);
      else stop();
    };
    const onPrev = () => {
      verseRepeatCountRef.current = 0;
      const prev = indexRef.current - 1;
      if (prev >= 0) void playIndexRef.current(prev);
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
  }, [stop]);

  // Play bismillah (1:1) as a silent intro — no queue/state changes.
  // Resolves when the audio ends or on any error (non-fatal).
  const playBismillahIntro = useCallback(async (): Promise<void> => {
    try {
      const blobUrl = await getCachedOrDownload(reciterRef.current, 1, 1);
      const el = ensureEl();
      el.src = blobUrl;
      el.playbackRate = playbackRateRef.current;
      await new Promise<void>((resolve) => {
        const done = () => {
          el.removeEventListener("ended", done);
          el.removeEventListener("error", done);
          resolve();
        };
        el.addEventListener("ended", done);
        el.addEventListener("error", done);
        el.play().catch(resolve);
      });
      URL.revokeObjectURL(blobUrl);
    } catch {
      // Never block the main recitation if bismillah fails
    }
  }, [ensureEl]);

  // start: initiate playback and background prefetch
  const start = useCallback(
    async (queue: VerseKey[]) => {
      if (queue.length === 0) return;

      prefetchAbortRef.current?.abort();
      queueRef.current = queue.slice();
      indexRef.current = 0;
      verseRepeatCountRef.current = 0;
      rangePassCountRef.current = 0;

      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      ensureEl();

      // Play bismillah intro when starting at aya 1 of any surah
      // except Al-Fatiha (sura 1, whose verse 1 is already the bismillah)
      // and At-Tawbah (sura 9, which has no bismillah by tradition).
      const first = queue[0];
      if (first.aya === 1 && first.sura !== 1 && first.sura !== 9) {
        setState((s) => ({ ...s, currentVerse: `${first.sura}:${first.aya}`, isLoading: true }));
        await playBismillahIntro();
        // If stop() was called while bismillah was playing, bail out
        if (queueRef.current.length === 0) return;
      }

      await playIndex(0);

      const reciter = reciterRef.current;
      const signal = controller.signal;
      const prefetchAll = async () => {
        for (const verse of queue) {
          if (signal.aborted) break;
          const { sura, aya } = verse;
          if (!(await hasCached(reciter, sura, aya))) {
            try {
              await downloadAndCache(reciter, sura, aya, signal);
            } catch {
              // continue on abort or network error
            }
          }
        }
      };
      prefetchAll();
    },
    [ensureEl, playIndex, playBismillahIntro],
  );

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (el && currentVerseKeyRef.current) {
      recordRecitationSession(
        currentVerseKeyRef.current,
        el.currentTime,
        reciterRef.current,
        queueRef.current.length > 0 ? queueRef.current : undefined,
      );
    }
    el?.pause();
    try {
      if ("mediaSession" in navigator)
        navigator.mediaSession.playbackState = "paused";
    } catch {}
  }, []);

  const resume = useCallback(async () => {
    const el = audioRef.current;
    if (el && el.src) {
      await el.play().catch(() => {});
      try {
        if ("mediaSession" in navigator)
          navigator.mediaSession.playbackState = "playing";
      } catch {}
    }
  }, []);

  const next = useCallback(() => {
    verseRepeatCountRef.current = 0;
    const target = indexRef.current + 1;
    if (target < queueRef.current.length) void playIndexRef.current(target);
    else stop();
  }, [stop]);

  const prev = useCallback(() => {
    verseRepeatCountRef.current = 0;
    const target = indexRef.current - 1;
    if (target >= 0) void playIndexRef.current(target);
  }, []);

  // ─── resumeSession ─────────────────────────────────────────────────────────
  const resumeSession = useCallback(
    async (session: {
      queue: VerseKey[];
      verseKey: string;
      elapsedSeconds: number;
      reciter: string;
    }) => {
      const { queue, verseKey, elapsedSeconds, reciter } = session;

      // Stop any current playback
      stop();

      // Set reciter if provided
      if (reciter) reciterRef.current = reciter;

      // Set up the queue
      queueRef.current = queue.slice();
      const idx = queue.findIndex((v) => `${v.sura}:${v.aya}` === verseKey);
      if (idx === -1) {
        indexRef.current = 0;
      } else {
        indexRef.current = idx;
      }
      verseRepeatCountRef.current = 0;
      rangePassCountRef.current = 0;

      // Prefetch like normal start does
      prefetchAbortRef.current?.abort();
      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      await playIndex(indexRef.current);

      // Seek to saved time after playback starts
      const el = audioRef.current;
      if (el && elapsedSeconds > 0) {
        el.currentTime = elapsedSeconds;
      }

      // Background prefetch
      const signal = controller.signal;
      const prefetchAll = async () => {
        for (const verse of queue) {
          if (signal.aborted) break;
          const { sura, aya } = verse;
          if (!(await hasCached(reciterRef.current, sura, aya))) {
            try {
              await downloadAndCache(reciterRef.current, sura, aya, signal);
            } catch {}
          }
        }
      };
      prefetchAll();
    },
    [stop, playIndex],
  );

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
    resumeSession,
  };
}
