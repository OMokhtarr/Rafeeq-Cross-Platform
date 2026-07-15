import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { getPage } from "../../../core/services/data/quran.service";
import {
  getSurahNameArabic,
  getSuraForPage,
  getChapters,
  estimatePageForVerse,
} from "../../../core/services/data/metadata.service";
import {
  toHindiNumbers,
  removeDiacritics,
} from "../../../core/utils/arabic.util";
import { useLang } from "../../../core/context/LanguageContext";
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
  grey?: Set<string>;
  hideAfterTarget?: boolean;
  /** Live recite position (page mode): the verse + word the matcher is
   *  currently on. As it moves past the target verse into later verses on
   *  the page, each is revealed word-by-word up to `wordIndex` (the verse
   *  the position is inside) with earlier verses fully shown — independent
   *  of the manual "reveal next verse" button. `wordIndex` is 0-based, one
   *  past the last revealed word. The revealed extent is remembered as a
   *  high-water mark, so it stays on screen after recitation stops. */
  liveRecitePosition?: { sura: number; aya: number; wordIndex: number } | null;
}

const MushafContextViewer: React.FC<Props> = ({
  verse,
  snippet,
  hintLevel: externalHintLevel,
  showAnswer,
  isOpen,
  onClose,
  liveRecitePosition,
}) => {
  const { t } = useLang();
  const [currentPage, setCurrentPage] = useState(verse.page);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalHint, setInternalHint] = useState(externalHintLevel ?? 0);
  const [revealedNextCount, setRevealedNextCount] = useState(0);
  const [bigTextMode, setBigTextMode] = useState(false);
  // Furthest point reached by live recitation, as a monotonic high-water
  // mark. It only ever moves forward and is NOT cleared when
  // liveRecitePosition goes null (recitation stopped) — so words revealed
  // by reciting stay on screen after the mic is turned off. Reset only when
  // the question (target verse) changes or the viewer reopens.
  const [reciteHighWater, setReciteHighWater] = useState<{
    sura: number;
    aya: number;
    wordIndex: number;
  } | null>(null);
  const { hidden: globalHidden, showVerse } = useVerseVisibility();
  const mushafPageRef = useRef<HTMLDivElement>(null);

  const targetVerse = useMemo(
    () => verses.find((v) => v.sura === verse.sura && v.aya === verse.aya),
    [verses, verse.sura, verse.aya],
  );
  const targetWordCount =
    targetVerse?.words?.filter((w) => w.charType === "end").length ?? 0;

  const snippetWordCount = useMemo(() => {
    if (!snippet) return 0;
    const apiWords =
      targetVerse?.words?.filter((w) => w.charType === "end") ?? [];
    if (apiWords.length === 0) return 0;
    const target = removeDiacritics(snippet).replace(/\s+/g, "");
    if (!target) return 0;
    let acc = "";
    for (let i = 0; i < apiWords.length; i++) {
      acc += removeDiacritics(apiWords[i].text_uthmani || "").replace(
        /\s+/g,
        "",
      );
      if (acc.length >= target.length) return i + 1;
    }
    return 0;
  }, [snippet, targetVerse]);

  // Reset hint when verse changes
  useEffect(() => {
    setInternalHint(externalHintLevel ?? 0);
  }, [verse.sura, verse.aya]); // eslint-disable-line

  // Live-follow the caller's hint level once it moves past what's shown
  // here — recite mode drives this prop upward word-by-word while
  // listening, and the viewer should reveal along with it.
  useEffect(() => {
    setInternalHint((current) =>
      externalHintLevel != null && externalHintLevel > current
        ? externalHintLevel
        : current,
    );
  }, [externalHintLevel]);

  useEffect(() => {
    setRevealedNextCount(0);
  }, [verse.sura, verse.aya, isOpen]);

  // New question / reopened viewer — forget the previous recitation's reach.
  useEffect(() => {
    setReciteHighWater(null);
  }, [verse.sura, verse.aya, isOpen]);

  // Advance the high-water mark forward only. A backward/equal live position
  // (or null, when recitation stops) never retracts what's already shown.
  useEffect(() => {
    if (!liveRecitePosition) return;
    setReciteHighWater((hw) => {
      if (
        !hw ||
        liveRecitePosition.sura > hw.sura ||
        (liveRecitePosition.sura === hw.sura && liveRecitePosition.aya > hw.aya) ||
        (liveRecitePosition.sura === hw.sura &&
          liveRecitePosition.aya === hw.aya &&
          liveRecitePosition.wordIndex > hw.wordIndex)
      ) {
        return liveRecitePosition;
      }
      return hw;
    });
  }, [liveRecitePosition]);

  const handleVerseTap = (key: string) => {
    if (globalHidden.has(key)) showVerse(key);
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

  // Width detection for big text mode
  useEffect(() => {
    const container = mushafPageRef.current;
    if (!container) return;
    const checkWidth = () => {
      const width = container.clientWidth;
      setBigTextMode(width < 250); // threshold = 250px, adjust as desired
    };
    checkWidth();
    const ro = new ResizeObserver(checkWidth);
    ro.observe(container);
    return () => ro.disconnect();
  }, [verses, loading]); // re-run when page changes

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
    const set = new Set<string>();
    for (const v of verses) {
      if (v.sura < verse.sura || (v.sura === verse.sura && v.aya < verse.aya)) {
        set.add(`${v.sura}:${v.aya}`);
      }
    }
    return set;
  }, [verses, verse.sura, verse.aya]);

  const nthVerseAfterTarget = useCallback(
    (n: number): { sura: number; aya: number } | null => {
      const chapters = getChapters();
      if (chapters.length === 0) return null;
      let s = verse.sura;
      let a = verse.aya;
      let remaining = n;
      while (remaining > 0) {
        const ch = chapters.find((c: any) => c.id === s);
        const count: number = ch?.verses_count ?? 0;
        if (a < count) {
          a += 1;
        } else {
          if (s >= 114) return null;
          s += 1;
          a = 1;
        }
        remaining -= 1;
      }
      return { sura: s, aya: a };
    },
    [verse.sura, verse.aya],
  );

  const maxRevealable = useMemo(() => {
    const chapters = getChapters();
    if (chapters.length === 0) return 0;
    let total = 0;
    for (const ch of chapters) {
      const count: number = ch.verses_count ?? 0;
      if (ch.id < verse.sura) continue;
      if (ch.id === verse.sura) total += Math.max(0, count - verse.aya);
      else total += count;
    }
    return total;
  }, [verse.sura, verse.aya]);

  const lastRevealed = useMemo(
    () =>
      revealedNextCount > 0 ? nthVerseAfterTarget(revealedNextCount) : null,
    [revealedNextCount, nthVerseAfterTarget],
  );

  const mergedHidden = useMemo(() => {
    const targetKey = `${verse.sura}:${verse.aya}`;
    const set = new Set<string>(globalHidden);
    set.delete(targetKey);
    // `cutoff` = the last verse revealed in full via the manual "reveal next
    // verse" button. Verses strictly after it are hidden. (Recitation is
    // bounded to the target verse and reveals its words through partialTarget,
    // not by unhiding later verses.)
    const cutoff = lastRevealed ?? { sura: verse.sura, aya: verse.aya };
    for (const v of verses) {
      const afterCutoff =
        v.sura > cutoff.sura || (v.sura === cutoff.sura && v.aya > cutoff.aya);
      if (afterCutoff) set.add(`${v.sura}:${v.aya}`);
    }
    return set;
  }, [globalHidden, verses, lastRevealed, verse.sura, verse.aya]);

  const canRevealNextVerse = revealedNextCount < maxRevealable;

  const handleRevealNext = () => {
    const nextN = revealedNextCount + 1;
    const nextVerse = nthVerseAfterTarget(nextN);
    setRevealedNextCount(nextN);
    if (nextVerse) {
      const pg = estimatePageForVerse(nextVerse.sura, nextVerse.aya);
      if (pg !== currentPage) setCurrentPage(pg);
    }
  };

  // How many target-verse words the live recitation has revealed (persistent
  // high-water, so the reveal doesn't retract when the mic stops). Recitation
  // is always bounded to the target verse now.
  const recitedWordCount =
    reciteHighWater &&
    reciteHighWater.sura === verse.sura &&
    reciteHighWater.aya === verse.aya
      ? reciteHighWater.wordIndex
      : 0;

  // Reveal is the union of the hint reveal (snippet + manual hint) and the
  // recitation reveal — the two are independent sources, both un-hide words.
  const effectiveReveal = showAnswer
    ? targetWordCount
    : Math.min(
        targetWordCount,
        Math.max(snippetWordCount + internalHint, recitedWordCount),
      );

  const partialTarget = useMemo(() => {
    if (!targetOnPage || !targetVerse) return undefined;
    const wordEntries = (targetVerse.words ?? []).filter(
      (w) => w.charType === "end",
    );
    const hiddenPositions = new Set<number>();
    // Green highlight for recited words (words 0..recitedWordCount-1). Uses
    // the persistent high-water so the last recited word stays green after
    // the mic stops. Distinct from the hint reveal — recited words are green,
    // hinted-only words use the hint style.
    const recitedPositions = new Set<number>();
    for (let i = 0; i < wordEntries.length; i++) {
      if (i >= effectiveReveal) hiddenPositions.add(wordEntries[i].position);
      if (i < recitedWordCount) recitedPositions.add(wordEntries[i].position);
    }
    return {
      sura: verse.sura,
      aya: verse.aya,
      revealedWordCount: effectiveReveal,
      hiddenPositions,
      recitedPositions,
    };
  }, [
    targetOnPage,
    targetVerse,
    effectiveReveal,
    recitedWordCount,
    verse.sura,
    verse.aya,
  ]);

  const partialForPage = partialTarget;

  const canHint = targetOnPage && effectiveReveal < targetWordCount;

  if (!isOpen) return null;

  return (
    <div className="mcv-container">
      <div className="mcv-header">
        <div className="mcv-header-title">
          <span className="mcv-surah-name">{hdrSuraAr}</span>
          <span className="mcv-hizb-badge">ح {toHindiNumbers(hdrHizb)}</span>
        </div>

        {!targetOnPage && (
          <button
            className="mcv-jump-btn"
            onClick={() => jumpToPage(verse.page)}
            title={t.mushaf.contextJumpBack}
          >
            ⤴ {toHindiNumbers(verse.page)}
          </button>
        )}
        <div className="mcv-page-nav">
          <button
            className="mcv-nav-btn"
            onClick={() => jumpToPage(currentPage - 1)}
            disabled={loading || currentPage <= 1}
            title={t.mushaf.contextPrevPage}
          >
            ►
          </button>
          <span className="mcv-page-num">{toHindiNumbers(currentPage)}</span>
          <button
            className="mcv-nav-btn"
            onClick={() => jumpToPage(currentPage + 1)}
            disabled={loading || currentPage >= totalPages}
            title={t.mushaf.contextNextPage}
          >
            ◄
          </button>
        </div>

        <div className="mcv-header-actions">
          {canHint && (
            <button
              className="mcv-hint-btn"
              onClick={() => setInternalHint((n) => n + 1)}
              title={t.mushaf.contextHint}
              aria-label={t.mushaf.contextHint}
            >
              💡
            </button>
          )}
          {canRevealNextVerse && (
            <button
              className="mcv-next-verse-btn"
              onClick={handleRevealNext}
              title="إظهار الآية التالية"
              aria-label="إظهار الآية التالية"
            >
              ⤵
            </button>
          )}
          <button
            className="mcv-close-btn"
            onClick={onClose}
            title={t.mushaf.contextClose}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="mcv-body">
        {loading ? (
          <div className="mcv-loading">
            <div className="mcv-spinner" />
            <p>{t.mushaf.contextLoading}</p>
          </div>
        ) : (
          <div ref={mushafPageRef} className="mushaf-page-wrapper">
            <MushafPage
              page={currentPage}
              verses={verses}
              hidden={mergedHidden}
              grey={greySet}
              partialTarget={partialForPage}
              onVerseTap={handleVerseTap}
              bigTextMode={bigTextMode}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default MushafContextViewer;
