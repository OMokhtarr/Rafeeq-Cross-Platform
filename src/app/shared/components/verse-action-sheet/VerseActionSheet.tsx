import React, { useCallback, useEffect, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import {
  fetchTafsirForAyah,
  getTafsirResources,
  getPageTranslations,
  getPage,
} from "../../../core/services/data/quran.service";
import type { TafsirResource } from "../../../core/services/data/quran.service";
import {
  getDownloadedTafsirIds,
} from "../../../core/services/data/tafsir-cache.service";
import { useLang } from "../../../core/context/LanguageContext";
import { useTheme } from "../../../core/context/ThemeContext";
import InlineSelect from "../inline-select/InlineSelect";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import {
  isPageBookmarked,
  toggleBookmark,
} from "../../../core/services/api/user-api.client";
import { getPlayableUrl } from "../../../core/services/audio/audio-cache.service";
import { useAudioPlayer } from "../../../core/hooks/useAudioPlayer";
import NoteModal from "../note-modal/NoteModal";
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
  /** Reciter ID used for audio playback (numeric string, e.g. "4"). */
  reciter?: string;
  onClose: () => void;
}

const DEFAULT_TAFSIR_ID = "16"; // التفسير الميسر

const DEFAULT_RECITER = "4";

const VerseActionSheet: React.FC<Props> = ({
  open,
  verseKey,
  pageVerseKeys = [],
  page,
  translationId,
  tafsirId,
  reciter = DEFAULT_RECITER,
  onClose,
}) => {
  const { t, lang, isRTL } = useLang();
  const { isNight } = useTheme();
  const history = useHistory();

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

  // ── Audio ─────────────────────────────────────────────────────────────────
  const audio = useAudioPlayer();
  const [audioLoading, setAudioLoading] = useState(false);

  const isThisVersePlayingKey = verseKey;
  const isPlaying =
    audio.isPlaying && audio.playingKey === isThisVersePlayingKey;

  const handlePlay = useCallback(async () => {
    if (!verseKey) return;
    if (isPlaying) {
      audio.stop();
      return;
    }
    const [sStr, aStr] = verseKey.split(":");
    const sura = parseInt(sStr, 10);
    const aya = parseInt(aStr, 10);
    setAudioLoading(true);
    try {
      const { url } = await getPlayableUrl(reciter, sura, aya);
      await audio.play(verseKey, url);
    } catch {
      /* silently fail — network or decode error */
    } finally {
      setAudioLoading(false);
    }
  }, [verseKey, isPlaying, reciter, audio]);

  // Stop audio when sheet closes
  useEffect(() => {
    if (!open) audio.stop();
  }, [open]);

  // ── Notes modal ────────────────────────────────────────────────────────────
  type NoteView = "list" | "compose";
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteModalView, setNoteModalView] = useState<NoteView>("list");

  const openNoteList = useCallback(() => {
    setNoteModalView("list");
    setNoteModalOpen(true);
  }, []);

  const openNoteCompose = useCallback(() => {
    setNoteModalView("compose");
    setNoteModalOpen(true);
  }, []);

  // ── Tab ────────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("tafsir");

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
  const [downloadedIds, setDownloadedIds] = useState<string[]>(
    getDownloadedTafsirIds,
  );

  // ── Verse text ────────────────────────────────────────────────────────────
  const [verseText, setVerseText] = useState<string>("");

  // ── Tafsir text ───────────────────────────────────────────────────────────
  const [tafsir, setTafsir] = useState<string>("");
  const [tafsirLoading, setTafsirLoading] = useState(false);
  const [tafsirError, setTafsirError] = useState<string | null>(null);

  const tafsirBodyRef = useRef<HTMLDivElement>(null);

  // Keep downloaded IDs in sync with TafsirSettings page changes
  useEffect(() => {
    const handler = () => setDownloadedIds(getDownloadedTafsirIds());
    window.addEventListener("rafiq-tafsir-downloads-changed", handler);
    return () => window.removeEventListener("rafiq-tafsir-downloads-changed", handler);
  }, []);

  // ── Reset on open / verse change ──────────────────────────────────────────
  useEffect(() => {
    if (!open) {
      setTranslationError(null);
      setTafsirError(null);
      return;
    }
    setTranslation(null);
    setTafsir("");
    setActiveTab("tafsir");
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

  // ── Derived: filter resources to downloaded only ──────────────────────────
  const downloadedResources = resources.filter((r) =>
    downloadedIds.includes(r.id),
  );

  const effectiveResourceId =
    downloadedIds.includes(selectedResourceId) || downloadedIds.length === 0
      ? selectedResourceId
      : downloadedResources[0]?.id ?? DEFAULT_TAFSIR_ID;

  // ── Fetch tafsir text whenever key or resource changes ────────────────────
  useEffect(() => {
    if (!open || !currentKey) return;
    const [s, a] = currentKey.split(":").map((n) => parseInt(n, 10));
    let cancelled = false;
    setTafsirLoading(true);
    setTafsirError(null);
    setTafsir("");
    fetchTafsirForAyah(s, a, effectiveResourceId)
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
  }, [open, currentKey, effectiveResourceId, t]);

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

  const selectedResource = resources.find((r) => r.id === effectiveResourceId);

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
            {/* Play verse */}
            <button
              className={`vas-play-btn${isPlaying ? " vas-play-btn--active" : ""}${isNight ? " vas-play-btn--night" : ""}`}
              onClick={handlePlay}
              disabled={!verseKey || audioLoading}
              aria-label={
                isPlaying
                  ? (lang === "ar" ? "إيقاف" : "Stop")
                  : (lang === "ar" ? "تشغيل الآية" : "Play verse")
              }
              aria-pressed={isPlaying}
            >
              {audioLoading ? (
                <span className="vas-spinner vas-spinner--sm" aria-hidden="true" />
              ) : isPlaying ? (
                /* Stop icon */
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="6" width="12" height="12" rx="1" />
                </svg>
              ) : (
                /* Play icon */
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
              )}
            </button>
            {/* Add note */}
            <button
              className={`vas-note-btn${isNight ? " vas-note-btn--night" : ""}`}
              onClick={openNoteCompose}
              disabled={!verseKey}
              aria-label={lang === "ar" ? "إضافة ملاحظة" : "Add note"}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
            {/* View notes for this verse */}
            <button
              className={`vas-note-btn${isNight ? " vas-note-btn--night" : ""}`}
              onClick={openNoteList}
              disabled={!verseKey}
              aria-label={lang === "ar" ? "ملاحظات الآية" : "View notes"}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </button>
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
            aria-selected={activeTab === "tafsir"}
            className={`vas-tab${
              activeTab === "tafsir" ? " vas-tab--active" : ""
            }`}
            onClick={() => setActiveTab("tafsir")}
          >
            {t.mushaf.tafsir}
          </button>
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
            {/* Resource selector — shows only downloaded tafsirs */}
            <div className={`vas-resource-bar${nightClass}`}>
              {resourcesLoading ? (
                <span
                  className="vas-spinner vas-spinner--sm"
                  aria-hidden="true"
                />
              ) : downloadedResources.length === 0 ? (
                /* No downloads yet — show a prompt to go to settings */
                <button
                  className={`vas-tafsir-settings-link${nightClass}`}
                  onClick={() => history.push("/tafsir-settings", { returnVerseKey: verseKey })}
                >
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                  <span>
                    {lang === "ar" ? "احفظ تفسيراً من مكتبة التفاسير" : "Save a tafsir from the library"}
                  </span>
                </button>
              ) : (
                <div className="vas-resource-bar-inner">
                  <InlineSelect
                    value={effectiveResourceId}
                    options={downloadedResources.map((r) => ({
                      value: r.id,
                      label: r.name + (r.authorName ? ` — ${r.authorName}` : ""),
                    }))}
                    onChange={setSelectedResourceId}
                    night={isNight}
                    fullWidth
                    aria-label={t.mushaf.tafsir}
                  />
                  <button
                    className={`vas-tafsir-gear${nightClass}`}
                    onClick={() => history.push("/tafsir-settings", { returnVerseKey: verseKey })}
                    aria-label={lang === "ar" ? "إعدادات التفاسير" : "Tafsir settings"}
                  >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="3" />
                      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                    </svg>
                  </button>
                </div>
              )}
            </div>

            {/* Verse + nav row */}
            <div className={`vas-verse-row${nightClass}`}>
              <div className="vas-verse-center">
                <div className="vas-nav-inline">
                  <button
                    className={`vas-nav-btn${nightClass}`}
                    onClick={goPrev}
                    disabled={!hasPrev}
                    aria-label={
                      isRTL ? t.mushaf.contextNextPage : t.mushaf.contextPrevPage
                    }
                  >
                    {isRTL ? "›" : "‹"}
                  </button>
                  <span className={`vas-nav-key${nightClass}`}>
                    {lang === "ar"
                      ? `${toHindiNumbers(dSura)}:${toHindiNumbers(dAya)}`
                      : `${dSura}:${dAya}`}
                  </span>
                  <button
                    className={`vas-nav-btn${nightClass}`}
                    onClick={goNext}
                    disabled={!hasNext}
                    aria-label={
                      isRTL ? t.mushaf.contextPrevPage : t.mushaf.contextNextPage
                    }
                  >
                    {isRTL ? "‹" : "›"}
                  </button>
                </div>
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

      <NoteModal
        open={noteModalOpen}
        initialView={noteModalView}
        verseKey={verseKey}
        onClose={() => setNoteModalOpen(false)}
      />
    </>
  );
};

export default VerseActionSheet;
