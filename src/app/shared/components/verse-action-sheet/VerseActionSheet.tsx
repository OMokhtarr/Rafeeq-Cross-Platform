import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import {
  fetchTafsirForAyah,
  getTafsirResources,
  getPage,
} from "../../../core/services/data/quran.service";
import type { TafsirResource } from "../../../core/services/data/quran.service";
import {
  getDownloadedTafsirIds,
} from "../../../core/services/data/tafsir-cache.service";
import { readCachedTafsir } from "../../../core/services/sync/adapters/tafsirs.adapter";
import {
  getChapters,
  estimatePageForVerse,
} from "../../../core/services/data/metadata.service";
import { useLang } from "../../../core/context/LanguageContext";
import { useTheme } from "../../../core/context/ThemeContext";
import InlineSelect from "../inline-select/InlineSelect";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import {
  isPageBookmarked,
  toggleBookmark,
} from "../../../core/services/storage/notes.service";
import { getPlayableUrl } from "../../../core/services/audio/audio-cache.service";
import { useAudioPlayer } from "../../../core/hooks/useAudioPlayer";
import { useSheetDrag } from "../../../core/hooks/useSheetDrag";
import { useSwipeNav } from "../../../core/hooks/useSwipeNav";
import { registerOverlay } from "../../../core/utils/overlay-registry";
import NoteModal from "../note-modal/NoteModal";
import "./VerseActionSheet.css";

