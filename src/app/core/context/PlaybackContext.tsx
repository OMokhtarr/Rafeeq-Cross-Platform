import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  usePlaybackQueue,
  type PlaybackControls,
  type UsePlaybackQueueOptions,
  type VerseKey,
} from "../hooks/usePlaybackQueue";
import { DrivingMode } from "../services/native/driving-mode.plugin";
import {
  getSurahNameArabic,
  getSurahNameEnglish,
  estimatePageForVerse,
} from "../services/data/metadata.service";
import { Capacitor } from "@capacitor/core";

const PlaybackContext = createContext<PlaybackControls | null>(null);

const DEFAULT_OPTS: UsePlaybackQueueOptions = {
  reciter: "minshawi-murattal",
  playbackRate: 1,
  repeatVerse: 1,
  repeatRange: "loop",
};

// All 114 surahs for Android Auto's browse tree
const ALL_SURAHS = Array.from({ length: 114 }, (_, i) => ({
  number: i + 1,
  name: getSurahNameEnglish(i + 1),
  arabicName: getSurahNameArabic(i + 1),
}));

// Subset of popular reciters exposed in the car UI.
// Keys must match the reciter IDs your audio service uses.
const CAR_RECITERS = [
  { id: "minshawi-murattal", name: "المنشاوي - مرتل" },
  { id: "abdul_basit_murattal", name: "عبد الباسط - مرتل" },
  { id: "sudais", name: "السديس" },
  { id: "husary", name: "الحصري" },
  { id: "alafasy", name: "العفاسي" },
];

const RECITER_DISPLAY_NAME: Record<string, string> = {
  "minshawi-murattal": "المنشاوي - مرتل",
  abdul_basit_murattal: "عبد الباسط - مرتل",
  sudais: "السديس",
  husary: "الحصري",
  alafasy: "العفاسي",
};

/**
 * Given a queue that is entirely within one surah, returns one {page, aya} marker
 * per Mushaf page that contains at least one verse from the queue.
 *
 * `aya` is the first queue aya on that page (used to compute the jump index).
 *
 * Rules:
 *  - Only produced when every verse in the queue belongs to the same surah.
 *  - The first marker always uses the queue's first aya (aya 1 of the surah or
 *    wherever the queue starts), even if the surah begins mid-page.
 *  - For subsequent pages, the aya is the first queue verse whose page number
 *    equals that page (i.e. the first aya of the surah that appears on that page).
 *  - Returns [] for single-page surahs or any multi-surah queue.
 */
function getQueuePageMarkers(
  queue: VerseKey[],
): Array<{ page: number; aya: number }> {
  if (queue.length === 0) return [];
  // Only show page navigation for single-surah queues
  const sura = queue[0].sura;
  if (queue.some((v) => v.sura !== sura)) return [];

  const markers: Array<{ page: number; aya: number }> = [];
  let lastPage = -1;

  for (const verse of queue) {
    const page = estimatePageForVerse(verse.sura, verse.aya);
    if (page !== lastPage) {
      markers.push({ page, aya: verse.aya });
      lastPage = page;
    }
  }

  // Single page — no navigation needed
  if (markers.length <= 1) return [];
  return markers;
}

