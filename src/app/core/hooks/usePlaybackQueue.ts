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
import { getRangeDurations } from "../services/audio/audio-duration.service";
import { getSurahNameArabic } from "../services/data/metadata.service";
import {
  isNativeOutput,
  nativePlayVerse,
  nativeBismillahIntro,
  nativePause as nativeOutPause,
  nativeResume as nativeOutResume,
  nativeSeek as nativeOutSeek,
  nativeSetSpeed as nativeOutSetSpeed,
} from "../services/audio/native-audio-output";
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
  positionMs: number;
  durationMs: number;
  repeatPageActive: boolean;
}

export interface PlaybackControls {
  state: PlaybackState;
  queue: VerseKey[];
  start: (queue: VerseKey[]) => Promise<void>;
  /**
   * Adopt an in-progress native (Android) playback on cold-start handoff: the native
   * ExoPlayer is already playing `queue[startIndex]`, so this syncs JS state to that
   * index WITHOUT reloading/restarting the track, then arms progression for the rest.
   */
  startAt: (queue: VerseKey[], startIndex: number) => Promise<void>;
  pause: () => void;
  resume: () => Promise<void>;
  stop: () => void;
  next: () => void;
  prev: () => void;
  jumpToIndex: (index: number) => void;
  seekToMs: (positionMs: number) => void;
  /**
   * Called when the native ExoPlayer reports the current track finished (Android).
   * Applies the same repeat/range/page progression the <audio> 'ended' event drives.
   */
  notifyTrackEnded: () => void;
  /**
   * Called ~1×/sec by the native ExoPlayer (Android) with the current verse's position
   * and duration in ms. Updates the in-app slider (range position = elapsed prior verses
   * + this verse's position) and learns verse durations to build the range total.
   */
  notifyNativePosition: (
    perVersePositionMs: number,
    perVerseDurationMs: number,
    tickIndex: number,
  ) => void;
  /** Sync the in-app play/pause button to ExoPlayer's real state (Android) — e.g. when
   * the user pauses/plays from the notification. */
  notifyNativePlaying: (playing: boolean) => void;
  setRepeatPageRange: (range: { first: number; last: number } | null) => void;
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
  /**
   * Called when the queue finishes naturally with no remaining repeat passes (i.e. the
   * surah ended and the user is NOT looping it). Return true if continuation was handled
   * (e.g. the next surah was started) so the hook does NOT stop; return false/undefined to
   * let the hook stop(). Surah-level knowledge (verse counts, next-surah) lives in the
   * caller (PlaybackContext), not here.
   */
  onQueueEnded?: () => boolean;
}

const INITIAL_STATE: PlaybackState = {
  currentIndex: -1,
  currentVerse: null,
  isPlaying: false,
  isLoading: false,
  error: null,
  verseRepeatCount: 0,
  rangePassCount: 0,
  positionMs: 0,
  durationMs: 0,
  repeatPageActive: false,
};


