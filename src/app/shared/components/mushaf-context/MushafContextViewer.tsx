/**
 * MUSHAF CONTEXT VIEWER
 *
 * Renders the Mushaf page that contains a target verse using the QPC V1
 * page-perfect renderer (same component PageViewer uses), with the target
 * verse highlighted. Used by quizzes as the side-panel context viewer.
 *
 * Header mirrors VerseContextViewer (surah · hizb · page nav · close) so the
 * swap is drop-in. Answer / hint reveal stays in the main quiz panel — the
 * Mushaf renders glyph-by-glyph (codeV1), so word-substitution overlays
 * don't apply here. Highlighting the verse is what the user needs.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  getPage,
  surahNamesArabic,
} from "../../../core/services/data/quran.service";
import { pageData } from "../../../../data/quranData";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import MushafPage from "../mushaf-page/MushafPage";
import type { Verse } from "../../models/verse.model";
// Pull the same hidden-verses set the PageViewer uses, so verses the user
// hid in the main reader stay hidden when this side-panel context viewer
// is opened from a quiz.
import { useVerseVisibility } from "../../../core/context/VerseVisibilityContext";
import "./MushafContextViewer.css";

interface VerseInfo {
  sura: number;
  aya: number;
  text: string;
  page: number;
  suraName?: string;
  suraNameAr?: string;
}

interface Props {
  verse: VerseInfo;
  /** Visible part of the target verse (the question prompt). Used to compute
   *  the initial reveal — words past it are masked until the user taps
   *  "Hint" to reveal them one at a time. */
  snippet?: string;
  /** Hidden portion (kept for API parity; the renderer derives masked words
   *  from the per-word data, not from this string). */
  hiddenPortion?: string;
  /** Quiz-level hint level. Forwarded only as the initial value; the viewer
   *  owns its own internal hint state so the user can keep revealing inside
   *  the panel without leaving it. */
  hintLevel?: number;
  /** When true, every word of the target verse is revealed (used after the
   *  user submits/skips). */
  showAnswer?: boolean;
  isOpen: boolean;
  onClose: () => void;
  mode?: "sidebar";
}