export const PlaybackProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const queue = usePlaybackQueue(DEFAULT_OPTS);
  const listenerRef = useRef<{ remove: () => void } | null>(null);
  const isNative = Capacitor.isNativePlatform();
  const [currentReciterId, setCurrentReciterId] = useState(
    DEFAULT_OPTS.reciter,
  );
  // Whether repeat-page mode is toggled on by the user
  const [repeatPageEnabled, setRepeatPageEnabled] = useState(false);
  const repeatPageEnabledRef = useRef(false);
  // Cached page markers for the current queue (recomputed only when queue identity changes)
  const pageMarkersCache = useRef<{
    firstAya: number;
    lastAya: number;
    len: number;
    markers: Array<{ page: number; aya: number }>;
  } | null>(null);
  // Always-current ref to the active queue for use inside event listener closures
  const activeQueueRef = useRef<VerseKey[]>([]);
  // Tracks whether anything is currently loaded so "play" from a cold car start falls back to start()
  const currentVerseRef = useRef<string | null>(null);
  // Stable ref to queue controls so the car listener effect doesn't re-register on every render
  const queueRef = useRef(queue);
  const setCurrentReciterIdRef = useRef(setCurrentReciterId);
  useEffect(() => {
    queueRef.current = queue;
  });
  useEffect(() => {
    setCurrentReciterIdRef.current = setCurrentReciterId;
  });
  useEffect(() => {
    repeatPageEnabledRef.current = repeatPageEnabled;
  }, [repeatPageEnabled]);

  // Keep activeQueueRef and currentVerseRef current so listener closures always see the latest state
  useEffect(() => {
    activeQueueRef.current = queue.queue;
  }, [queue.queue]);
  useEffect(() => {
    currentVerseRef.current = queue.state.currentVerse;
  }, [queue.state.currentVerse]);

  // Push content tree once on mount so Android Auto can browse reciters/surahs
  useEffect(() => {
    if (!isNative) return;
    DrivingMode.setContentTree({
      reciters: CAR_RECITERS,
      surahs: ALL_SURAHS,
    }).catch(() => {});
  }, [isNative]);

  // When repeat-page is enabled and the current verse changes, recompute the page
  // range (first..last queue index for the current page) and push it to the hook.
  // Also clears the range when the toggle is turned off.
  useEffect(() => {
    const q = activeQueueRef.current;
    const currentVerse = currentVerseRef.current;
    if (!repeatPageEnabled || q.length === 0 || !currentVerse) {
      queueRef.current.setRepeatPageRange(null);
      return;
    }
    const suraNum = parseInt(currentVerse.split(":")[0], 10);
    const ayaNum = parseInt(currentVerse.split(":")[1], 10);
    if (isNaN(suraNum) || isNaN(ayaNum)) {
      queueRef.current.setRepeatPageRange(null);
      return;
    }
    const currentPage = estimatePageForVerse(suraNum, ayaNum);
    let first = -1;
    let last = -1;
    for (let i = 0; i < q.length; i++) {
      const p = estimatePageForVerse(q[i].sura, q[i].aya);
      if (p === currentPage) {
        if (first === -1) first = i;
        last = i;
      } else if (first !== -1) {
        break;
      }
    }
    if (first !== -1) {
      queueRef.current.setRepeatPageRange({ first, last });
    }
  }, [repeatPageEnabled, queue.state.currentVerse, queue.queue]);

  // Keep Android Auto display in sync with playback state.
  // positionMs is intentionally omitted from deps — PlaybackStateCompat interpolates
  // position automatically when STATE_PLAYING + speed=1f is set. We only re-sync on
  // verse change (which carries a fresh durationMs), play/pause transitions, and queue changes.
  useEffect(() => {
    if (!isNative) return;
    const { currentVerse, isPlaying, positionMs, durationMs, repeatPageActive } = queue.state;
    const verseKey = currentVerse ?? "";
    let surahName = "";
    let suraNum = NaN;
    if (verseKey) {
      suraNum = parseInt(verseKey.split(":")[0], 10);
      if (!isNaN(suraNum)) surahName = getSurahNameArabic(suraNum);
    }
    const ayaNum = verseKey ? parseInt(verseKey.split(":")[1], 10) : NaN;

    // Recompute page markers only when the queue identity changes
    let pageMarkers: Array<{ page: number; aya: number }> | undefined;
    const q = queue.queue;
    if (q.length > 0) {
      const firstAya = q[0].aya;
      const lastAya = q[q.length - 1].aya;
      const len = q.length;
      const cached = pageMarkersCache.current;
      if (
        !cached ||
        cached.firstAya !== firstAya ||
        cached.lastAya !== lastAya ||
        cached.len !== len
      ) {
        const markers = getQueuePageMarkers(q);
        pageMarkersCache.current = { firstAya, lastAya, len, markers };
        pageMarkers = markers;
      }
    }

    const currentPage =
      !isNaN(suraNum) && !isNaN(ayaNum)
        ? estimatePageForVerse(suraNum, ayaNum)
        : 0;

    DrivingMode.updatePlaybackState({
      isPlaying,
      surahName,
      verseKey,
      reciterName: RECITER_DISPLAY_NAME[currentReciterId] ?? currentReciterId,
      positionMs,
      durationMs,
      pageMarkers,
      currentPage,
      repeatPageActive,
    }).catch(() => {});
  }, [
    isNative,
    currentReciterId,
    queue.queue,
    queue.state.isPlaying,
    queue.state.currentVerse,
    queue.state.durationMs,
    queue.state.repeatPageActive,
  ]);

  // Listen for car control events (play/pause/next/prev/selectSurah).
  // Registered once on mount — uses stable refs so re-renders don't tear down
  // and re-register the listener (which caused the handler to be silently removed).
  useEffect(() => {
    if (!isNative) return;

    DrivingMode.addListener("carAction", (event) => {
      const q = queueRef.current;
      switch (event.action) {
        case "play":
          if (currentVerseRef.current) {
            // Something is already loaded — just resume
            q.resume().catch(() => {});
          } else {
            // Cold start from Android Auto: nothing loaded yet, start the queue.
            // If no queue exists either (e.g. app just opened), default to Al-Fatiha.
            const coldQueue =
              activeQueueRef.current.length > 0
                ? activeQueueRef.current
                : Array.from({ length: 7 }, (_, i) => ({ sura: 1, aya: i + 1 }));
            q.start(coldQueue).catch(() => {});
          }
          break;
        case "pause":
          q.pause();
          break;
        case "next":
          q.next();
          break;
        case "prev":
          q.prev();
          break;
        case "stop":
          q.stop();
          break;
        case "selectSurah": {
          if (event.surah == null) break;
          const surahNum = event.surah;
          const count = SURAH_VERSE_COUNTS[surahNum] ?? 7;
          const verseQueue: VerseKey[] = Array.from(
            { length: count },
            (_, i) => ({
              sura: surahNum,
              aya: i + 1,
            }),
          );
          if (event.reciter) {
            q.setReciter(event.reciter);
            setCurrentReciterIdRef.current(event.reciter);
          }
          q.start(verseQueue).catch(() => {});
          break;
        }
        case "jumpToAya": {
          if (event.aya == null) break;
          const targetAya = event.aya;
          const targetIndex = activeQueueRef.current.findIndex(
            (v) => v.aya === targetAya,
          );
          if (targetIndex !== -1) q.jumpToIndex(targetIndex);
          break;
        }
        case "replayPage": {
          // Toggle repeat-page mode on/off
          const next = !repeatPageEnabledRef.current;
          setRepeatPageEnabled(next);
          break;
        }
        case "seekTo": {
          if (event.positionMs == null) break;
          q.seekToMs(event.positionMs);
          break;
        }
      }
    })
      .then((handle) => {
        listenerRef.current = handle;
      })
      .catch(() => {});

    return () => {
      listenerRef.current?.remove();
      listenerRef.current = null;
    };
  }, [isNative]);

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