export function usePlaybackQueue(
  initial: UsePlaybackQueueOptions,
): PlaybackControls {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<VerseKey[]>([]);
  const indexRef = useRef(0);
  const verseRepeatCountRef = useRef(0);
  const rangePassCountRef = useRef(0);

  const isLoadingRef = useRef(false);
  const reciterRef = useRef(initial.reciter);
  const currentVerseKeyRef = useRef<string | null>(null);
  const playbackRateRef = useRef(initial.playbackRate ?? 1);
  const repeatVerseRef = useRef<RepeatMode>(initial.repeatVerse ?? 1);
  const repeatRangeRef = useRef<RepeatMode>(initial.repeatRange ?? 1);
  const repeatPageRangeRef = useRef<{ first: number; last: number } | null>(null);
  const onQueueEndedRef = useRef<UsePlaybackQueueOptions["onQueueEnded"]>(
    initial.onQueueEnded,
  );
  onQueueEndedRef.current = initial.onQueueEnded;

  const currentBlobUrlRef = useRef<string | null>(null);
  const prefetchAbortRef = useRef<AbortController | null>(null);

  // Accumulated elapsed seconds from all completed verses in the current range pass
  const elapsedBeforeCurrentVerseRef = useRef(0);
  // Known durations per verse index, filled as each verse loads
  const verseDurationsRef = useRef<Record<number, number>>({});
  // Estimated total duration of the range (sum of known verse durations)
  const totalRangeDurationRef = useRef(0);
  // Last per-verse duration reported by ExoPlayer — fallback for advance() when
  // the verse ended before its duration was stored in verseDurationsRef.
  const lastNativeVerseDurationSecRef = useRef(0);
  // True while transitioning between verses on native — suppresses the spurious
  // "paused" event ExoPlayer fires between tracks.
  const isVerseTransitioningRef = useRef(false);

  const [state, setState] = useState<PlaybackState>(INITIAL_STATE);
  const [activeQueue, setActiveQueue] = useState<VerseKey[]>([]);

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
      setState((s) =>
        s.isPlaying && !s.isLoading ? { ...s, isPlaying: false } : s,
      ),
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
    el.addEventListener("durationchange", () => {
      const dur = el.duration;
      if (!isFinite(dur) || dur <= 0) return;
      const idx = indexRef.current;
      const prev = verseDurationsRef.current[idx] ?? 0;
      // Only update the total if the duration changed (e.g. first time, or correction).
      // The prefetch probe may have already stored this verse's duration; avoid double-counting.
      if (Math.abs(dur - prev) < 0.01) return;
      verseDurationsRef.current[idx] = dur;
      totalRangeDurationRef.current = Math.max(
        0,
        totalRangeDurationRef.current - prev + dur,
      );
      setState((s) => ({
        ...s,
        durationMs: Math.round(totalRangeDurationRef.current * 1000),
      }));
    });
    el.addEventListener("timeupdate", () => {
      if (isLoadingRef.current) return;
      const rangePos = elapsedBeforeCurrentVerseRef.current + el.currentTime;
      setState((s) => ({ ...s, positionMs: Math.round(rangePos * 1000) }));
    });

    audioRef.current = el;
    return el;
  }, []);

  const updateMediaSession = useCallback(
    (verseKey: string, playing: boolean) => {
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
        const el = audioRef.current;
        const totalDuration = totalRangeDurationRef.current;
        if (
          el &&
          isFinite(el.duration) &&
          el.duration > 0 &&
          totalDuration > 0
        ) {
          const rangePosition =
            elapsedBeforeCurrentVerseRef.current + el.currentTime;
          navigator.mediaSession.setPositionState({
            duration: totalDuration,
            playbackRate: el.playbackRate,
            position: Math.min(rangePosition, totalDuration),
          });
        }
      } catch {
        /* ignore */
      }
    },
    [],
  );

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
    if (isNativeOutput()) {
      if (currentVerseKeyRef.current) {
        recordRecitationSession(
          currentVerseKeyRef.current,
          0,
          reciterRef.current,
          queueRef.current.length > 0 ? queueRef.current : undefined,
        );
      }
      nativeOutPause();
    } else {
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
    }
    releaseCurrentBlob();
    currentVerseKeyRef.current = null;
    queueRef.current = [];
    indexRef.current = 0;
    verseRepeatCountRef.current = 0;
    rangePassCountRef.current = 0;
    elapsedBeforeCurrentVerseRef.current = 0;
    verseDurationsRef.current = {};
    totalRangeDurationRef.current = 0;
    lastNativeVerseDurationSecRef.current = 0;
    isVerseTransitioningRef.current = false;
    try {
      if ("mediaSession" in navigator)
        navigator.mediaSession.playbackState = "none";
    } catch {}
    setState({ ...INITIAL_STATE, positionMs: 0, durationMs: 0 });
    setActiveQueue([]);
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

    // If repeat-page is active and we just finished the last verse of the page,
    // loop back to the first verse of the page.
    const pageRange = repeatPageRangeRef.current;
    if (pageRange !== null && indexRef.current >= pageRange.last) {
      let elapsed = 0;
      for (let i = 0; i < pageRange.first; i++) {
        elapsed += verseDurationsRef.current[i] ?? 0;
      }
      elapsedBeforeCurrentVerseRef.current = elapsed;
      isVerseTransitioningRef.current = true;
      void playIndexRef.current(pageRange.first);
      return;
    }

    if (nextIdx < queue.length) {
      // Advance elapsed by the completed verse's known duration; fall back to the last
      // ExoPlayer-reported duration so the position never jumps to 0 between verses.
      const knownDur = verseDurationsRef.current[indexRef.current];
      elapsedBeforeCurrentVerseRef.current +=
        knownDur != null && knownDur > 0
          ? knownDur
          : lastNativeVerseDurationSecRef.current;
      isVerseTransitioningRef.current = true;
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
      // Loop back to start — reset position to beginning of range
      elapsedBeforeCurrentVerseRef.current = 0;
      isVerseTransitioningRef.current = true;
      void playIndexRef.current(0);
      return;
    }
    // Queue finished with no remaining repeat passes. Give the caller a chance to
    // continue (e.g. auto-play the next surah). If it handles continuation, don't stop.
    if (onQueueEndedRef.current?.()) return;
    stop();
  }, [stop]);

  const endedHandlerRef = useRef<(() => void) | null>(null);

  const bindEnded = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (endedHandlerRef.current) {
      el.removeEventListener("ended", endedHandlerRef.current);
    }
    const handler = () => advance();
    endedHandlerRef.current = handler;
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

      // Keep Media Session in "playing" state throughout verse transitions
      // so the notification never shows a paused state between verses
      try {
        if ("mediaSession" in navigator)
          navigator.mediaSession.playbackState = "playing";
      } catch {}

      isLoadingRef.current = true;
      setState((s) => ({
        ...s,
        currentIndex: idx,
        currentVerse: verseKey,
        // Seed the cumulative position to this verse's start (sum of all prior verses) NOW,
        // so the notification's position is correct the instant the verse-change sync fires.
        // Without this it briefly shows the PREVIOUS verse's last position (the new verse's
        // first native tick hasn't arrived yet), making the bar appear to reset/jump.
        positionMs: Math.round(elapsedBeforeCurrentVerseRef.current * 1000),
        isLoading: true,
        error: null,
        verseRepeatCount: verseRepeatCountRef.current + 1,
        rangePassCount: rangePassCountRef.current,
      }));

      // ── Native (Android) output path ──────────────────────────────────────
      // ExoPlayer plays the resolved file; the JS brain keeps progression. We do
      // NOT touch the <audio> element here. Advancing to the next verse happens via
      // the 'nativeTrackEnded' carAction (wired in PlaybackContext → advance()).
      if (isNativeOutput()) {
        try {
          const surahName = getSurahNameArabic(sura);
          await nativePlayVerse(
            reciterRef.current,
            sura,
            aya,
            idx,
            surahName,
          );
          verseRepeatCountRef.current += 1;
          isLoadingRef.current = false;
          updateMediaSession(verseKey, true);
          setState((s) => ({
            ...s,
            isPlaying: true,
            isLoading: false,
            verseRepeatCount: verseRepeatCountRef.current,
          }));
          // Prefetch next verse's file so the transition is gapless.
          const nextIdx2 = idx + 1;
          if (nextIdx2 < queue.length) {
            const { sura: ns, aya: na } = queue[nextIdx2];
            downloadAndCache(reciterRef.current, ns, na).catch(() => {});
          }
        } catch (err) {
          isLoadingRef.current = false;
          const message = err instanceof Error ? err.message : "playback failed";
          setState((s) => ({
            ...s,
            isPlaying: false,
            isLoading: false,
            error: message,
          }));
        }
        return;
      }

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

        // Try el.play() up to 4 times with back-off.
        // On Android Auto cold-start, the WebView may report NotAllowedError on
        // the first attempt even with mediaPlaybackRequiresUserGesture=false because
        // the audio context hasn't been unlocked yet. Retrying after a short delay
        // usually succeeds once the system acknowledges the audio focus grant.
        let playErr: unknown = null;
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            await el.play();
            playErr = null;
            break;
          } catch (e) {
            playErr = e;
            if (!(e instanceof DOMException && e.name === "NotAllowedError")) break;
            await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
          }
        }
        if (playErr !== null) {
          isLoadingRef.current = false;
          if (
            playErr instanceof DOMException &&
            playErr.name === "NotAllowedError"
          ) {
            setState((s) => ({
              ...s,
              isPlaying: false,
              isLoading: false,
              currentVerse: verseKey,
            }));
            return;
          }
          throw playErr;
        }

        // Re‑bind ended after every successful play
        bindEnded();

        isLoadingRef.current = false;
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
        isLoadingRef.current = false;
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
      if (next < queueRef.current.length) {
        elapsedBeforeCurrentVerseRef.current +=
          verseDurationsRef.current[indexRef.current] ?? 0;
        void playIndexRef.current(next);
      } else {
        stop();
      }
    };
    const onPrev = () => {
      verseRepeatCountRef.current = 0;
      const target = indexRef.current - 1;
      if (target >= 0) {
        let elapsed = 0;
        for (let i = 0; i < target; i++) {
          elapsed += verseDurationsRef.current[i] ?? 0;
        }
        elapsedBeforeCurrentVerseRef.current = elapsed;
        void playIndexRef.current(target);
      }
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
      // Retry play() up to 3 times — on Android Auto cold-start the audio context
      // may not be unlocked on the first attempt.
      let played = false;
      for (let attempt = 0; attempt < 3 && !played; attempt++) {
        try {
          await el.play();
          played = true;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 300));
        }
      }
      if (played) {
        await new Promise<void>((resolve) => {
          const done = () => {
            el.removeEventListener("ended", done);
            el.removeEventListener("error", done);
            resolve();
          };
          el.addEventListener("ended", done);
          el.addEventListener("error", done);
        });
      }
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
      setActiveQueue(queue.slice());
      indexRef.current = 0;
      verseRepeatCountRef.current = 0;
      rangePassCountRef.current = 0;
      elapsedBeforeCurrentVerseRef.current = 0;
      verseDurationsRef.current = {};
      totalRangeDurationRef.current = 0;
      lastNativeVerseDurationSecRef.current = 0;
      isVerseTransitioningRef.current = false;

      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      // Bismillah intro plays when starting at aya 1 of any surah except Al-Fatiha
      // (sura 1, whose verse 1 is already the bismillah) and At-Tawbah (sura 9, which
      // has no bismillah by tradition).
      const first = queue[0];
      const wantsBismillah =
        first.aya === 1 && first.sura !== 1 && first.sura !== 9;

      const reciter = reciterRef.current;
      const signal = controller.signal;

      // Show a loading state and reset the bar to 0/0 while we resolve the range total
      // (below) before the first verse plays.
      isLoadingRef.current = true;
      setState((s) => ({
        ...s,
        currentVerse: `${first.sura}:${first.aya}`,
        isLoading: true,
        isPlaying: false,
        positionMs: 0,
        durationMs: 0,
      }));

      // Resolve the WHOLE range's per-verse + total duration BEFORE playback starts, using
      // the Quran Foundation timestamp endpoint (exact ms, cached, whole-surah total in one
      // call). This replaces probing downloaded audio files, which was unreliable on Android
      // (the WebView often never reports metadata for capacitor:// URLs), leaving the total
      // wrong and growing one verse at a time. Accurate per-verse durations also keep the
      // cumulative position correct at every verse boundary (no notification-bar reset).
      const { perVerseSec, totalSec } = await getRangeDurations(
        reciter,
        queue,
        signal,
      );
      if (signal.aborted || queueRef.current.length === 0) return;

      for (let i = 0; i < perVerseSec.length; i++) {
        if (perVerseSec[i] > 0) verseDurationsRef.current[i] = perVerseSec[i];
      }
      totalRangeDurationRef.current = totalSec;

      // Publish the fixed total ONCE, before any audio plays.
      setState((s) => ({
        ...s,
        durationMs: Math.round(totalRangeDurationRef.current * 1000),
      }));

      if (isNativeOutput()) {
        // ExoPlayer is the output on Android; the <audio> element is unused.
        if (wantsBismillah) {
          setState((s) => ({
            ...s,
            currentVerse: `${first.sura}:${first.aya}`,
            isLoading: true,
          }));
          await nativeBismillahIntro(reciterRef.current);
          if (queueRef.current.length === 0) return; // stopped during intro
        }
      } else {
        ensureEl();
        if (wantsBismillah) {
          setState((s) => ({
            ...s,
            currentVerse: `${first.sura}:${first.aya}`,
            isLoading: true,
          }));
          await playBismillahIntro();
          // If stop() was called while bismillah was playing, bail out
          if (queueRef.current.length === 0) return;
        }
      }

      await playIndex(0);

      // On native, persist the full resolved queue so a future cold-start car play
      // can begin instantly from the saved list (see RafeeqMediaService cold start).
      if (isNativeOutput()) {
        const titleSura = queue[0].sura;
        void import("../services/audio/native-audio-output").then((m) =>
          m
            .pushNativeQueue(
              reciterRef.current,
              queue,
              0,
              getSurahNameArabic(titleSura),
            )
            .catch(() => {}),
        );
      }
    },
    [ensureEl, playIndex, playBismillahIntro],
  );

  // startAt: cold-start handoff (Android). ExoPlayer is already playing queue[startIndex];
  // adopt that index. We reload the CURRENT verse via playIndex (a small restart of just
  // this verse, not the whole surah) which also flips native into JS-driven mode so future
  // verse-ends route through the brain. No bismillah (we're resuming mid-queue).
  const startAt = useCallback(
    async (queue: VerseKey[], startIndex: number) => {
      if (queue.length === 0) return;
      const idx = Math.max(0, Math.min(startIndex, queue.length - 1));

      prefetchAbortRef.current?.abort();
      queueRef.current = queue.slice();
      setActiveQueue(queue.slice());
      indexRef.current = idx;
      verseRepeatCountRef.current = 0;
      rangePassCountRef.current = 0;
      elapsedBeforeCurrentVerseRef.current = 0;
      verseDurationsRef.current = {};
      totalRangeDurationRef.current = 0;
      lastNativeVerseDurationSecRef.current = 0;
      isVerseTransitioningRef.current = false;

      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      await playIndex(idx);

      // Persist the queue with the adopted start index for the next cold start.
      if (isNativeOutput()) {
        const titleSura = queue[idx].sura;
        void import("../services/audio/native-audio-output").then((m) =>
          m
            .pushNativeQueue(reciterRef.current, queue, idx, getSurahNameArabic(titleSura))
            .catch(() => {}),
        );
      }

      // Resolve durations from the timestamp endpoint so the slider total is correct.
      // Cold start prioritizes instant audio, so this runs in the background (we've already
      // started playing the adopted verse above) and corrects the bar once resolved.
      const reciter = reciterRef.current;
      const signal = controller.signal;
      void (async () => {
        const { perVerseSec, totalSec } = await getRangeDurations(
          reciter,
          queue,
          signal,
        );
        if (signal.aborted) return;
        for (let i = 0; i < perVerseSec.length; i++) {
          if (perVerseSec[i] > 0) verseDurationsRef.current[i] = perVerseSec[i];
        }
        totalRangeDurationRef.current = totalSec;
        // Position reflects all verses before the adopted index.
        let elapsed = 0;
        for (let i = 0; i < idx; i++) elapsed += verseDurationsRef.current[i] ?? 0;
        elapsedBeforeCurrentVerseRef.current = elapsed;
        setState((s) => ({
          ...s,
          positionMs: Math.round(elapsed * 1000),
          durationMs: Math.round(totalRangeDurationRef.current * 1000),
        }));
      })();
    },
    [playIndex],
  );

  const pause = useCallback(() => {
    const el = audioRef.current;
    if (currentVerseKeyRef.current) {
      recordRecitationSession(
        currentVerseKeyRef.current,
        el?.currentTime ?? 0,
        reciterRef.current,
        queueRef.current.length > 0 ? queueRef.current : undefined,
      );
    }
    if (isNativeOutput()) {
      nativeOutPause();
      setState((s) => ({ ...s, isPlaying: false }));
    } else {
      el?.pause();
    }
    try {
      if ("mediaSession" in navigator)
        navigator.mediaSession.playbackState = "paused";
    } catch {}
  }, []);

  const resume = useCallback(async () => {
    if (isNativeOutput()) {
      nativeOutResume();
      setState((s) => ({ ...s, isPlaying: true }));
      try {
        if ("mediaSession" in navigator)
          navigator.mediaSession.playbackState = "playing";
      } catch {}
      return;
    }
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
    if (target < queueRef.current.length) {
      elapsedBeforeCurrentVerseRef.current +=
        verseDurationsRef.current[indexRef.current] ?? 0;
      setState((s) => ({
        ...s,
        positionMs: Math.round(elapsedBeforeCurrentVerseRef.current * 1000),
        durationMs: Math.round(totalRangeDurationRef.current * 1000),
      }));
      void playIndexRef.current(target);
    } else {
      stop();
    }
  }, [stop]);

  const prev = useCallback(() => {
    verseRepeatCountRef.current = 0;
    const target = indexRef.current - 1;
    if (target >= 0) {
      let elapsed = 0;
      for (let i = 0; i < target; i++) {
        elapsed += verseDurationsRef.current[i] ?? 0;
      }
      elapsedBeforeCurrentVerseRef.current = elapsed;
      setState((s) => ({
        ...s,
        positionMs: Math.round(elapsed * 1000),
        durationMs: Math.round(totalRangeDurationRef.current * 1000),
      }));
      void playIndexRef.current(target);
    }
  }, []);

  const jumpToIndex = useCallback((index: number) => {
    if (index < 0 || index >= queueRef.current.length) return;
    verseRepeatCountRef.current = 0;
    let elapsed = 0;
    for (let i = 0; i < index; i++) {
      elapsed += verseDurationsRef.current[i] ?? 0;
    }
    elapsedBeforeCurrentVerseRef.current = elapsed;
    // Immediately reflect the new position in state so the UI updates before
    // the first timeupdate fires from the newly loaded verse.
    setState((s) => ({
      ...s,
      positionMs: Math.round(elapsed * 1000),
      durationMs: Math.round(totalRangeDurationRef.current * 1000),
    }));
    void playIndexRef.current(index);
  }, []);

  // Seek to an absolute position (ms) within the range. Finds the verse containing
  // that position, loads it if needed, and seeks within it.
  const seekToMs = useCallback((positionMs: number) => {
    const queue = queueRef.current;
    if (queue.length === 0) return;
    const targetSec = positionMs / 1000;
    let elapsed = 0;
    let targetIndex = queue.length - 1;
    for (let i = 0; i < queue.length; i++) {
      const dur = verseDurationsRef.current[i] ?? 0;
      if (elapsed + dur > targetSec || i === queue.length - 1) {
        targetIndex = i;
        break;
      }
      elapsed += dur;
    }
    const offsetSec = Math.max(0, targetSec - elapsed);
    if (targetIndex === indexRef.current) {
      // Same verse — just seek within it
      elapsedBeforeCurrentVerseRef.current = elapsed;
      if (isNativeOutput()) {
        nativeOutSeek(Math.round(offsetSec * 1000));
      } else {
        const el = audioRef.current;
        if (el) el.currentTime = offsetSec;
      }
    } else {
      // Different verse — jump to it then seek
      verseRepeatCountRef.current = 0;
      elapsedBeforeCurrentVerseRef.current = elapsed;
      setState((s) => ({
        ...s,
        positionMs: Math.round(elapsed * 1000),
        durationMs: Math.round(totalRangeDurationRef.current * 1000),
      }));
      void (async () => {
        await playIndexRef.current(targetIndex);
        if (offsetSec > 0) {
          if (isNativeOutput()) {
            nativeOutSeek(Math.round(offsetSec * 1000));
          } else {
            const el = audioRef.current;
            if (el) el.currentTime = offsetSec;
          }
        }
      })();
    }
  }, []);

  // ─── notifyNativePosition (Android) ──────────────────────────────────────────
  // Mirrors the <audio> "timeupdate" + "durationchange" handlers for the native path.
  const notifyNativePosition = useCallback(
    (perVersePositionMs: number, perVerseDurationMs: number, tickIndex: number) => {
      const idx = indexRef.current;

      // Drop stale ticks: a position update emitted for a previous verse can arrive over
      // the bridge AFTER a jump (prev/next page) already moved us to a new verse. Applying
      // it would yank the slider to a wrong position or momentarily to 0. We only accept
      // ticks tagged with the current index (tickIndex < 0 means untagged — accept it).
      if (tickIndex >= 0 && tickIndex !== idx) return;

      // Track the latest per-verse duration ONLY as a fallback for advance() (so the
      // position never jumps to 0 between verses). We deliberately do NOT write to
      // verseDurationsRef or totalRangeDurationRef here: those are owned exclusively by
      // the upfront prefetch probe in start()/startAt(). Writing a native-tick duration
      // into verseDurationsRef without also adjusting totalRangeDurationRef caused the
      // prefetch probe to later subtract a value it never added — making the displayed
      // total shrink over time. The range total must stay FIXED for the whole range.
      if (perVerseDurationMs > 0) {
        lastNativeVerseDurationSecRef.current = perVerseDurationMs / 1000;
      }

      const rangePosSec =
        elapsedBeforeCurrentVerseRef.current + perVersePositionMs / 1000;
      // Position only. Duration is fixed for the range and pushed separately; never
      // overwrite it from a per-verse tick (which would make the right-side total jitter).
      setState((s) => ({
        ...s,
        positionMs: Math.round(rangePosSec * 1000),
      }));
    },
    [],
  );

  const nativePlayingPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const notifyNativePlaying = useCallback((playing: boolean) => {
    // Clear any pending debounced pause.
    if (nativePlayingPauseTimerRef.current) {
      clearTimeout(nativePlayingPauseTimerRef.current);
      nativePlayingPauseTimerRef.current = null;
    }
    if (playing) {
      isVerseTransitioningRef.current = false;
      setState((s) => (s.isPlaying ? s : { ...s, isPlaying: true }));
      return;
    }
    // Suppress the spurious "paused" event ExoPlayer fires between verse tracks.
    if (isVerseTransitioningRef.current) return;
    // Debounce "paused": ExoPlayer reports a momentary pause BETWEEN verses while the
    // next track loads. Only show paused if playback hasn't resumed within 800ms — a
    // real user pause (notification) stays paused; a verse transition resumes and cancels.
    nativePlayingPauseTimerRef.current = setTimeout(() => {
      nativePlayingPauseTimerRef.current = null;
      if (!isLoadingRef.current && !isVerseTransitioningRef.current) {
        setState((s) => (s.isPlaying ? { ...s, isPlaying: false } : s));
      }
    }, 800);
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
      elapsedBeforeCurrentVerseRef.current = 0;
      verseDurationsRef.current = {};
      totalRangeDurationRef.current = 0;

      // Prefetch like normal start does
      prefetchAbortRef.current?.abort();
      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      await playIndex(indexRef.current);

      // Seek to saved time after playback starts
      if (elapsedSeconds > 0) {
        if (isNativeOutput()) {
          nativeOutSeek(Math.round(elapsedSeconds * 1000));
        } else {
          const el = audioRef.current;
          if (el) el.currentTime = elapsedSeconds;
        }
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

  const setRepeatPageRange = useCallback(
    (range: { first: number; last: number } | null) => {
      repeatPageRangeRef.current = range;
      const active = range !== null;
      // Bail out if the flag is unchanged so a redundant call can't trigger a
      // re-render (and re-fire the caller's effect → infinite update loop).
      setState((s) => (s.repeatPageActive === active ? s : { ...s, repeatPageActive: active }));
    },
    [],
  );

  const setPlaybackRate = useCallback((rate: number) => {
    playbackRateRef.current = rate;
    if (isNativeOutput()) {
      nativeOutSetSpeed(rate);
      return;
    }
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
    queue: activeQueue,
    start,
    startAt,
    pause,
    resume,
    stop,
    next,
    prev,
    jumpToIndex,
    seekToMs,
    notifyTrackEnded: advance,
    notifyNativePosition,
    notifyNativePlaying,
    setRepeatPageRange,
    setPlaybackRate,
    setReciter,
    setRepeatVerse,
    setRepeatRange,
    resumeSession,
  };
}
