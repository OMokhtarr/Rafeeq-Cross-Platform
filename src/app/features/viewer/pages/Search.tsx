/**
 * SEARCH
 *
 * Dedicated search entry screen, opened from the PageViewer toolbar's
 * search icon. Mirrors the reference design:
 *   - Header with back button + "Search" title
 *   - "Recent Searches" list (each row: query, result count, chevron)
 *   - Pinned search input at the bottom with a placeholder hint
 *
 * Submitting (Enter or tapping a recent row) navigates to /search/results
 * with the query as a `q` param. Recent searches persist in localStorage
 * and are stored together with their last-known result count.
 */

import React, { useEffect, useRef, useState } from "react";
import { IonPage, IonContent } from "@ionic/react";
import { useHistory } from "react-router-dom";
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
import BottomNavBar from "../../../shared/components/bottom-nav/BottomNavBar";
import "./Search.css";

/** Debounce window for live search-as-you-type (ms). */
const LIVE_SEARCH_DEBOUNCE = 300;

const RECENTS_KEY = "rafiq_search_recents_v1";
const RECENTS_MAX = 12;

export interface RecentSearch {
  query: string;
  count: number;
  /** epoch ms — used to surface most-recent first. */
  ts: number;
}

export function readRecents(): RecentSearch[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(
      (r) =>
        r &&
        typeof r.query === "string" &&
        typeof r.count === "number" &&
        typeof r.ts === "number",
    );
  } catch {
    return [];
  }
}

export function writeRecents(list: RecentSearch[]): void {
  try {
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(list.slice(0, RECENTS_MAX)),
    );
  } catch {}
}

/** Insert/refresh a recent. Most recent first; dedupe by trimmed query. */
export function pushRecent(query: string, count: number): RecentSearch[] {
  const trimmed = query.trim();
  if (!trimmed) return readRecents();
  const existing = readRecents().filter((r) => r.query !== trimmed);
  const next: RecentSearch[] = [
    { query: trimmed, count, ts: Date.now() },
    ...existing,
  ].slice(0, RECENTS_MAX);
  writeRecents(next);
  return next;
}

