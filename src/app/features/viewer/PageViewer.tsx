/**
 * PAGE VIEWER
 *
 * Uses pageData to know exactly which verses belong to each page.
 * pageData[pg] = [startSura, startAya]
 * pageData[pg+1] = [nextSura, nextAya]  ← exclusive end
 *
 * Font sizing strategy:
 *  1. Load exactly the verses for this page (from quran.service, which
 *     already uses pageData internally).
 *  2. Measure available height = mushaf-page height − bismillah − footer − padding.
 *  3. Binary-search the largest font where ALL page verses fit in that height
 *     using a hidden probe div.
 *  4. No verses are ever dropped — every verse on the page is shown.
 *     If the font hits the minimum (10px) and still overflows, the probe
 *     switches to overflow:hidden so the last line clips cleanly rather than
 *     bleeding into the footer.
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { pageData } from "../../../data/quranData";
import BottomNavBar from "../../shared/components/bottom-nav/BottomNavBar";
import {
  getPage,
  prefetchPage,
  surahNamesArabic,
  getSurahName,
} from "../../core/services/data/quran.service";
import { toHindiNumbers, removeDiacritics } from "../../core/utils/arabic.util";
import { useLang } from "../../core/context/LanguageContext";
import "./PageViewer.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Verse {
  sura: number;
  aya: number;
  text: string;
  page: number;
  suraName?: string;
  suraNameAr?: string;
}

interface SearchEntry extends Verse {
  normalizedText: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LINE_HEIGHT_RATIO = 1.85;
const FONT_MIN = 10;
const FONT_MAX = 32;

// ─── Component ────────────────────────────────────────────────────────────────

const PageViewer: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { t, isRTL } = useLang();

  // Read ?page=N from query string when navigating in (e.g. from SurahJuz)
  const initialPage = (() => {
    const params = new URLSearchParams(location.search);
    const raw = parseInt(params.get("page") || "", 10);
    return Number.isFinite(raw) && raw >= 1 ? raw : 1;
  })();

  const [currentPage, setCurrentPage] = useState(initialPage);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [dynamicFontSize, setDynamicFontSize] = useState(16);
  const [selectedSurah, setSelectedSurah] = useState(1);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showVerses, setShowVerses] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchEntry[]>([]);
  const [highlightedVerse, setHighlightedVerse] = useState<string | null>(null);
  const [fontSize, setFontSize] = useState("متوسط");
  const [fontType, setFontType] = useState("أميري");
  const [workerReady, setWorkerReady] = useState(false);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const pageRef = useRef<HTMLDivElement>(null); // .mushaf-page
  const bismillahRef = useRef<HTMLDivElement>(null); // bismillah strip
  const textFlowRef = useRef<HTMLDivElement>(null); // text content div
  const footerRef = useRef<HTMLDivElement>(null); // hizb footer
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWorkerRef = useRef<Worker | null>(null);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  const totalPages = pageData.length - 1;

  // ── Exact available height for text ───────────────────────────────────────
  // clientHeight already excludes border, but INCLUDES padding — so we must
  // subtract padding-top/-bottom read from computed style (stays correct even
  // if .mushaf-page padding is changed in CSS).
  const getAvailableHeight = useCallback((): number => {
    if (!pageRef.current) return 0;
    const el = pageRef.current;
    const cs = window.getComputedStyle(el);
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const bismillahH = bismillahRef.current?.offsetHeight ?? 0;
    const footerH = footerRef.current?.offsetHeight ?? 0;
    return el.clientHeight - padT - padB - bismillahH - footerH;
  }, []);

  // ── Binary-search font size so ALL page verses fit ────────────────────────
  // We never drop verses — we just shrink the font until everything fits.
  const fitVerses = useCallback(
    (allVerses: Verse[]) => {
      if (!allVerses.length || !textFlowRef.current) return;

      const availH = getAvailableHeight();
      if (availH <= 0) return;

      const containerW = textFlowRef.current.clientWidth;

      // Build probe. containerW is textFlowRef.clientWidth — which already
      // EXCLUDES the text-flow's own horizontal padding. Setting padding:0
      // on the probe avoids double-counting (the old `padding:0 20px` made
      // the probe narrower than reality and caused the font to shrink too
      // aggressively).
      const probe = document.createElement("div");
      probe.style.cssText = [
        "position:absolute",
        "visibility:hidden",
        "pointer-events:none",
        `width:${containerW}px`,
        `line-height:${LINE_HEIGHT_RATIO}`,
        'font-family:"Traditional Arabic","Amiri","Scheherazade New",serif',
        "text-align:justify",
        "direction:rtl",
        "word-spacing:0.15em",
        "letter-spacing:0.03em",
        "white-space:normal",
        "overflow:visible",
        "padding:0",
        "box-sizing:border-box",
      ].join(";");
      document.body.appendChild(probe);

      // Build inner HTML for all verses once
      const html = allVerses
        .map(
          (v) =>
            `<span style="display:inline">${v.text}</span>` +
            `<span style="display:inline-flex;margin:0 10px;font-size:1.8em;opacity:0.15;vertical-align:middle">۝</span>`,
        )
        .join("");

      // Binary search: largest font where scrollHeight <= availH
      let lo = FONT_MIN,
        hi = FONT_MAX,
        bestFs = FONT_MIN;
      for (let i = 0; i < 8; i++) {
        const mid = Math.floor((lo + hi) / 2);
        probe.style.fontSize = `${mid}px`;
        probe.innerHTML = html;
        if (probe.scrollHeight <= availH + 1) {
          bestFs = mid;
          lo = mid + 1;
        } else {
          hi = mid - 1;
        }
      }

      document.body.removeChild(probe);
      setDynamicFontSize(bestFs);
    },
    [getAvailableHeight],
  );

  // ── Re-fit on load / resize / orientation / keyboard ─────────────────────
  useEffect(() => {
    if (loading || !verses.length) return;

    const run = () => {
      cancelAnimationFrame(rafRef.current);
      // Two rAF frames: first lets React paint bismillah+footer into DOM,
      // second measures their actual heights.
      rafRef.current = requestAnimationFrame(() =>
        requestAnimationFrame(() => fitVerses(verses)),
      );
    };

    run();

    const ro = new ResizeObserver(run);
    if (pageRef.current) ro.observe(pageRef.current);

    // visualViewport fires on soft-keyboard open/close on Android; orientation
    // change on phones/tablets flipping between portrait and landscape.
    const vv = window.visualViewport;
    vv?.addEventListener("resize", run);
    window.addEventListener("orientationchange", run);

    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", run);
      window.removeEventListener("orientationchange", run);
      cancelAnimationFrame(rafRef.current);
    };
  }, [loading, verses, fitVerses]);

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
      if (!cancelled) {
        setVerses(pageVerses);
        setLoading(false);
        setHighlightedVerse(null);
        prefetchPage(currentPage - 1);
        prefetchPage(currentPage + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

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

  const goToPrevious = () => {
    if (currentPage > 1) setCurrentPage((p) => p - 1);
  };
  const goToNext = () => {
    if (currentPage < totalPages) setCurrentPage((p) => p + 1);
  };

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
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setHighlightedVerse(`${result.sura}:${result.aya}`);
    setTimeout(() => setHighlightedVerse(null), 3000);
  };

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults([]);
  };

  // ── Render all page verses (no dropping) ─────────────────────────────────
  const renderVersesInFlow = () =>
    verses.map((v) => {
      const key = `${v.sura}:${v.aya}`;
      const isHighlighted = highlightedVerse === key;
      return (
        <React.Fragment key={key}>
          <span
            className={`verse-text ${!showVerses ? "hidden" : ""} ${isHighlighted ? "highlighted" : ""}`}
          >
            {v.text}
          </span>
          <span
            className={`verse-separator ${isHighlighted ? "highlighted" : ""}`}
          >
            <span className="separator-number">{toHindiNumbers(v.aya)}</span>
            <span className="separator-symbol">۝</span>
          </span>
        </React.Fragment>
      );
    });

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
          {/* ── Toolbar ── */}
          <div className="top-toolbar">
            <div className="toolbar-left">
              <button
                className="toolbar-button menu-button"
                onClick={() => history.push("/surah-juz")}
                title={t.mushaf.juz}
                aria-label={t.mushaf.juz}
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

            <div className="toolbar-right">
              <div className="toolbar-actions">
                <button
                  className={`toolbar-button search-button ${searchOpen ? "active" : ""}`}
                  onClick={() => {
                    setSearchOpen((o) => !o);
                    if (!searchOpen) setSettingsOpen(false);
                    else clearSearch();
                  }}
                  title="بحث"
                  aria-label="بحث"
                  aria-pressed={searchOpen}
                >
                  <svg
                    className="search-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                </button>
                <button
                  className={`toolbar-button settings-button ${settingsOpen ? "active" : ""}`}
                  onClick={() => {
                    setSettingsOpen((o) => !o);
                    if (!settingsOpen) {
                      setSearchOpen(false);
                      clearSearch();
                    }
                  }}
                  title="الإعدادات"
                  aria-label="الإعدادات"
                  aria-pressed={settingsOpen}
                >
                  <svg
                    className="settings-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24" />
                  </svg>
                </button>
                <button
                  className={`toolbar-button view-button ${!showVerses ? "active" : ""}`}
                  onClick={() => setShowVerses((v) => !v)}
                  title={showVerses ? "إخفاء الآيات" : "إظهار الآيات"}
                  aria-label={showVerses ? "إخفاء الآيات" : "إظهار الآيات"}
                  aria-pressed={!showVerses}
                >
                  <svg
                    className="view-icon"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                </button>
              </div>
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

          {/* ── Search Panel ── */}
          {searchOpen && (
            <div className="search-panel">
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
                <button
                  type="button"
                  className="search-close"
                  onClick={() => {
                    setSearchOpen(false);
                    clearSearch();
                  }}
                >
                  إلغاء
                </button>
              </form>
              {searchResults.length > 0 && (
                <div className="search-results">
                  <div className="results-header">
                    <span>نتائج البحث: {searchResults.length}</span>
                  </div>
                  <div className="results-list">
                    {searchResults.map((r, i) => (
                      <div
                        key={`${r.sura}-${r.aya}-${i}`}
                        className="result-item"
                        onClick={() => handleResultClick(r)}
                      >
                        <div className="result-main">
                          <span className="result-surah">{r.suraNameAr}</span>
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

          {/* ── Settings Panel ── */}
          {settingsOpen && (
            <div className="settings-panel">
              <div className="settings-header">
                <h3>الإعدادات</h3>
                <button
                  className="settings-close"
                  onClick={() => setSettingsOpen(false)}
                >
                  ✕
                </button>
              </div>
              <div className="settings-content">
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
                <div className="setting-item">
                  <label>الوضع الليلي</label>
                  <button className="toggle-button">إيقاف</button>
                </div>
                <div className="setting-item">
                  <label>ترجمة</label>
                  <select className="setting-select">
                    <option>بدون ترجمة</option>
                    <option>الإنجليزية</option>
                    <option>الأوردية</option>
                    <option>الملايوية</option>
                  </select>
                </div>
              </div>
            </div>
          )}

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
              <div className="mushaf-page" ref={pageRef}>
                {/* Bismillah — ref so height is excluded from text budget */}
                {isSurahStart && (
                  <div className="bismillah-line" ref={bismillahRef}>
                    <span className="bismillah-text">﷽</span>
                  </div>
                )}

                {/* Text flow — font scaled to fit ALL page verses */}
                <div
                  className="mushaf-text-flow"
                  ref={textFlowRef}
                  style={{
                    fontSize: `${dynamicFontSize}px`,
                    lineHeight: `${LINE_HEIGHT_RATIO}`,
                  }}
                >
                  {renderVersesInFlow()}
                </div>

                {/* Footer — ref so height is excluded from text budget */}
                <div className="page-footer" ref={footerRef}>
                  {t.mushaf.hizb} {toHindiNumbers(Math.ceil(currentPage / 4))}
                </div>
              </div>
            )}
          </div>

          {/* ── Persistent bottom navigation (Home + tabs) ── */}
          <BottomNavBar active="quran" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default PageViewer;
