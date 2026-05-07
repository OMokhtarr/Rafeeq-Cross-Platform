/**
 * PAGE VIEWER
 *
 * Renders the Madani Mushaf page-by-page. Verses are rendered glyph-by-glyph
 * by <MushafPage>; this component owns:
 *   - page navigation (arrows, surah picker, swipe)
 *   - the hamburger side drawer (surah list, search, settings, selection ops)
 *   - server-side search via the Foundation API (now through SDK)
 *   - per-verse recitation playback
 *   - optional translation panel under each verse
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IonPage, IonContent } from "@ionic/react";
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
import VerseActionSheet from "../../shared/components/verse-action-sheet/VerseActionSheet";
import { isPageBookmarked } from "../../core/services/api/user-api.client";
import type { Verse } from "../../shared/models/verse.model";
import "./PageViewer.css";

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
        reciter: s.reciter ?? "husary",
        soundEffects: s.soundEffects ?? true,
        translation: s.translation ?? "",
        showTranslation: s.showTranslation ?? false,
      };
    }
  } catch {}
  return {
    reciter: "husary",
    soundEffects: true,
    translation: "",
    showTranslation: false,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

const PageViewer: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { t, lang } = useLang();

  const { selected, hidden, hideMany, showVerse, showAll, hiddenCount } =
    useVerseVisibility();

  const initialPage = (() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    return Number.isFinite(raw) && raw >= 1 ? raw : 1;
  })();

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);

  // Shared playback queue (lives in PlaybackContext so PlaybackSettings shares it)
  const queue = usePlayback();
  const isPlaying = queue.state.isPlaying || queue.state.isLoading;

  // Long-press on play button switches to recite (mic) mode
  const [reciteMode, setReciteMode] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePlayPressStart = useCallback(() => {
    longPressTimerRef.current = setTimeout(() => {
      setReciteMode((m) => !m);
      queue.stop();
      longPressTimerRef.current = null;
    }, 600);
  }, [queue]);

  const handlePlayPressEnd = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
      // Short tap — open playback settings (only when not already playing)
      if (!reciteMode) {
        history.push(`/playback?page=${currentPage}`);
      }
    }
  }, [reciteMode, currentPage, history]);

  const [highlightedVerse, setHighlightedVerse] = useState<string | null>(null);
  const [greenVerse, setGreenVerse] = useState<string | null>(null);

  const [settings, setSettings] = useState<ReadSettings>(readSettings);

  // Audio — owned here so opening/closing the action sheet shares one player.
  const audio = useAudioPlayer();

  // Verse action sheet (long-press → audio / translation / tafsir).
  const [sheetVerseKey, setSheetVerseKey] = useState<string | null>(null);

  // Immersive mode — tap the page to toggle toolbar + bottom nav.
  const immersive = useImmersiveMode();

  // Bookmark state — keyed by the first verse of the current page.
  const pageVerseKeyForBookmark =
    verses.length > 0 ? `${verses[0].sura}:${verses[0].aya}` : null;
  // Bookmark indicator — filled when the current page's first verse is saved.
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    if (pageVerseKeyForBookmark) {
      setBookmarked(isPageBookmarked(pageVerseKeyForBookmark));
    }
  }, [pageVerseKeyForBookmark]);

  // ── Refs ──
  const contentRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const pendingGreenForPage = useRef<number | null>(null);

  const totalPages = 604;

  // Re-read settings on focus (replaces drawer-close trigger)
  useEffect(() => {
    const onFocus = () => setSettings(readSettings());
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  // Sync currentPage with ?page= query param on navigation. Also honor a
  // `?v=sura:aya` param so deep-links from the search-results screen
  // ("Continue Reading") land with the verse briefly highlighted, the
  // same way a tap on an in-drawer search result behaves.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    if (Number.isFinite(raw) && raw >= 1 && raw !== currentPage) {
      setCurrentPage(raw);
    }
    const v = params.get("v");
    if (v && /^\d+:\d+$/.test(v)) {
      setHighlightedVerse(v);
      const tid = setTimeout(() => setHighlightedVerse(null), 3000);
      return () => clearTimeout(tid);
    }
  }, [location.search]);

  // ── Load page verses ──────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVerses([]);

    getPage(currentPage).then((pageVerses) => {
      if (cancelled) return;
      if (!pageVerses.length) {
        // If page not found, just show empty (or handle gracefully)
        setLoading(false);
        return;
      }
      setVerses(pageVerses);
      setLoading(false);
      setHighlightedVerse(null);
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
    });
    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  // Force chrome visible when the verse action sheet opens.
  useEffect(() => {
    if (sheetVerseKey) immersive.showChrome();
  }, [sheetVerseKey, immersive]);

  // ── Helpers ───────────────────────────────────────────────────────────────

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
  // Bismillah strip rules:
  //   - shown when the first verse on the page is aya 1 of a surah, EXCEPT
  //   - At-Tawbah (sura 9) — has no bismillah by tradition, AND
  //   - page 1 (Al-Fatihah) — its first verse already IS the bismillah, so
  //     rendering the strip on top would duplicate it.
  const isSurahStart =
    verses.length > 0 &&
    verses[0].aya === 1 &&
    verses[0].sura !== 9 &&
    currentPage !== 1;

  // ── Selection / hide ─────────────────────────────────────────────────────
  // Long-press → open verse action sheet
  const handleVerseLongPress = useCallback((key: string) => {
    setSheetVerseKey(key);
  }, []);
  const closeSheet = useCallback(() => {
    setSheetVerseKey(null);
    audio.stop();
  }, [audio]);

  // Hide-toggle (whole Mushaf). When pressed with nothing hidden, every verse
  // across all 604 pages goes hidden. When pressed with any hidden, show all.
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

  // Swipe (page turn) + tap (immersive toggle). The two share an origin
  // point: the swipe path runs first; if the gesture wasn't a horizontal
  // swipe past 50px we hand the coordinates to the immersive hook, which
  // applies its own 10px tap threshold and interactive-target check.
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
      // Not a swipe — let the hook decide if it was a tap worth toggling.
      immersive.maybeToggleOnTap(endX, endY);
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // Desktop: mouse equivalents. Mobile browsers also synthesise a click
  // ~300 ms after touchend, but because we already handled the gesture in
  // touchend (and reset the hook's start point), the click no-ops there.
  const handleMouseDown = (e: React.MouseEvent) => {
    immersive.registerTouchStart(e.clientX, e.clientY, e.target);
  };
  const handleClick = (e: React.MouseEvent) => {
    immersive.maybeToggleOnTap(e.clientX, e.clientY);
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
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
              {/* Play / Recite button — long-press toggles recite mode */}
              <button
                className={`toolbar-button play-button${
                  reciteMode ? " play-button--recite" : ""
                }`}
                onPointerDown={handlePlayPressStart}
                onPointerUp={handlePlayPressEnd}
                onPointerLeave={handlePlayPressEnd}
                aria-label={reciteMode ? t.mushaf.micLabel : t.playback.title}
              >
                {reciteMode ? (
                  /* Mic icon */
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
                  /* Play icon */
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

              {/* Stop button — only visible while playback is active */}
              {isPlaying && (
                <button
                  className="toolbar-button stop-button"
                  onClick={() => queue.stop()}
                  aria-label={t.mushaf.stopLabel}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="22"
                    height="22"
                    fill="currentColor"
                    stroke="none"
                    aria-hidden="true"
                  >
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                  </svg>
                </button>
              )}

              {/* Hide-toggle */}
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

            {/* Center pill — surah name (line 1) + Page/Juz/Hizb (line 2).
                Mirrors the reference design (rounded chip, two stacked
                lines). The same data is also rendered inside the page
                edges so it stays visible while in immersive mode. */}
            <button
              type="button"
              className="toolbar-center-pill"
              onClick={() => history.push("/surah-juz")}
              aria-label={t.mushaf.surahsAndJuz}
            >
              <span className="pill-surah">{pageInfo?.suraNameAr}</span>
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
                <span className="pill-sep" aria-hidden>
                  |
                </span>
                <span>
                  {"◆"}{" "}
                  {lang === "ar"
                    ? toHindiNumbers(pageInfo?.rub ?? 0)
                    : pageInfo?.rub ?? 0}
                </span>
              </span>
            </button>

            {/* Right side — bookmark + search icons */}
            <div className="toolbar-right">
              {/* Bookmark — opens the bookmarks page; icon fills when page is saved */}
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

              {/* Search */}
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

          {/* ── Mushaf Content ──
              Fills the whole viewport. The toolbar and bottom-nav now
              float over this surface, so toggling them never reflows the
              page. Two thin strips (page-edge-top / page-edge-bottom)
              live inside this container and stay visible at all times —
              they carry the metadata (surah, juz/hizb, page number) that
              the user still needs once the chrome is hidden. */}
          <div
            className="mushaf-content"
            ref={contentRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
          >
            <div className="page-edge-top" data-no-immersive>
              <span className="page-edge-surah">{pageInfo?.suraNameAr}</span>
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
                <span className="page-edge-dot" aria-hidden>
                  •
                </span>
                <span>
                  {"◆"}{" "}
                  {lang === "ar"
                    ? toHindiNumbers(pageInfo?.rub ?? 0)
                    : pageInfo?.rub ?? 0}
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
                  showBismillah={isSurahStart}
                  selected={selected}
                  hidden={hidden}
                  green={greenVerse ? new Set([greenVerse]) : undefined}
                  onVerseLongPress={handleVerseLongPress}
                  target={
                    highlightedVerse
                      ? {
                          sura: parseInt(highlightedVerse.split(":")[0]),
                          aya: parseInt(highlightedVerse.split(":")[1]),
                        }
                      : undefined
                  }
                />
              </div>
            )}

            {/* Page number alignment mirrors a printed Mushaf spread:
                odd pages anchor to the start side, even pages to the end. */}
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

          {/* ── Verse action sheet (long-press) ── */}
          <VerseActionSheet
            open={!!sheetVerseKey}
            verseKey={sheetVerseKey}
            pageVerseKeys={verses.map((v) => `${v.sura}:${v.aya}`)}
            page={currentPage}
            translationId={settings.translation}
            onClose={closeSheet}
          />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PageViewer;
