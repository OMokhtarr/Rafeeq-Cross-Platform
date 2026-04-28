/**
 * PAGE VIEWER
 *
 * Renders the Madani Mushaf page-by-page. Verses are rendered glyph-by-glyph
 * by <MushafPage>; this component owns:
 *   - page navigation (arrows, surah picker, swipe)
 *   - the hamburger side drawer (surah list, search, settings, selection ops)
 *   - verse selection + hidden-verses orchestration via VerseVisibilityContext
 *
 * UX changes vs. the old toolbar:
 *   - Search and Settings buttons are no longer on the top toolbar — both
 *     live inside the hamburger drawer so the toolbar stays minimal.
 *   - The "view" (hide-all toggle) is replaced with a per-verse selection
 *     model. Tap or long-press a verse to select; selected verses can be
 *     hidden via the action bar at the bottom of the screen.
 *   - Hidden verses persist across page navigation, search jumps, and other
 *     viewer surfaces (MushafContextViewer) via VerseVisibilityContext.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { pageData } from "../../../data/quranData";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import MushafPage from "../../shared/components/mushaf-page/MushafPage";
import {
  getPage,
  prefetchPage,
  getKnownPageCeiling,
  surahNamesArabic,
  getSurahName,
} from "../../core/services/data/quran.service";
import { toHindiNumbers, removeDiacritics } from "../../core/utils/arabic.util";
import { useLang } from "../../core/context/LanguageContext";
import { useVerseVisibility } from "../../core/context/VerseVisibilityContext";
import "./PageViewer.css";

// ─── Types ────────────────────────────────────────────────────────────────────

import type { Verse } from "../../shared/models/verse.model";

interface SearchEntry extends Verse {
  normalizedText: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

const PageViewer: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { t, isRTL } = useLang();

  // Verse selection + hidden state lives in app-wide context so it survives
  // navigation, search jumps, and switches between PageViewer and the
  // MushafContextViewer used inside quizzes.
  const {
    selected,
    toggleSelected,
    clearSelection,
    selectionCount,
    hidden,
    showAll,
    hideSelected,
    hiddenCount,
  } = useVerseVisibility();

  // Read ?page=N from query string when navigating in (e.g. from SurahJuz)
  const initialPage = (() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    return Number.isFinite(raw) && raw >= 1 ? raw : 1;
  })();

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSurah, setSelectedSurah] = useState(1);

  // Drawer + nested panels (search/settings live INSIDE the drawer now,
  // not on the top toolbar). drawerOpen toggles the side sheet itself;
  // drawerView selects which panel inside the drawer is visible.
  const [drawerOpen, setDrawerOpen] = useState(false);
  type DrawerView = "menu" | "search" | "settings";
  const [drawerView, setDrawerView] = useState<DrawerView>("menu");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchEntry[]>([]);
  const [highlightedVerse, setHighlightedVerse] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState("متوسط");
  const [fontType, setFontType] = useState("أميري");
  const [, setWorkerReady] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWorkerRef = useRef<Worker | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // pageData has 606 entries (index 0 unused, 1..604 real pages, 605 is the
  // exclusive end-marker [115, 1]). Real Mushaf pages: 1..604.
  const totalPages = 604;

  // ── Search worker ─────────────────────────────────────────────────────────
  useEffect(() => {
    const worker = new Worker(
      new URL("../../../workers/search.worker.ts", import.meta.url),
    );
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === "INDEX_READY") setWorkerReady(true);
      if (e.data.type === "RESULTS") setSearchResults(e.data.results);
    };
    searchWorkerRef.current = worker;
    const seedWorker = async () => {
      const allVerses: SearchEntry[] = [];
      for (let page = 1; page <= totalPages; page++) {
        const pv = await getPage(page);
        if (!pv.length) {
          // Either rejected by the page-range guard or 404 ceiling reached.
          // Either way, no point in continuing past this point this session.
          if (getKnownPageCeiling() !== null) break;
          continue;
        }
        pv.forEach((v) =>
          allVerses.push({ ...v, normalizedText: removeDiacritics(v.text) }),
        );
      }
      worker.postMessage({ type: "BUILD_INDEX", verses: allVerses });
    };
    seedWorker();
    return () => worker.terminate();
  }, [totalPages]);

  // ── Sync currentPage with ?page= query param on navigation ───────────────
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    if (Number.isFinite(raw) && raw >= 1 && raw !== currentPage) {
      setCurrentPage(raw);
    }
  }, [location.search]);

  // ── Load page verses (getPage already uses pageData internally) ───────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setVerses([]);

    getPage(currentPage).then((pageVerses) => {
      if (cancelled) return;
      if (!pageVerses.length) {
        // Page not served by the current credentials (prelive sandbox).
        // Fall back to the last known-good page so the reader isn't blank.
        const ceiling = getKnownPageCeiling();
        if (ceiling !== null && currentPage > ceiling) {
          setCurrentPage(ceiling);
          return;
        }
      }
      setVerses(pageVerses);
      setLoading(false);
      setHighlightedVerse(null);
      prefetchPage(currentPage - 1);
      prefetchPage(currentPage + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  // Auto-focus the search input when the drawer flips to the search view.
  useEffect(() => {
    if (drawerOpen && drawerView === "search" && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [drawerOpen, drawerView]);

  // Lock body scroll while the drawer is open (mobile feels broken otherwise).
  useEffect(() => {
    if (drawerOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [drawerOpen]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const getSurahStartPage = (surahIndex: number): number => {
    for (let page = 1; page < pageData.length; page++) {
      const [sura, aya] = pageData[page];
      if (sura === surahIndex && aya === 1) return page;
    }
    return 1;
  };

  const handleSurahChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const surah = parseInt(e.target.value);
    setSelectedSurah(surah);
    setCurrentPage(getSurahStartPage(surah));
  };

  const goToPrevious = useCallback(() => {
    setCurrentPage((p) => (p > 1 ? p - 1 : p));
  }, []);
  const goToNext = useCallback(() => {
    setCurrentPage((p) => (p < totalPages ? p + 1 : p));
  }, [totalPages]);

  const getPageInfo = () => {
    if (currentPage < 1 || currentPage > totalPages) return null;
    const [suraIndex] = pageData[currentPage];
    return {
      sura: suraIndex,
      suraName: getSurahName(suraIndex, "english"),
      suraNameAr: surahNamesArabic[suraIndex] ?? `سورة ${suraIndex}`,
      juz: Math.ceil(currentPage / 20),
      hizb: Math.ceil(currentPage / 4),
    };
  };

  const pageInfo = getPageInfo();
  // Bismillah shown when the page starts at aya 1 of any surah except surah 9
  const isSurahStart =
    verses.length > 0 && verses[0].aya === 1 && verses[0].sura !== 9;

  // Drawer open/close helpers — keep nested panels reset.
  const openDrawer = (view: DrawerView = "menu") => {
    setDrawerView(view);
    setDrawerOpen(true);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setDrawerView("menu");
    clearSearch();
  };

  // ── Search ────────────────────────────────────────────────────────────────
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim() || !searchWorkerRef.current) {
      setSearchResults([]);
      return;
    }
    searchWorkerRef.current.postMessage({ type: "SEARCH", query: searchQuery });
  };

  const handleResultClick = (result: SearchEntry) => {
    setCurrentPage(result.page);
    closeDrawer();
    setHighlightedVerse(`${result.sura}:${result.aya}`);
    setTimeout(() => setHighlightedVerse(null), 3000);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
  };

  // ── Selection / hide actions ─────────────────────────────────────────────
  // Tap (or long-press) a verse → toggle membership in the selection set.
  const handleVerseTap = useCallback(
    (key: string) => {
      // Tapping a hidden verse is the natural gesture to bring it back —
      // it's already excluded from selection visually, so we simply toggle
      // selection on it; the user can then "Show selected" from the action
      // bar. (Or use Show all from the drawer.)
      toggleSelected(key);
    },
    [toggleSelected],
  );

  // ── Swipe ─────────────────────────────────────────────────────────────────
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    if (Math.abs(dx) > 50 && Math.abs(dx) > dy * 1.5) {
      if (dx > 0) goToNext();
      else goToPrevious();
    }
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div className="mushaf-container">
          {/* ── Toolbar (slimmed: hamburger + page nav + surah; no search/settings) ── */}
          <div className="top-toolbar">
            <div className="toolbar-left">
              <button
                className="toolbar-button menu-button"
                onClick={() => openDrawer("menu")}
                title={t.mushaf.juz}
                aria-label="القائمة"
              >
                <svg
                  className="menu-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
              <div className="page-navigation-compact">
                <button
                  onClick={goToPrevious}
                  disabled={currentPage === 1}
                  className="nav-arrow prev"
                  aria-label={t.mushaf.page}
                >
                  {isRTL ? "←" : "→"}
                </button>
                <span className="page-indicator">
                  <span className="page-label">{t.mushaf.page}</span>
                  <span className="page-number">
                    {toHindiNumbers(currentPage)}
                  </span>
                </span>
                <button
                  onClick={goToNext}
                  disabled={currentPage === totalPages}
                  className="nav-arrow next"
                  aria-label={t.mushaf.page}
                >
                  {isRTL ? "→" : "←"}
                </button>
              </div>
            </div>

            <div className="toolbar-center">
              <div className="surah-info">
                <span className="surah-name-arabic">
                  {pageInfo?.suraNameAr}
                </span>
                <span className="surah-name-latin">{pageInfo?.suraName}</span>
              </div>
              <div className="page-metadata">
                <span className="metadata-item">
                  <span className="metadata-label">{t.mushaf.page}</span>
                  <span className="metadata-value">
                    {toHindiNumbers(currentPage)}
                  </span>
                </span>
                <span className="metadata-separator">|</span>
                <span className="metadata-item">
                  <span className="metadata-label">{t.mushaf.juz}</span>
                  <span className="metadata-value">
                    {toHindiNumbers(pageInfo?.juz ?? 0)}
                  </span>
                </span>
                <span className="metadata-separator">|</span>
                <span className="metadata-item">
                  <span className="metadata-label">{t.mushaf.hizb}</span>
                  <span className="metadata-value">
                    {toHindiNumbers(pageInfo?.hizb ?? 0)}
                  </span>
                </span>
              </div>
            </div>

            {/* Right side intentionally minimal — search & settings moved
                into the hamburger drawer per redesign. The Arabic surah
                quick-select stays in the DOM (hidden by CSS) for any
                legacy code referencing #surah-quick-select. */}
            <div className="toolbar-right">
              <select
                className="surah-quick-select"
                value={selectedSurah}
                onChange={handleSurahChange}
              >
                {surahNamesArabic.slice(1, 115).map((name, i) => (
                  <option key={i + 1} value={i + 1}>
                    {i + 1}. {name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ── Mushaf Content ── */}
          <div
            className="mushaf-content mushaf-content-with-nav"
            ref={contentRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
          >
            {loading ? (
              <div className="mushaf-loading">
                <div className="loading-spinner" />
                <p>{t.mushaf.loading}</p>
              </div>
            ) : (
              <div className="mushaf-page">
                {/* QPC V1 page-perfect rendering. Bismillah is drawn by the
                    component using the QCF_BSML font. Selection + hide are
                    driven by the VerseVisibilityContext sets. */}
                <MushafPage
                  page={currentPage}
                  verses={verses}
                  showBismillah={isSurahStart}
                  selected={selected}
                  hidden={hidden}
                  onVerseTap={handleVerseTap}
                  target={
                    highlightedVerse
                      ? {
                          sura: parseInt(highlightedVerse.split(":")[0]),
                          aya: parseInt(highlightedVerse.split(":")[1]),
                        }
                      : undefined
                  }
                />

                {/* Footer — kept for hizb indicator below the Mushaf page. */}
                <div className="page-footer">
                  {t.mushaf.hizb} {toHindiNumbers(Math.ceil(currentPage / 4))}
                </div>
              </div>
            )}
          </div>

          {/* ── Selection action bar ─────────────────────────────────────
              Slides up only when the user has actually selected verses,
              so it never gets in the way of normal reading. */}
          {selectionCount > 0 && (
            <div
              className="selection-bar"
              role="toolbar"
              aria-label="إجراءات التحديد"
            >
              <span className="selection-count">
                {toHindiNumbers(selectionCount)} آية محددة
              </span>
              <div className="selection-actions">
                <button
                  className="sel-btn sel-btn-primary"
                  onClick={hideSelected}
                  title="إخفاء الآيات المحددة"
                >
                  إخفاء
                </button>
                <button
                  className="sel-btn"
                  onClick={clearSelection}
                  title="إلغاء التحديد"
                >
                  إلغاء التحديد
                </button>
              </div>
            </div>
          )}

          {/* ── Persistent bottom navigation (Home + tabs) ── */}
          <BottomNavBar active="quran" />

          {/* ── Side drawer (hamburger menu) ─────────────────────────────
              Hosts: surah/juz quick-jump, search, settings link, and the
              hidden-verses controls. Search & Settings used to be on the
              top toolbar; per redesign they now live here. */}
          {drawerOpen && (
            <>
              <div
                className="drawer-backdrop"
                onClick={closeDrawer}
                aria-hidden="true"
              />
              <aside
                className={`side-drawer ${drawerView === "search" ? "drawer-search-mode" : ""}`}
                role="dialog"
                aria-label="القائمة الجانبية"
              >
                <header className="drawer-header">
                  {drawerView !== "menu" && (
                    <button
                      className="drawer-back"
                      onClick={() => {
                        setDrawerView("menu");
                        clearSearch();
                      }}
                      aria-label="رجوع"
                    >
                      ›
                    </button>
                  )}
                  <h3 className="drawer-title">
                    {drawerView === "menu" && "القائمة"}
                    {drawerView === "search" && "بحث في القرآن"}
                    {drawerView === "settings" && "الإعدادات"}
                  </h3>
                  <button
                    className="drawer-close"
                    onClick={closeDrawer}
                    aria-label="إغلاق"
                  >
                    ✕
                  </button>
                </header>

                <div className="drawer-body">
                  {drawerView === "menu" && (
                    <nav className="drawer-menu">
                      <button
                        className="drawer-item"
                        onClick={() => {
                          closeDrawer();
                          history.push("/surah-juz");
                        }}
                      >
                        <span className="drawer-item-icon" aria-hidden>
                          ☰
                        </span>
                        <span className="drawer-item-label">
                          السور والأجزاء
                        </span>
                      </button>

                      <button
                        className="drawer-item"
                        onClick={() => setDrawerView("search")}
                      >
                        <span className="drawer-item-icon" aria-hidden>
                          🔍
                        </span>
                        <span className="drawer-item-label">بحث</span>
                      </button>

                      <button
                        className="drawer-item"
                        onClick={() => setDrawerView("settings")}
                      >
                        <span className="drawer-item-icon" aria-hidden>
                          ⚙
                        </span>
                        <span className="drawer-item-label">الإعدادات</span>
                      </button>

                      <div className="drawer-divider" />

                      {/* Hidden-verses controls. Tapping individual verses
                          in the page selects them; hiding/clearing is
                          available either via the floating selection bar
                          or here in the drawer for "show all hidden". */}
                      <button
                        className="drawer-item"
                        onClick={() => {
                          hideSelected();
                          closeDrawer();
                        }}
                        disabled={selectionCount === 0}
                      >
                        <span className="drawer-item-icon" aria-hidden>
                          ◐
                        </span>
                        <span className="drawer-item-label">
                          إخفاء الآيات المحددة
                          {selectionCount > 0 &&
                            ` (${toHindiNumbers(selectionCount)})`}
                        </span>
                      </button>

                      <button
                        className="drawer-item"
                        onClick={() => {
                          clearSelection();
                        }}
                        disabled={selectionCount === 0}
                      >
                        <span className="drawer-item-icon" aria-hidden>
                          ⊘
                        </span>
                        <span className="drawer-item-label">
                          إلغاء التحديد
                        </span>
                      </button>

                      <button
                        className="drawer-item drawer-item-warn"
                        onClick={() => {
                          showAll();
                        }}
                        disabled={hiddenCount === 0}
                      >
                        <span className="drawer-item-icon" aria-hidden>
                          👁
                        </span>
                        <span className="drawer-item-label">
                          إظهار كل الآيات المخفية
                          {hiddenCount > 0 &&
                            ` (${toHindiNumbers(hiddenCount)})`}
                        </span>
                      </button>
                    </nav>
                  )}

                  {drawerView === "search" && (
                    <div className="drawer-search">
                      <form onSubmit={handleSearch} className="search-form">
                        <input
                          ref={searchInputRef}
                          type="text"
                          placeholder="ابحث في القرآن الكريم (بدون تشكيل)..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            if (!e.target.value.trim()) setSearchResults([]);
                          }}
                          className="search-input"
                        />
                        <div className="search-form-actions">
                          <button type="submit" className="search-submit">
                            بحث
                          </button>
                          {searchQuery && (
                            <button
                              type="button"
                              className="search-clear"
                              onClick={clearSearch}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </form>
                      {searchResults.length > 0 && (
                        <div className="search-results">
                          <div className="results-header">
                            <span>
                              نتائج البحث: {toHindiNumbers(searchResults.length)}
                            </span>
                          </div>
                          <div className="results-list">
                            {searchResults.map((r, i) => (
                              <div
                                key={`${r.sura}-${r.aya}-${i}`}
                                className="result-item"
                                onClick={() => handleResultClick(r)}
                              >
                                <div className="result-main">
                                  <span className="result-surah">
                                    {r.suraNameAr}
                                  </span>
                                  <span className="result-verse">
                                    الآية {toHindiNumbers(r.aya)}
                                  </span>
                                </div>
                                <div className="result-meta">
                                  <span className="result-page">
                                    صفحة {toHindiNumbers(r.page)}
                                  </span>
                                  <span className="result-preview">
                                    {r.text?.length > 50
                                      ? r.text.substring(0, 50) + "..."
                                      : r.text}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {searchQuery && searchResults.length === 0 && (
                        <div className="no-results">
                          <p>لا توجد نتائج لـ "{searchQuery}"</p>
                        </div>
                      )}
                    </div>
                  )}

                  {drawerView === "settings" && (
                    <div className="drawer-settings">
                      <div className="setting-item">
                        <label>حجم الخط</label>
                        <select
                          className="setting-select"
                          value={fontSize}
                          onChange={(e) => setFontSize(e.target.value)}
                        >
                          <option>صغير</option>
                          <option>متوسط</option>
                          <option>كبير</option>
                          <option>كبير جداً</option>
                        </select>
                      </div>
                      <div className="setting-item">
                        <label>نوع الخط</label>
                        <select
                          className="setting-select"
                          value={fontType}
                          onChange={(e) => setFontType(e.target.value)}
                        >
                          <option>أميري</option>
                          <option>تقليدي</option>
                          <option>عثمان</option>
                          <option>نسخ</option>
                        </select>
                      </div>
                      <button
                        className="drawer-item"
                        onClick={() => {
                          closeDrawer();
                          history.push("/settings");
                        }}
                      >
                        <span className="drawer-item-icon" aria-hidden>
                          ⚙
                        </span>
                        <span className="drawer-item-label">
                          المزيد من الإعدادات
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </aside>
            </>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PageViewer;
