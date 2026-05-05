/**
 * SEARCH RESULTS
 *
 * Renders the result list for `?q=...`. The first result is "expanded" by
 * default — surah name + Arabic text + action row (share, copy, continue
 * reading, mushaf). Tapping any other row expands it (and collapses the
 * previous one). "Continue Reading" / mushaf icon navigate to the page in
 * the viewer with the verse highlighted.
 *
 * Mirrors the reference layout: top header, query echo, result cards,
 * total count badge pinned at the bottom.
 */

import React, { useEffect, useMemo, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory, useLocation } from "react-router-dom";
import { useLang } from "../../../core/context/LanguageContext";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import {
  searchQuran,
  type SearchResult,
} from "../../../core/services/data/quran.service";
import {
  getSurahNameArabic,
  getSurahNameEnglish,
} from "../../../core/services/data/metadata.service";
import { pushRecent } from "./Search";
import "./SearchResults.css";

const SearchResults: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { t, lang, isRTL } = useLang();

  const query = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return (params.get("q") || "").trim();
  }, [location.search]);

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Index of the currently expanded result. Default = first (0).
  const [expandedIdx, setExpandedIdx] = useState(0);
  // Lightweight feedback flag for the copy-to-clipboard action.
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setExpandedIdx(0);
    searchQuran(query)
      .then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setLoading(false);
        // Refresh the persisted "recent searches" entry with the real count.
        pushRecent(query, rows.length);
      })
      .catch((err) => {
        console.error("[SearchResults] search failed", err);
        if (cancelled) return;
        setError(t.mushaf.searchError);
        setResults([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query, t.mushaf.searchError]);

  const fmt = (n: number) => (lang === "ar" ? toHindiNumbers(n) : String(n));

  const goToVerse = (r: SearchResult) => {
    history.push(`/viewer?page=${r.page}&v=${encodeURIComponent(r.verseKey)}`);
  };

  const handleShare = async (r: SearchResult) => {
    const text = `${r.text}\n— ${getSurahNameEnglish(r.sura)} ${r.verseKey}`;
    try {
      // Web Share API is the natural fit; degrades to copy on unsupported
      // browsers so the action never silently fails.
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ text, title: "Quran" });
        return;
      }
    } catch {
      /* user dismissed */
    }
    handleCopy(r, results.indexOf(r));
  };

  const handleCopy = (r: SearchResult, idx: number) => {
    const text = `${r.text} — ${r.verseKey}`;
    try {
      navigator.clipboard?.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((i) => (i === idx ? null : i)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const totalLabel = (n: number) =>
    lang === "ar"
      ? n === 1
        ? "نتيجة واحدة"
        : `${fmt(n)} نتائج`
      : n === 1
        ? "1 Result"
        : `${fmt(n)} Results`;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="results-page" dir={isRTL ? "rtl" : "ltr"}>
          {/* ── Header ── */}
          <header className="results-header">
            <button
              type="button"
              className="results-back-btn"
              onClick={() => history.goBack()}
              aria-label={t.mushaf.backLabel}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h1 className="results-title">
              {lang === "ar" ? "نتائج البحث" : "Search Results"}
            </h1>
            <button
              type="button"
              className="results-settings-btn"
              onClick={() => history.push("/settings")}
              aria-label={t.mushaf.settings}
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
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 005 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33h0a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82v0a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
              </svg>
            </button>
          </header>

          {/* Query echo (Arabic-aware via dir="auto") */}
          <div className="results-query" dir="auto">
            {query}
          </div>

          {/* ── Body ── */}
          <div className="results-body">
            {loading && (
              <div className="results-status">
                {t.mushaf.searching ?? "Searching…"}
              </div>
            )}
            {!loading && error && (
              <div className="results-status results-error">{error}</div>
            )}
            {!loading && !error && results.length === 0 && (
              <div className="results-status">
                {t.mushaf.noResults}: "{query}"
              </div>
            )}

            {results.map((r, i) => {
              const isExpanded = i === expandedIdx;
              const surahNameEn = getSurahNameEnglish(r.sura);
              const surahNameAr = getSurahNameArabic(r.sura);
              return (
                <article
                  key={`${r.verseKey}-${i}`}
                  className={`result-card ${isExpanded ? "expanded" : ""}`}
                  onClick={() => !isExpanded && setExpandedIdx(i)}
                >
                  <header className="result-card-header">
                    <span className="result-badge">{r.verseKey}</span>
                    <span className="result-surah-name">
                      {surahNameEn}
                      <span className="result-surah-name-ar" dir="rtl">
                        {surahNameAr}
                      </span>
                    </span>
                    <button
                      type="button"
                      className="result-collapse-chev"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedIdx(isExpanded ? -1 : i);
                      }}
                      aria-label={isExpanded ? "Collapse" : "Expand"}
                    >
                      {isExpanded ? "⋮" : isRTL ? "‹" : "›"}
                    </button>
                  </header>

                  {isExpanded && (
                    <div className="result-card-body">
                      <p className="result-arabic" dir="rtl">
                        {r.text}
                      </p>
                      {/* Optional translation slot — the search API returns
                          Arabic text only; if a future edition is wired we
                          can drop the English line in here. */}
                      <div className="result-actions">
                        <button
                          type="button"
                          className="result-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShare(r);
                          }}
                          aria-label="Share"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <circle cx="18" cy="5" r="3" />
                            <circle cx="6" cy="12" r="3" />
                            <circle cx="18" cy="19" r="3" />
                            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="result-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(r, i);
                          }}
                          aria-label="Copy"
                        >
                          {copiedIdx === i ? (
                            <svg
                              viewBox="0 0 24 24"
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                x="9"
                                y="9"
                                width="13"
                                height="13"
                                rx="2"
                              />
                              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                            </svg>
                          )}
                        </button>

                        <span className="result-actions-spacer" />

                        <button
                          type="button"
                          className="result-continue"
                          onClick={(e) => {
                            e.stopPropagation();
                            goToVerse(r);
                          }}
                        >
                          {lang === "ar" ? "متابعة القراءة" : "Continue Reading"}
                        </button>
                        <button
                          type="button"
                          className="result-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            goToVerse(r);
                          }}
                          aria-label={
                            lang === "ar" ? "افتح في المصحف" : "Open in Mushaf"
                          }
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="20"
                            height="20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2 4h7a3 3 0 013 3v13a2 2 0 00-2-2H2z" />
                            <path d="M22 4h-7a3 3 0 00-3 3v13a2 2 0 012-2h8z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>

          {/* ── Total count badge ── */}
          {!loading && !error && results.length > 0 && (
            <div className="results-count-bar">
              <span className="results-count-pill">
                {totalLabel(results.length)}
              </span>
            </div>
          )}
        </div>
      </IonContent>
    </IonPage>
  );
};

export default SearchResults;