// Static verse counts per surah (1-indexed). Source: standard Quran.
const SURAH_VERSE_COUNTS: Record<number, number> = {
  1: 7,
  2: 286,
  3: 200,
  4: 176,
  5: 120,
  6: 165,
  7: 206,
  8: 75,
  9: 129,
  10: 109,
  11: 123,
  12: 111,
  13: 43,
  14: 52,
  15: 99,
  16: 128,
  17: 111,
  18: 110,
  19: 98,
  20: 135,
  21: 112,
  22: 78,
  23: 118,
  24: 64,
  25: 77,
  26: 227,
  27: 93,
  28: 88,
  29: 69,
  30: 60,
  31: 34,
  32: 30,
  33: 73,
  34: 54,
  35: 45,
  36: 83,
  37: 182,
  38: 88,
  39: 75,
  40: 85,
  41: 54,
  42: 53,
  43: 89,
  44: 59,
  45: 37,
  46: 35,
  47: 38,
  48: 29,
  49: 18,
  50: 45,
  51: 60,
  52: 49,
  53: 62,
  54: 55,
  55: 78,
  56: 96,
  57: 29,
  58: 22,
  59: 24,
  60: 13,
  61: 14,
  62: 11,
  63: 11,
  64: 18,
  65: 12,
  66: 12,
  67: 30,
  68: 52,
  69: 52,
  70: 44,
  71: 28,
  72: 28,
  73: 20,
  74: 56,
  75: 40,
  76: 31,
  77: 50,
  78: 40,
  79: 46,
  80: 42,
  81: 29,
  82: 19,
  83: 36,
  84: 25,
  85: 22,
  86: 17,
  87: 19,
  88: 26,
  89: 30,
  90: 20,
  91: 15,
  92: 21,
  93: 11,
  94: 8,
  95: 8,
  96: 19,
  97: 5,
  98: 8,
  99: 8,
  100: 11,
  101: 11,
  102: 8,
  103: 3,
  104: 9,
  105: 5,
  106: 4,
  107: 7,
  108: 3,
  109: 6,
  110: 3,
  111: 5,
  112: 4,
  113: 5,
  114: 6,
};
