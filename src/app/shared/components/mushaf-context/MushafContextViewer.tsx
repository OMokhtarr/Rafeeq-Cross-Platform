/**
 * MUSHAF CONTEXT VIEWER
 *
 * Renders the Mushaf page that contains a target verse using the QPC V1
 * page-perfect renderer (same component PageViewer uses), with the target
 * verse highlighted. Used by quizzes as the side-panel context viewer.
 */

import React, { useEffect, useMemo, useState } from "react";
import { getPage } from "../../../core/services/data/quran.service";
import {
  getSurahNameArabic,
  getSuraForPage,
} from "../../../core/services/data/metadata.service";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import MushafPage from "../mushaf-page/MushafPage";
import type { Verse } from "../../models/verse.model";
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
  snippet?: string;
  hiddenPortion?: string;
  hintLevel?: number;
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
  const [internalHint, setInternalHint] = useState(externalHintLevel ?? 0);
  const { hidden, showVerse } = useVerseVisibility();

  const snippetWordCount = useMemo(() => {
    if (!snippet) return 0;
    return snippet.trim().split(/\s+/).filter(Boolean).length;
  }, [snippet]);

  const targetVerse = useMemo(
    () => verses.find((v) => v.sura === verse.sura && v.aya === verse.aya),
    [verses, verse.sura, verse.aya],
  );
  const targetWordCount =
    targetVerse?.words?.filter((w) => w.charType === "word").length ?? 0;

  useEffect(() => {
    setInternalHint(externalHintLevel ?? 0);
  }, [verse.sura, verse.aya, externalHintLevel]);

  const handleVerseTap = (key: string) => {
    if (hidden.has(key)) showVerse(key);
  };

  const totalPages = 604;

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

  const hdrSura = getSuraForPage(currentPage) ?? verse.sura;
  const hdrSuraAr =
    getSurahNameArabic(hdrSura) ?? verse.suraNameAr ?? `سورة ${hdrSura}`;
  const hdrHizb = Math.ceil(currentPage / 4);

  const showBismillah =
    verses.length > 0 && verses[0].aya === 1 && verses[0].sura !== 9;

  const targetOnPage = currentPage === verse.page;

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
            target={
              targetOnPage ? { sura: verse.sura, aya: verse.aya } : undefined
            }
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
