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

import React, { useEffect, useState } from "react";
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
  /** Kept for API parity with VerseContextViewer; unused here. */
  snippet?: string;
  hiddenPortion?: string;
  hintLevel?: number;
  showAnswer?: boolean;
  isOpen: boolean;
  onClose: () => void;
  mode?: "sidebar";
}

const MushafContextViewer: React.FC<Props> = ({ verse, isOpen, onClose }) => {
  const [currentPage, setCurrentPage] = useState(verse.page);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  // Read the persistent hidden-verses set so reader-state survives the
  // jump into this side-panel viewer (and back out again).
  const { hidden, showVerse } = useVerseVisibility();

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
            onVerseTap={handleVerseTap}
          />
        )}
      </div>
    </div>
  );
};

export default MushafContextViewer;