const Search: React.FC = () => {
  const history = useHistory();
  const { t, lang, isRTL } = useLang();
  const [recents, setRecents] = useState<RecentSearch[]>([]);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Live search state — populated as the user types.
  const [liveResults, setLiveResults] = useState<SearchResult[]>([]);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  // Live search-as-you-type. Debounced 300 ms so the API isn't hit on
  // every keystroke; cancellation flag guards against out-of-order
  // responses if the user keeps typing while a request is in flight.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setLiveResults([]);
      setLiveError(null);
      setLiveLoading(false);
      return;
    }

    let cancelled = false;
    setLiveLoading(true);
    setLiveError(null);

    const handle = setTimeout(() => {
      searchQuran(trimmed)
        .then((rows) => {
          if (cancelled) return;
          setLiveResults(rows);
          setLiveLoading(false);
        })
        .catch((err) => {
          console.error("[Search] live search failed", err);
          if (cancelled) return;
          setLiveResults([]);
          setLiveError(t.mushaf.searchError);
          setLiveLoading(false);
        });
    }, LIVE_SEARCH_DEBOUNCE);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, t.mushaf.searchError]);

  // Hand off to the full results page (also persists the recent entry).
  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    pushRecent(trimmed, liveResults.length);
    history.push(`/search/results?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submit(query);
  };

  const handleRecentTap = (q: string) => submit(q);

  // Tapping an inline live-result jumps straight to the verse in the
  // viewer with the verse highlighted (same behavior as the in-drawer
  // result list).
  const handleResultTap = (r: SearchResult) => {
    pushRecent(query, liveResults.length);
    history.push(`/viewer?page=${r.page}&v=${encodeURIComponent(r.verseKey)}`);
  };

  const clearAll = () => {
    writeRecents([]);
    setRecents([]);
  };

  const fmt = (n: number) => (lang === "ar" ? toHindiNumbers(n) : String(n));
  const resultsLabel = (count: number) =>
    lang === "ar"
      ? count === 1
        ? "نتيجة واحدة"
        : `${fmt(count)} نتائج`
      : count === 1
      ? "1 result"
      : `${fmt(count)} results`;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div
          className="search-page search-page-with-nav"
          dir={isRTL ? "rtl" : "ltr"}
        >
          {/* ── Header ── */}
          <header className="search-page-header">
            <button
              type="button"
              className="search-back-btn"
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
                {/* Always points "back" toward the start of the page in the
                    current writing direction — the parent dir attr flips it. */}
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h1 className="search-page-title">{t.mushaf.search}</h1>
            {recents.length > 0 && (
              <button
                type="button"
                className="search-clear-all"
                onClick={clearAll}
              >
                {lang === "ar" ? "مسح" : "Clear"}
              </button>
            )}
          </header>

          {/* ── Body ──
              While the user is typing we replace the recents list with
              live results (debounced). When the input is empty we fall
              back to the recents list. */}
          {query.trim() ? (
            <section className="recents-section live-results-section">
              <h2 className="recents-title">
                {liveLoading
                  ? t.mushaf.searching
                  : liveError
                  ? liveError
                  : liveResults.length === 0
                  ? lang === "ar"
                    ? "لا توجد نتائج"
                    : "No results"
                  : resultsLabel(liveResults.length)}
              </h2>
              <ul className="recents-list">
                {liveResults.map((r, i) => (
                  <li
                    key={`${r.verseKey}-${i}`}
                    className="recent-row live-result-row"
                    onClick={() => handleResultTap(r)}
                  >
                    <span className="result-row-badge">{r.verseKey}</span>
                    <span className="recent-text">
                      <span className="recent-query">
                        {getSurahNameEnglish(r.sura)}{" "}
                        <span className="result-row-arabic-name" dir="rtl">
                          ({getSurahNameArabic(r.sura)})
                        </span>
                      </span>
                      <span
                        className="recent-count result-row-preview"
                        dir="rtl"
                      >
                        {r.text?.length > 70
                          ? r.text.substring(0, 70) + "…"
                          : r.text}
                      </span>
                    </span>
                    <span className="recent-chev" aria-hidden>
                      {isRTL ? "‹" : "›"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <section className="recents-section">
              <h2 className="recents-title">
                {lang === "ar" ? "عمليات البحث الأخيرة" : "Recent Searches"}
              </h2>
              {recents.length === 0 ? (
                <p className="recents-empty">
                  {lang === "ar"
                    ? "ابدأ بالبحث لرؤية تاريخ بحثك هنا."
                    : "Start searching to see your history here."}
                </p>
              ) : (
                <ul className="recents-list">
                  {recents.map((r) => (
                    <li
                      key={r.query}
                      className="recent-row"
                      onClick={() => handleRecentTap(r.query)}
                    >
                      <span className="recent-icon" aria-hidden>
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
                          <circle cx="11" cy="11" r="7" />
                          <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                      </span>
                      <span className="recent-text">
                        <span className="recent-query" dir="auto">
                          {r.query}
                        </span>
                        <span className="recent-count">
                          {resultsLabel(r.count)}
                        </span>
                      </span>
                      <span className="recent-chev" aria-hidden>
                        {isRTL ? "‹" : "›"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* ── Bottom search input ── */}
          <form className="search-bottom-bar" onSubmit={handleSubmit}>
            <span className="search-bottom-icon" aria-hidden>
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
                <circle cx="11" cy="11" r="7" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              className="search-bottom-input"
              placeholder={
                lang === "ar"
                  ? "مثال: الفاتحة، 1:4، صفحة 62…"
                  : "eg. Al-Fatihah, 1:4, pg 62, …"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              dir="auto"
              autoFocus
            />
            {/* Decorative mic — placeholder for future voice search.
                Submits the typed query when tapped so it isn't dead. */}
            <button
              type="submit"
              className="search-bottom-mic"
              aria-label={lang === "ar" ? "بحث صوتي" : "Voice search (submit)"}
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
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5 11a7 7 0 0014 0" />
                <line x1="12" y1="18" x2="12" y2="22" />
                <line x1="9" y1="22" x2="15" y2="22" />
              </svg>
            </button>
          </form>
          <BottomNavBar active="quran" />
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Search;
