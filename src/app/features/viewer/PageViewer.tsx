/**
 * PAGE VIEWER
 *
 * Renders the Madani Mushaf page-by-page. Verses are rendered glyph-by-glyph
 * by <MushafPage>; this component owns:
 *   - page navigation (arrows, surah picker, swipe)
 *   - the slide‑up playback sheet (instead of navigating away)
 *   - per‑verse recitation playback
 *   - the hamburger side drawer (surah list, search, settings, selection ops)
 *   - optional translation panel under each verse
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IonPage, IonContent, useIonToast } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import MushafPage from "../../shared/components/mushaf-page/MushafPage";
import { getPage, prefetchPage } from "../../core/services/data/quran.service";
import {
  getSuraForPage,
  getSurahNameArabic,
  getChapters,
  estimatePageForVerse,
  getSurahStartPage,
  getSurahNameEnglish,
} from "../../core/services/data/metadata.service";
import { toHindiNumbers } from "../../core/utils/arabic.util";
import { useLang } from "../../core/context/LanguageContext";
import { useVerseVisibility } from "../../core/context/VerseVisibilityContext";
import { usePlayback } from "../../core/context/PlaybackContext";
import { useAudioPlayer } from "../../core/hooks/useAudioPlayer";
import { useImmersiveMode } from "../../core/hooks/useImmersiveMode";
import { useWakeLock } from "../../core/hooks/useWakeLock";
import VerseActionSheet from "../../shared/components/verse-action-sheet/VerseActionSheet";
import { isPageBookmarked, recordActivityDay } from "../../core/services/api/user-api.client";
import { readSelectedMushaf } from "../../core/services/data/quran.service";
import PlaybackSettings from "../playback/PlaybackSettings";
import type { Verse } from "../../shared/models/verse.model";
import "./PageViewer.css";

// ─── Last-page persistence ────────────────────────────────────────────────────
const LAST_PAGE_KEY = "rafiq_last_page_v1";
function saveLastPage(page: number) {
  try { localStorage.setItem(LAST_PAGE_KEY, String(page)); } catch {}
}
function loadLastPage(): number | null {
  try {
    const raw = localStorage.getItem(LAST_PAGE_KEY);
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 1 && n <= 604 ? n : null;
  } catch { return null; }
}

// ─── Settings helpers ─────────────────────────────────────────────────────────
const SETTINGS_KEY = "rafiq_settings_v1";

interface ReadSettings {
  reciter: string;
  soundEffects: boolean;
  translation: string;
  showTranslation: boolean;
}

function readSettings(): ReadSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        reciter: s.reciter ?? "4",
        soundEffects: s.soundEffects ?? true,
        translation: s.translation ?? "",
        showTranslation: s.showTranslation ?? false,
      };
    }
  } catch {}
  return {
    reciter: "4",
    soundEffects: true,
    translation: "",
    showTranslation: false,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const PageViewer: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { t, lang, isRTL } = useLang();
  const [presentToast] = useIonToast();

  const { selected, hidden, hideMany, showVerse, showAll, hiddenCount } =
    useVerseVisibility();

  const initialPage = (() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    if (Number.isFinite(raw) && raw >= 1) return raw;
    return loadLastPage() ?? 1;
  })();

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [nextPageFirstVerse, setNextPageFirstVerse] = useState<{ sura: number; aya: number } | null>(null);
  const [loading, setLoading] = useState(true);

  // Activity tracking: record time spent on each page for streak purposes
  const pageEntryTime = useRef<number>(Date.now());
  const pageVersesRef = useRef<Verse[]>([]);

  // Shared playback queue
  const queue = usePlayback();
  const showPlaybackBar = queue.state.currentVerse !== null;

  // Long‑press / short‑tap on the play button
  const [reciteMode, setReciteMode] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [playbackSheetOpen, setPlaybackSheetOpen] = useState(false);
  const sheetOpenTimeRef = useRef<number>(0);

  const handlePlayPressStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      setReciteMode((m) => !m);
      queue.stop();
      longPressTimerRef.current = null;
    }, 800);
  }, [queue]);

  const handlePlayPressEnd = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      if (reciteMode) {
        presentToast({ message: t.tabs.comingSoon, duration: 2000, position: "bottom" });
      } else {
        sheetOpenTimeRef.current = Date.now();
        setPlaybackSheetOpen(true);
      }
    }
  }, [reciteMode, presentToast, t.tabs.comingSoon]);

  // playbackVerse: static grey highlight tracking the currently playing verse
  const [playbackVerse, setPlaybackVerse] = useState<string | null>(null);
  // flashVerse: transient flash used for bookmark / URL navigation jumps
  const [flashVerse, setFlashVerse] = useState<string | null>(null);
  const [greenVerse, setGreenVerse] = useState<string | null>(null);

  const lastPlaybackVerse = useRef<string | null>(null);

  // Keep playback highlight in sync with the active verse, auto-navigate page.
  useEffect(() => {
    const v = queue.state.currentVerse;
    if (!v || (!queue.state.isPlaying && !queue.state.isLoading)) {
      if (lastPlaybackVerse.current !== null) {
        setPlaybackVerse(null);
        lastPlaybackVerse.current = null;
      }
      return;
    }
    if (v === lastPlaybackVerse.current) return;
    lastPlaybackVerse.current = v;
    setPlaybackVerse(v);
    setPlaybackSheetOpen(false);
    const [suraStr, ayaStr] = v.split(":");
    const targetPage = estimatePageForVerse(parseInt(suraStr, 10), parseInt(ayaStr, 10));
    if (targetPage && targetPage !== currentPage) {
      setCurrentPage(targetPage);
    }
  }, [queue.state.currentVerse, queue.state.isPlaying, queue.state.isLoading]);

  const [settings, setSettings] = useState<ReadSettings>(readSettings);

  const audio = useAudioPlayer();
  const [sheetVerseKey, setSheetVerseKey] = useState<string | null>(null);
  const immersive = useImmersiveMode();
  useWakeLock();

  const pageVerseKeyForBookmark =
    verses.length > 0 ? `${verses[0].sura}:${verses[0].aya}` : null;
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    if (pageVerseKeyForBookmark) {
      setBookmarked(isPageBookmarked(pageVerseKeyForBookmark));
    }
  }, [pageVerseKeyForBookmark]);

  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const pendingGreenForPage = useRef<number | null>(null);

  const totalPages = 604;

  useEffect(() => {
    const onFocus = () => setSettings(readSettings());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Fire activity day when user navigates away from the viewer
  useEffect(() => {
    return () => {
      const prevVerses = pageVersesRef.current;
      const elapsed = Math.round((Date.now() - pageEntryTime.current) / 1000);
      if (prevVerses.length > 0 && elapsed >= 10) {
        const first = prevVerses[0];
        const last  = prevVerses[prevVerses.length - 1];
        const range = `${first.sura}:${first.aya}-${last.sura}:${last.aya}`;
        const mushafKind = readSelectedMushaf();
        const mushafId = QF_MUSHAF_IDS[mushafKind] ?? 2;
        recordActivityDay([range], elapsed, mushafId);
      }
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    if (Number.isFinite(raw) && raw >= 1 && raw !== currentPage) {
      setCurrentPage(raw);
    }
    const v = params.get("v");
    if (v && /^\d+:\d+$/.test(v)) {
      setFlashVerse(v);
      const tid = setTimeout(() => setFlashVerse(null), 3000);
      return () => clearTimeout(tid);
    }
  }, [location.search]);

  // Maps our internal mushaf kind to the QF numeric mushafId (integers only)
  const QF_MUSHAF_IDS: Record<string, number> = {
    qpc_v4_tajweed: 2,
    uthmani:        1,
    indopak:        4,
    imlaei:         3,
  };

  useEffect(() => {
    // Fire activity day for the page we're leaving (if user spent ≥10 s on it)
    const prevVerses = pageVersesRef.current;
    const elapsed = Math.round((Date.now() - pageEntryTime.current) / 1000);
    if (prevVerses.length > 0 && elapsed >= 10) {
      const first = prevVerses[0];
      const last  = prevVerses[prevVerses.length - 1];
      const range = `${first.sura}:${first.aya}-${last.sura}:${last.aya}`;
      const mushafKind = readSelectedMushaf();
      const mushafId = QF_MUSHAF_IDS[mushafKind] ?? 2;
      recordActivityDay([range], elapsed, mushafId);
    }

    // Reset timer for the new page
    pageEntryTime.current = Date.now();
    pageVersesRef.current = [];

    saveLastPage(currentPage);
    let cancelled = false;
    setLoading(true);
    setVerses([]);
    getPage(currentPage).then((pageVerses) => {
      if (cancelled) return;
      if (!pageVerses.length) {
        setLoading(false);
        return;
      }
      pageVersesRef.current = pageVerses;
      setVerses(pageVerses);
      setLoading(false);
      if (
        pendingGreenForPage.current === currentPage &&
        pageVerses.length > 0
      ) {
        const firstKey = `${pageVerses[0].sura}:${pageVerses[0].aya}`;
        if (hidden.has(firstKey)) showVerse(firstKey);
        setGreenVerse(firstKey);
        pendingGreenForPage.current = null;
      } else {
        setGreenVerse(null);
      }
      prefetchPage(currentPage - 1);
      prefetchPage(currentPage + 1);
      if (currentPage < totalPages) {
        getPage(currentPage + 1).then((nextVerses) => {
          if (cancelled) return;
          const first = nextVerses[0] ?? null;
          setNextPageFirstVerse(first ? { sura: first.sura, aya: first.aya } : null);
        }).catch(() => {});
      } else {
        setNextPageFirstVerse(null);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  useEffect(() => {
    if (sheetVerseKey) immersive.showChrome();
  }, [sheetVerseKey, immersive]);

  // Tracks whether the user has explicitly paused; reset only when playback fully stops
  const [userPaused, setUserPaused] = useState(false);
  useEffect(() => {
    if (!queue.state.currentVerse) setUserPaused(false);
  }, [queue.state.currentVerse]);

  // Playback bar controls
  const handlePlayPause = useCallback(() => {
    if (queue.state.isPlaying) {
      setUserPaused(true);
      queue.pause();
    } else {
      setUserPaused(false);
      queue.resume().catch(() => {});
    }
  }, [queue]);
  const handleStop = useCallback(() => {
    queue.stop();
  }, [queue]);
  const handlePrev = useCallback(() => {
    queue.prev();
  }, [queue]);
  const handleNext = useCallback(() => {
    queue.next();
  }, [queue]);

  const goToPrevious = useCallback(() => {
    setCurrentPage((p) => (p > 1 ? p - 1 : p));
  }, []);
  const goToNext = useCallback(() => {
    setCurrentPage((p) => (p < totalPages ? p + 1 : p));
  }, [totalPages]);

  const getPageInfo = () => {
    if (currentPage < 1 || currentPage > totalPages) return null;
    const suraIndex = getSuraForPage(currentPage) ?? 1;
    return {
      sura: suraIndex,
      suraName: getSurahNameEnglish(suraIndex),
      suraNameAr: getSurahNameArabic(suraIndex),
      juz: Math.ceil((currentPage * 30) / 604),
      hizb: Math.ceil((currentPage * 60) / 604),
      rub: Math.ceil((currentPage * 240) / 604),
    };
  };

  const pageInfo = getPageInfo();
  // Show bismillah at top when this page starts a surah (header was on prev page,
  // bismillah stays here — matching the printed Mushaf layout).
  const isSurahStart =
    verses.length > 0 &&
    verses[0].aya === 1 &&
    verses[0].sura !== 9 &&
    currentPage !== 1;

  const handleVerseLongPress = useCallback((key: string) => {
    setSheetVerseKey(key);
  }, []);
  const closeSheet = useCallback(() => {
    setSheetVerseKey(null);
    audio.stop();
  }, [audio]);

  const pageVerseKeys = verses.map((v) => `${v.sura}:${v.aya}`);
  const anyPageHidden = pageVerseKeys.some((k) => hidden.has(k));
  const togglePageHidden = useCallback(() => {
    if (anyPageHidden || hiddenCount > 0) {
      showAll();
      return;
    }
    const keys: string[] = [];
    for (const ch of getChapters()) {
      const count: number = ch.verses_count ?? 0;
      for (let a = 1; a <= count; a++) keys.push(`${ch.id}:${a}`);
    }
    if (keys.length > 0) hideMany(keys);
  }, [anyPageHidden, hiddenCount, hideMany, showAll]);

  const handleTouchStart = (e: React.TouchEvent) => {
    const x = e.touches[0].clientX;
    const y = e.touches[0].clientY;
    touchStartX.current = x;
    touchStartY.current = y;
    immersive.registerTouchStart(x, y, e.target);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - touchStartX.current;
    const dy = Math.abs(endY - touchStartY.current);
    const isSwipe = Math.abs(dx) > 50 && Math.abs(dx) > dy * 1.5;
    if (isSwipe) {
      if (dx > 0) goToNext();
      else goToPrevious();
    } else {
      immersive.maybeToggleOnTap(endX, endY);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    immersive.registerTouchStart(e.clientX, e.clientY, e.target);
  };
  const handleClick = (e: React.MouseEvent) => {
    immersive.maybeToggleOnTap(e.clientX, e.clientY);
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div
          className={`mushaf-container ${
            immersive.chromeVisible ? "" : "immersive"
          }`}
        >
          {/* ── Toolbar ── */}
          <div className="top-toolbar">
            <div className="toolbar-left">
              {!showPlaybackBar && (
                <button
                  type="button"
                  className={`toolbar-button play-button${
                    reciteMode ? " play-button--recite" : ""
                  }`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePlayPressStart();
                  }}
                  onPointerUp={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePlayPressEnd();
                  }}
                  onPointerLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handlePlayPressEnd();
                  }}
                  onClick={(e) => e.preventDefault()}
                  aria-label={reciteMode ? t.mushaf.micLabel : t.playback.title}
                >
                  {reciteMode ? (
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 1a4 4 0 014 4v7a4 4 0 01-8 0V5a4 4 0 014-4z" />
                      <path d="M19 10v2a7 7 0 01-14 0v-2" />
                      <line x1="12" y1="19" x2="12" y2="23" />
                      <line x1="8" y1="23" x2="16" y2="23" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>
              )}
              <button
                type="button"
                className={`toolbar-button hide-toggle-button ${
                  anyPageHidden ? "active" : ""
                }`}
                onClick={togglePageHidden}
                disabled={verses.length === 0}
                title={
                  anyPageHidden
                    ? t.mushaf.toggleShowTitle
                    : t.mushaf.toggleHideTitle
                }
                aria-label={
                  anyPageHidden
                    ? t.mushaf.toggleShowTitle
                    : t.mushaf.toggleHideTitle
                }
                aria-pressed={anyPageHidden}
              >
                {anyPageHidden ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58a2 2 0 002.83 2.83" />
                    <path d="M9.88 4.62A10.94 10.94 0 0112 4.5c5 0 9 4.5 10 7.5a13.16 13.16 0 01-3.05 4.36" />
                    <path d="M6.61 6.61C4.13 8.13 2.4 10.62 2 12c1 3 5 7.5 10 7.5a10.94 10.94 0 005.39-1.39" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M2 12s4-7.5 10-7.5S22 12 22 12s-4 7.5-10 7.5S2 12 2 12z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>

            {/* Center: playback bar when active, else surah info pill */}
            {showPlaybackBar ? (
              <div
                className="toolbar-playback-bar"
                aria-label="Playback controls"
              >
                <button
                  className="toolbar-button playback-nav"
                  onClick={isRTL ? handleNext : handlePrev}
                  aria-label="Previous"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <polygon points="19 5 9 12 19 19" />
                    <line x1="5" y1="5" x2="5" y2="19" />
                  </svg>
                </button>
                <button
                  className="toolbar-button playback-play"
                  onClick={handlePlayPause}
                  aria-label={
                    queue.state.isPlaying || (!userPaused && !!queue.state.currentVerse) ? t.mushaf.pause : t.mushaf.play
                  }
                >
                  {queue.state.isPlaying || (!userPaused && !!queue.state.currentVerse) ? (
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="currentColor"
                      stroke="none"
                    >
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="currentColor"
                      stroke="none"
                    >
                      <polygon points="6 4 20 12 6 20" />
                    </svg>
                  )}
                </button>
                <button
                  className="toolbar-button playback-nav"
                  onClick={isRTL ? handlePrev : handleNext}
                  aria-label="Next"
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <polygon points="5 19 15 12 5 5" />
                    <line x1="19" y1="5" x2="19" y2="19" />
                  </svg>
                </button>
                <button
                  className="toolbar-button playback-stop"
                  onClick={handleStop}
                  aria-label={t.mushaf.stopLabel}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="currentColor"
                    stroke="none"
                  >
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                </button>
                <div className="playback-bar-divider" aria-hidden="true" />
                <button
                  className="toolbar-button playback-settings"
                  onClick={() => {
                    sheetOpenTimeRef.current = Date.now();
                    setPlaybackSheetOpen(true);
                  }}
                  aria-label={t.playback.title}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="5 15 12 8 19 15" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="toolbar-center-pill"
                onClick={() => history.push(`/surah-juz?page=${currentPage}`)}
                aria-label={t.mushaf.surahsAndJuz}
              >
                <span className="pill-surah-row">
                  <span className="pill-surah">{pageInfo?.suraNameAr}</span>
                  <span className="pill-surah-en">{pageInfo?.suraName}</span>
                </span>
                <span className="pill-meta">
                  <span>
                    {t.mushaf.page}{" "}
                    {lang === "ar" ? toHindiNumbers(currentPage) : currentPage}
                  </span>
                  <span className="pill-sep" aria-hidden>
                    |
                  </span>
                  <span>
                    {t.mushaf.juz}{" "}
                    {lang === "ar"
                      ? toHindiNumbers(pageInfo?.juz ?? 0)
                      : pageInfo?.juz ?? 0}
                  </span>
                  <span className="pill-sep" aria-hidden>
                    |
                  </span>
                  <span>
                    {t.mushaf.hizb}{" "}
                    {lang === "ar"
                      ? toHindiNumbers(pageInfo?.hizb ?? 0)
                      : pageInfo?.hizb ?? 0}
                  </span>
                </span>
              </button>
            )}

            <div className="toolbar-right">
              <button
                type="button"
                className={`toolbar-button bookmark-button${
                  bookmarked ? " bookmark-button--active" : ""
                }`}
                onClick={() => history.push("/bookmarks")}
                title="Bookmarks"
                aria-label="Bookmarks"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill={bookmarked ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>
              <button
                type="button"
                className="toolbar-button search-button"
                onClick={() => history.push("/search")}
                title={t.mushaf.search}
                aria-label={t.mushaf.search}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="22"
                  height="22"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </button>
            </div>
          </div>

          {/* ── Mushaf Content ── */}
          <div
            className="mushaf-content"
            ref={contentRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
          >
            <div className="page-edge-top" data-no-immersive>
              <span className="page-edge-surah">
                {lang === "ar" ? pageInfo?.suraNameAr : pageInfo?.suraName}
              </span>
              <span className="page-edge-meta">
                <span>
                  {t.mushaf.juz}{" "}
                  {lang === "ar"
                    ? toHindiNumbers(pageInfo?.juz ?? 0)
                    : pageInfo?.juz ?? 0}
                </span>
                <span className="page-edge-dot" aria-hidden>
                  •
                </span>
                <span>
                  {t.mushaf.hizb}{" "}
                  {lang === "ar"
                    ? toHindiNumbers(pageInfo?.hizb ?? 0)
                    : pageInfo?.hizb ?? 0}
                </span>
              </span>
            </div>

            {loading ? (
              <div className="mushaf-loading">
                <div className="loading-spinner" />
                <p>{t.mushaf.loading}</p>
              </div>
            ) : (
              <div className="mushaf-page">
                <MushafPage
                  page={currentPage}
                  verses={verses}
                  nextPageFirstVerse={nextPageFirstVerse}
                  selected={selected}
                  hidden={hidden}
                  green={greenVerse ? new Set([greenVerse]) : undefined}
                  onVerseLongPress={handleVerseLongPress}
                  target={
                    playbackVerse
                      ? {
                          sura: parseInt(playbackVerse.split(":")[0]),
                          aya: parseInt(playbackVerse.split(":")[1]),
                        }
                      : undefined
                  }
                  flash={
                    flashVerse
                      ? {
                          sura: parseInt(flashVerse.split(":")[0]),
                          aya: parseInt(flashVerse.split(":")[1]),
                        }
                      : undefined
                  }
                />
              </div>
            )}

            <div
              className={`page-edge-bottom ${
                currentPage % 2 === 1 ? "align-end" : "align-start"
              }`}
              data-no-immersive
            >
              {lang === "ar" ? toHindiNumbers(currentPage) : currentPage}
            </div>
          </div>

          <BottomNavBar active="quran" />

          {/* ── Verse action sheet (long‑press) ── */}
          <VerseActionSheet
            open={!!sheetVerseKey}
            verseKey={sheetVerseKey}
            pageVerseKeys={verses.map((v) => `${v.sura}:${v.aya}`)}
            page={currentPage}
            translationId={settings.translation}
            onClose={closeSheet}
          />

          {/* ── Slide‑up playback sheet ── */}
          {playbackSheetOpen && (
            <div
              className="playback-sheet"
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 200,
              }}
            >
              {/* Backdrop – only closes on direct tap, not bubbled events, and not the same gesture that opened it */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(0,0,0,0.5)",
                }}
                onPointerDown={(e) => {
                  if (
                    e.target === e.currentTarget &&
                    Date.now() - sheetOpenTimeRef.current > 300
                  ) {
                    setPlaybackSheetOpen(false);
                  }
                }}
              />
              {/* Sheet content – starts below the toolbar */}
              <div
                style={{
                  position: "absolute",
                  top: "56px", // height of .top-toolbar
                  bottom: 0,
                  width: "100%",
                  background: "var(--color-bg-content, #f7f7f8)",
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  overflow: "hidden",
                  animation: "slideUp 0.25s ease-out",
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <PlaybackSettings onClose={() => setPlaybackSheetOpen(false)} currentPage={currentPage} />
              </div>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PageViewer;
