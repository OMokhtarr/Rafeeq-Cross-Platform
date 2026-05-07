import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchTafsirForAyah,
  getTafsirResources,
  getPageTranslations,
  getPage,
} from "../../../core/services/data/quran.service";
import type { TafsirResource } from "../../../core/services/data/quran.service";
import { useLang } from "../../../core/context/LanguageContext";
import { useTheme } from "../../../core/context/ThemeContext";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import {
  isPageBookmarked,
  toggleBookmark,
} from "../../../core/services/api/user-api.client";
import "./VerseActionSheet.css";

type Tab = "translation" | "tafsir";

interface Props {
  open: boolean;
  /** "sura:aya" of the initially long-pressed verse. */
  verseKey: string | null;
  /** Ordered verse keys for the current page — used for prev/next in tafsir. */
  pageVerseKeys?: string[];
  page: number;
  translationId: string;
  tafsirId?: string;
  onClose: () => void;
}

const DEFAULT_TAFSIR_ID = "91"; // التفسير الميسر

const VerseActionSheet: React.FC<Props> = ({
  open,
  verseKey,
  pageVerseKeys = [],
  page,
  translationId,
  tafsirId,
  onClose,
}) => {
  const { t, lang, isRTL } = useLang();
  const { isNight } = useTheme();

  const nightClass = isNight ? " vas-sheet--night" : "";

  // ── Bookmark ───────────────────────────────────────────────────────────────
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    if (open && verseKey) setBookmarked(isPageBookmarked(verseKey));
  }, [open, verseKey]);

  const handleBookmark = useCallback(() => {
    if (!verseKey) return;
    setBookmarked(toggleBookmark(verseKey));
  }, [verseKey]);

  // ── Tab ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("translation");

  // ── Translation ────────────────────────────────────────────────────────────
  const [translation, setTranslation] = useState<string | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // ── Tafsir navigation ──────────────────────────────────────────────────────
  // currentKey tracks which verse is shown in the tafsir tab (can differ from
  // the initially pressed verseKey via prev/next).
  const [currentKey, setCurrentKey] = useState<string | null>(verseKey);

  // ── Tafsir resources ──────────────────────────────────────────────────────
  const [resources, setResources] = useState<TafsirResource[]>([]);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  const [selectedResourceId, setSelectedResourceId] = useState<string>(
    tafsirId ?? DEFAULT_TAFSIR_ID,
  );

  // ── Verse text ────────────────────────────────────────────────────────────
  const [verseText, setVerseText] = useState<string>("");

  // ── Tafsir text ───────────────────────────────────────────────────────────
  const [tafsir, setTafsir] = useState<string>("");
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [tafsirError, setTafsirError] = useState<string | null>(null);

  const tafsirBodyRef = useRef<HTMLDivElement>(null);

  // ── Reset on open / verse change ──────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setTranslationError(null);
      setTafsirError(null);
      return;
    }
    setTranslation(null);
    setTafsir("");
    setActiveTab("translation");
    setCurrentKey(verseKey);
  }, [open, verseKey]);

  // ── Fetch translation ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !verseKey) return;
    if (!translationId) {
      setTranslation(null);
      setTranslationError(null);
      return;
    }
    let cancelled = false;
    setTranslationLoading(true);
    setTranslationError(null);
    getPageTranslations(page, translationId)
      .then((rows) => {
        if (cancelled) return;
        const hit = rows.find((r) => r.verseKey === verseKey);
        setTranslation(hit?.text ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setTranslationError(t.mushaf.translationError);
      })
      .finally(() => {
        if (!cancelled) setTranslationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, verseKey, page, translationId, t]);

  // ── Fetch tafsir resource list (once per open) ────────────────────────────
  useEffect(() => {
    if (!open || resources.length > 0) return;
    let cancelled = false;
    setResourcesLoading(true);
    getTafsirResources()
      .then((list) => {
        if (cancelled) return;
        setResources(list);
        // Keep the tafsirId prop as default if it's in the list, else keep DEFAULT
        if (tafsirId && list.some((r) => r.id === tafsirId)) {
          setSelectedResourceId(tafsirId);
        }
      })
      .catch(() => {
        /* silently ignore — we still have the default id */
      })
      .finally(() => {
        if (!cancelled) setResourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]); // intentionally omits `resources` and `tafsirId` — fetch once per open

  // ── Fetch verse text whenever currentKey changes ──────────────────────────
  useEffect(() => {
    if (!open || !currentKey) return;
    let cancelled = false;
    setVerseText("");
    getPage(page)
      .then((verses) => {
        if (cancelled) return;
        const [s, a] = currentKey.split(":").map((n) => parseInt(n, 10));
        const hit = verses.find((v) => v.sura === s && v.aya === a);
        if (hit) setVerseText(hit.text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, currentKey, page]);

  // ── Fetch tafsir text whenever key or resource changes ────────────────────
  useEffect(() => {
    if (!open || !currentKey) return;
    const [s, a] = currentKey.split(":").map((n) => parseInt(n, 10));
    let cancelled = false;
    setTafsirLoading(true);
    setTafsirError(null);
    setTafsir("");
    fetchTafsirForAyah(s, a, selectedResourceId)
      .then((res) => {
        if (!cancelled) {
          setTafsir(res.text);
          tafsirBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
        }
      })
      .catch(() => {
        if (!cancelled) setTafsirError(t.mushaf.tafsirError);
      })
      .finally(() => {
        if (!cancelled) setTafsirLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentKey, selectedResourceId, t]);

  // ── Prev / next helpers ───────────────────────────────────────────────────
  const currentIdx = currentKey ? pageVerseKeys.indexOf(currentKey) : -1;
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx >= 0 && currentIdx < pageVerseKeys.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) setCurrentKey(pageVerseKeys[currentIdx - 1]);
  }, [hasPrev, currentIdx, pageVerseKeys]);

  const goNext = useCallback(() => {
    if (hasNext) setCurrentKey(pageVerseKeys[currentIdx + 1]);
  }, [hasNext, currentIdx, pageVerseKeys]);

  // ── Derived display values ────────────────────────────────────────────────
  const displayVerseKey = currentKey ?? verseKey;
  const [dSuraStr, dAyaStr] = (displayVerseKey ?? "1:1").split(":");
  const dSura = parseInt(dSuraStr, 10);
  const dAya = parseInt(dAyaStr, 10);
  const displayKey =
    lang === "ar"
      ? `${toHindiNumbers(dSura)}:${toHindiNumbers(dAya)}`
      : `${dSura}:${dAya}`;

  const selectedResource = resources.find((r) => r.id === selectedResourceId);

  if (!open || !verseKey) return null;

  return (
    <>
      <div className="vas-backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        className={`vas-sheet${nightClass}`}
        role="dialog"
        aria-label={t.mushaf.actionSheetTitle(displayKey)}
        dir={isRTL ? "rtl" : "ltr"}
      >
        <div className="vas-handle" aria-hidden="true" />

        <header className="vas-header">
          <h3 className="vas-title">{t.mushaf.actionSheetTitle(displayKey)}</h3>
          <div className="vas-header-actions">
            <button
              className={`vas-bookmark-btn${bookmarked ? " vas-bookmark-btn--active" : ""}${nightClass}`}
              onClick={handleBookmark}
              disabled={!verseKey}
              aria-label={bookmarked
                ? (lang === "ar" ? "إزالة الإشارة" : "Remove bookmark")
                : (lang === "ar" ? "إضافة إشارة" : "Bookmark verse")}
              aria-pressed={bookmarked}
            >
              <svg viewBox="0 0 24 24" width="18" height="18"
                fill={bookmarked ? "currentColor" : "none"}
                stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </button>
            <button
              className="vas-close"
              onClick={onClose}
              aria-label={t.mushaf.closeLabel}
            >
              ✕
            </button>
          </div>
        </header>

        <div className="vas-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "translation"}
            className={`vas-tab${
              activeTab === "translation" ? " vas-tab--active" : ""
            }`}
            onClick={() => setActiveTab("translation")}
          >
            {t.mushaf.translation}
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "tafsir"}
            className={`vas-tab${
              activeTab === "tafsir" ? " vas-tab--active" : ""
            }`}
            onClick={() => setActiveTab("tafsir")}
          >
            {t.mushaf.tafsir}
          </button>
        </div>

        {/* ── Translation tab ── */}
        {activeTab === "translation" && (
          <div className="vas-body">
            <section className="vas-panel" aria-label={t.mushaf.translation}>
              {!translationId ? (
                <p className="vas-empty">{t.mushaf.translationUnavailable}</p>
              ) : translationLoading ? (
                <div className="vas-loading">
                  <span className="vas-spinner" aria-hidden="true" />
                  <span>{t.mushaf.translationLoading}</span>
                </div>
              ) : translationError ? (
                <p className="vas-error" role="alert">
                  {translationError}
                </p>
              ) : translation ? (
                <p className="vas-translation" lang="en" dir="ltr">
                  {translation}
                </p>
              ) : (
                <p className="vas-empty">{t.mushaf.translationUnavailable}</p>
              )}
            </section>
          </div>
        )}

        {/* ── Tafsir tab ── */}
        {activeTab === "tafsir" && (
          <>
            {/* Resource selector */}
            <div className={`vas-resource-bar${nightClass}`}>
              {resourcesLoading ? (
                <span
                  className="vas-spinner vas-spinner--sm"
                  aria-hidden="true"
                />
              ) : (
                <select
                  className={`vas-resource-select${nightClass}`}
                  value={selectedResourceId}
                  onChange={(e) => setSelectedResourceId(e.target.value)}
                  aria-label={t.mushaf.tafsir}
                >
                  {resources.length === 0 && (
                    <option value={DEFAULT_TAFSIR_ID}>
                      Tafsir Muyassar — المیسر
                    </option>
                  )}
                  {resources.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.authorName ? ` — ${r.authorName}` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Verse + nav row */}
            <div className={`vas-verse-row${nightClass}`}>
              <button
                className={`vas-nav-btn${nightClass}`}
                onClick={goPrev}
                disabled={!hasPrev}
                aria-label={
                  isRTL ? t.mushaf.contextNextPage : t.mushaf.contextPrevPage
                }
              >
                {isRTL ? "‹" : "›"}
              </button>

              <div className="vas-verse-center">
                <span className={`vas-nav-key${nightClass}`}>
                  {lang === "ar"
                    ? `${toHindiNumbers(dSura)}:${toHindiNumbers(dAya)}`
                    : `${dSura}:${dAya}`}
                </span>
                {verseText && (
                  <p
                    className={`vas-verse-text${nightClass}`}
                    dir="rtl"
                    lang="ar"
                  >
                    {verseText}
                  </p>
                )}
              </div>

              <button
                className={`vas-nav-btn${nightClass}`}
                onClick={goNext}
                disabled={!hasNext}
                aria-label={
                  isRTL ? t.mushaf.contextPrevPage : t.mushaf.contextNextPage
                }
              >
                {isRTL ? "›" : "‹"}
              </button>
            </div>

            {/* Tafsir body */}
            <div className="vas-body" ref={tafsirBodyRef}>
              <section className="vas-panel" aria-label={t.mushaf.tafsir}>
                {/* Resource name label */}
                {selectedResource && (
                  <p className={`vas-resource-label${nightClass}`}>
                    {selectedResource.name}
                    {selectedResource.authorName
                      ? ` — ${selectedResource.authorName}`
                      : ""}
                  </p>
                )}

                {tafsirLoading ? (
                  <div className="vas-loading">
                    <span className="vas-spinner" aria-hidden="true" />
                    <span>{t.mushaf.tafsirLoading}</span>
                  </div>
                ) : tafsirError ? (
                  <p className="vas-error" role="alert">
                    {tafsirError}
                  </p>
                ) : tafsir ? (
                  <p className="vas-tafsir">{tafsir}</p>
                ) : (
                  <p className="vas-empty">{t.mushaf.tafsirUnavailable}</p>
                )}
              </section>
            </div>
          </>
        )}
      </aside>
    </>
  );
};

export default VerseActionSheet;