const MushafContextViewer: React.FC<Props> = ({
  verse,
  snippet,
  hintLevel: externalHintLevel,
  showAnswer,
  isOpen,
  onClose,
}) => {
  const [currentPage, setCurrentPage] = useState(verse.page);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  // Internal hint state — increments by 1 each tap. Resets whenever the
  // target verse changes. Seeded from the parent's hintLevel so a hint the
  // user already used in the main quiz panel carries over.
  const [internalHint, setInternalHint] = useState(externalHintLevel ?? 0);
  // Read the persistent hidden-verses set so reader-state survives the
  // jump into this side-panel viewer (and back out again).
  const { hidden, showVerse } = useVerseVisibility();

  // Number of words in the question's visible snippet. The target verse
  // shows exactly these words by default; "Hint" reveals one more word
  // each press until the verse is complete.
  const snippetWordCount = useMemo(() => {
    if (!snippet) return 0;
    return snippet.trim().split(/\s+/).filter(Boolean).length;
  }, [snippet]);

  // Total words in the target verse on this page (so we know when to
  // disable the hint button).
  const targetVerse = useMemo(
    () => verses.find((v) => v.sura === verse.sura && v.aya === verse.aya),
    [verses, verse.sura, verse.aya],
  );
  const targetWordCount =
    targetVerse?.words?.filter((w) => w.charType === "word").length ?? 0;

  // Reset internal hint when the target verse identity changes.
  useEffect(() => {
    setInternalHint(externalHintLevel ?? 0);
  }, [verse.sura, verse.aya, externalHintLevel]);

  // Tapping a hidden verse here unhides it — the only selection gesture
  // exposed in the quiz context viewer. Selection per se is intentionally
  // disabled here to keep the quiz UX simple.
  const handleVerseTap = (key: string) => {
    if (hidden.has(key)) showVerse(key);
  };

  const totalPages = pageData.length - 1;

  useEffect(() => {
    if (!isOpen) return;
    setCurrentPage(verse.page);
  }, [isOpen, verse.page, verse.sura, verse.aya]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    getPage(currentPage).then((pv) => {
      if (cancelled) return;
      setVerses(pv);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentPage]);

  const jumpToPage = (pg: number) => {
    if (pg < 1 || pg > totalPages || loading) return;
    setCurrentPage(pg);
  };

  const hdrSura =
    pageData[currentPage]?.[0] ?? verse.sura;
  const hdrSuraAr =
    surahNamesArabic[hdrSura] ?? verse.suraNameAr ?? `سورة ${hdrSura}`;
  const hdrHizb = Math.ceil(currentPage / 4);

  const showBismillah =
    verses.length > 0 && verses[0].aya === 1 && verses[0].sura !== 9;

  const targetOnPage = currentPage === verse.page;

  // ── Quiz styling ─────────────────────────────────────────────────────────
  // Grey: every verse on the target page that comes BEFORE the target. Only
  // applies when the target verse is on the visible page; otherwise we just
  // render the page normally so the user can skim around.
  const greySet = useMemo(() => {
    if (!targetOnPage) return undefined;
    const set = new Set<string>();
    for (const v of verses) {
      if (v.sura < verse.sura || (v.sura === verse.sura && v.aya < verse.aya)) {
        set.add(`${v.sura}:${v.aya}`);
      } else {
        break;
      }
    }
    return set;
  }, [verses, targetOnPage, verse.sura, verse.aya]);

  // Effective revealed-word count for the partial-target masking. After
  // submit/skip the parent flips `showAnswer` true — fully reveal then.
  const effectiveReveal = showAnswer
    ? targetWordCount
    : Math.min(targetWordCount, snippetWordCount + internalHint);

  const partialTarget = targetOnPage
    ? {
        sura: verse.sura,
        aya: verse.aya,
        revealedWordCount: effectiveReveal,
      }
    : undefined;

  const canHint = targetOnPage && effectiveReveal < targetWordCount;

  if (!isOpen) return null;

  return (
    <div className="mcv-container">
      <div className="mcv-header">
        <div className="mcv-header-title">
          <span className="mcv-surah-name">{hdrSuraAr}</span>
          <span className="mcv-hizb-badge">ح {toHindiNumbers(hdrHizb)}</span>
        </div>

        <div className="mcv-page-nav">
          <button
            className="mcv-nav-btn"
            onClick={() => jumpToPage(currentPage - 1)}
            disabled={loading || currentPage <= 1}
            title="الصفحة السابقة"
          >
            ►
          </button>
          <span className="mcv-page-num">{toHindiNumbers(currentPage)}</span>
          <button
            className="mcv-nav-btn"
            onClick={() => jumpToPage(currentPage + 1)}
            disabled={loading || currentPage >= totalPages}
            title="الصفحة التالية"
          >
            ◄
          </button>
        </div>

        <div className="mcv-header-actions">
          {canHint && (
            <button
              className="mcv-hint-btn"
              onClick={() => setInternalHint((n) => n + 1)}
              title="إظهار كلمة"
              aria-label="إظهار كلمة من الآية"
            >
              💡
            </button>
          )}
          {!targetOnPage && (
            <button
              className="mcv-jump-btn"
              onClick={() => jumpToPage(verse.page)}
              title="العودة إلى آية السؤال"
            >
              ⤴ {toHindiNumbers(verse.page)}
            </button>
          )}
          <button className="mcv-close-btn" onClick={onClose} title="إغلاق">
            ✕
          </button>
        </div>
      </div>

      <div className="mcv-body">
        {loading ? (
          <div className="mcv-loading">
            <div className="mcv-spinner" />
            <p>جاري تحميل الصفحة…</p>
          </div>
        ) : (
          <MushafPage
            page={currentPage}
            verses={verses}
            showBismillah={showBismillah}
            target={targetOnPage ? { sura: verse.sura, aya: verse.aya } : undefined}
            hidden={hidden}
            grey={greySet}
            partialTarget={partialTarget}
            onVerseTap={handleVerseTap}
          />
        )}
      </div>
    </div>
  );
};

export default MushafContextViewer;