interface Props {
  open: boolean;
  /** "sura:aya" of the initially long-pressed verse. */
  verseKey: string | null;
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
  tafsirId,
  reciter = DEFAULT_RECITER,
  onClose,
}) => {
  const { t, lang, isRTL } = useLang();
  const { isNight } = useTheme();
  const history = useHistory();

  const nightClass = isNight ? " vas-sheet--night" : "";

  // ── Drag to dismiss ────────────────────────────────────────────────────────
  const { ref: sheetRef, dragHandlers } = useSheetDrag<HTMLElement>({
    onDismiss: onClose,
  });

  // Let the app-level edge-swipe gate close this sheet instead of treating the
  // swipe as a back/exit. Only while actually open.
  useEffect(() => {
    if (!open) return;
    return registerOverlay(onClose);
  }, [open, onClose]);

  // ── Tafsir navigation ──────────────────────────────────────────────────────
  // currentKey tracks which verse is shown in the tafsir panel (can differ from
  // the initially pressed verseKey via prev/next). Declared here because the
  // header actions below all operate on the verse currently on screen, not on
  // whichever verse happened to open the sheet.
  const [currentKey, setCurrentKey] = useState<string | null>(verseKey);
  // The verse every header action applies to. Falls back to the opening verse
  // before the first navigation.
  const activeKey = currentKey ?? verseKey;

  // ── Bookmark ───────────────────────────────────────────────────────────────
  const [bookmarked, setBookmarked] = useState(false);

  useEffect(() => {
    if (open && activeKey) setBookmarked(isPageBookmarked(activeKey));
  }, [open, activeKey]);

  const handleBookmark = useCallback(() => {
    if (!activeKey) return;
    setBookmarked(toggleBookmark(activeKey));
  }, [activeKey]);

  // ── Audio ─────────────────────────────────────────────────────────────────
  const audio = useAudioPlayer();
  const [audioLoading, setAudioLoading] = useState(false);

  const isThisVersePlayingKey = activeKey;
  const isPlaying =
    audio.isPlaying && audio.playingKey === isThisVersePlayingKey;

  const handlePlay = useCallback(async () => {
    if (!activeKey) return;
    if (isPlaying) {
      audio.stop();
      return;
    }
    const [sStr, aStr] = activeKey.split(":");
    const sura = parseInt(sStr, 10);
    const aya = parseInt(aStr, 10);
    setAudioLoading(true);
    try {
      const { url } = await getPlayableUrl(reciter, sura, aya);
      await audio.play(activeKey, url);
    } catch {
      /* silently fail — network or decode error */
    } finally {
      setAudioLoading(false);
    }
  }, [activeKey, isPlaying, reciter, audio]);

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
      setTafsirError(null);
      return;
    }
    setTafsir("");
    setCurrentKey(verseKey);
  }, [open, verseKey]);

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
  // Navigation now runs to the surah's edges, so the verse can sit on a
  // different page than the one the sheet was opened from. Resolve the page
  // from the verse itself rather than using the `page` prop, which would come
  // back empty for anything past the original page's last ayah.
  useEffect(() => {
    if (!open || !currentKey) return;
    let cancelled = false;
    setVerseText("");
    const [s, a] = currentKey.split(":").map((n) => parseInt(n, 10));
    getPage(estimatePageForVerse(s, a))
      .then((verses) => {
        if (cancelled) return;
        const hit = verses.find((v) => v.sura === s && v.aya === a);
        if (hit) setVerseText(hit.text);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, currentKey]);

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
    readCachedTafsir(Number(effectiveResourceId), currentKey)
      .then((cached) => {
        if (cancelled) return null;
        // Offline-first: a downloaded tafsir renders with no network at all.
        if (cached) {
          setTafsir(cached);
          return null;
        }
        return fetchTafsirForAyah(s, a, effectiveResourceId);
      })
      .then((res) => {
        if (cancelled || !res) return;
        setTafsir(res.text);
        tafsirBodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(() => {
        if (cancelled) return;
        setTafsirError(t.mushaf.tafsirError);
      })
      .finally(() => {
        if (!cancelled) setTafsirLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, currentKey, effectiveResourceId, t]);

  // ── Prev / next helpers ───────────────────────────────────────────────────
  // Navigation is bounded by the surah, not by the mushaf page: from any ayah
  // the reader can walk to the first and last ayah of its surah, crossing page
  // boundaries on the way. Ayah numbering is contiguous within a surah, so the
  // bounds are simply 1..verses_count and no verse list is needed.
  const [curSura, curAya] = (currentKey ?? verseKey ?? "1:1")
    .split(":")
    .map((n) => parseInt(n, 10));

  // Ayah count of the current surah. `initMetadata()` runs at app start and the
  // viewer cannot render a page without it, so by the time this sheet opens the
  // cache is populated. If it somehow is not, 0 means "unknown" and forward
  // navigation stays open rather than being wrongly disabled — walking past the
  // last ayah then simply shows the tafsir-unavailable state.
  const suraAyaCount = useMemo(() => {
    const ch = getChapters().find((c: any) => c.id === curSura);
    return (ch?.verses_count as number) ?? 0;
  }, [curSura]);

  const hasPrev = curAya > 1;
  const hasNext = suraAyaCount === 0 || curAya < suraAyaCount;

  const goPrev = useCallback(() => {
    if (curAya > 1) setCurrentKey(`${curSura}:${curAya - 1}`);
  }, [curSura, curAya]);

  const goNext = useCallback(() => {
    if (suraAyaCount === 0 || curAya < suraAyaCount) {
      setCurrentKey(`${curSura}:${curAya + 1}`);
    }
  }, [curSura, curAya, suraAyaCount]);

  // Swipe left/right across the verse row to move between ayat. Scoped to that
  // row rather than the whole sheet so the tafsir body below keeps a plain
  // vertical scroll with no gesture competing for it.
  const swipeHandlers = useSwipeNav<HTMLDivElement>({
    onForward: goNext,
    onBack: goPrev,
    rtl: isRTL,
  });

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
        ref={sheetRef}
        className={`vas-sheet${nightClass}`}
        role="dialog"
        aria-label={t.mushaf.actionSheetTitle(displayKey)}
        dir={isRTL ? "rtl" : "ltr"}
        {...dragHandlers}
      >
        <div className="vas-handle" aria-hidden="true" />

        <header className="vas-header">
          <h3 className="vas-title">{t.mushaf.actionSheetTitle(displayKey)}</h3>
          <div className="vas-header-actions">
            {/* Play verse */}
            <button
              className={`vas-play-btn${isPlaying ? " vas-play-btn--active" : ""}${isNight ? " vas-play-btn--night" : ""}`}
              onClick={handlePlay}
              disabled={!activeKey || audioLoading}
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
              disabled={!activeKey}
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
              disabled={!activeKey}
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
              disabled={!activeKey}
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

        {/* ── Tafsir ── */}
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
              onClick={() => history.push("/tafsir-settings", { returnVerseKey: activeKey })}
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
                onClick={() => history.push("/tafsir-settings", { returnVerseKey: activeKey })}
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
        <div className={`vas-verse-row${nightClass}`} {...swipeHandlers}>
          <div className="vas-verse-center">
            <div className="vas-nav-inline">
              <button
                className={`vas-nav-btn${nightClass}`}
                onClick={goPrev}
                disabled={!hasPrev}
                aria-label={t.mushaf.contextPrevPage}
              >
                {isRTL ? "‹" : "›"}
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
                aria-label={t.mushaf.contextNextPage}
              >
                {isRTL ? "›" : "‹"}
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
      </aside>

      <NoteModal
        open={noteModalOpen}
        initialView={noteModalView}
        verseKey={activeKey}
        onClose={() => setNoteModalOpen(false)}
      />
    </>
  );
};

export default VerseActionSheet;
