import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  grey?: Set<string>; // verses to grey out
  hideAfterTarget?: boolean; // auto-hide verses after target
}

const MushafContextViewer: React.FC<Props> = ({
  verse,
  snippet,
  hintLevel: externalHintLevel,
  showAnswer,
  isOpen,
  onClose,
}) => {
  const { t } = useLang();
  const [currentPage, setCurrentPage] = useState(verse.page);
  const [verses, setVerses] = useState<Verse[]>([]);
  const [loading, setLoading] = useState(true);
  const [internalHint, setInternalHint] = useState(externalHintLevel ?? 0);
  const [revealedNextCount, setRevealedNextCount] = useState(0);
  const { hidden: globalHidden, showVerse } = useVerseVisibility();

  const targetVerse = useMemo(
    () => verses.find((v) => v.sura === verse.sura && v.aya === verse.aya),
    [verses, verse.sura, verse.aya],
  );
  const targetWordCount =
    targetVerse?.words?.filter((w) => w.charType === "word").length ?? 0;

  // Number of API words covered by the snippet text. Walks the API words
  // accumulating their diacritic-stripped text_uthmani until it matches the
  // snippet's stripped form. Falls back to space-token count if the verse
  // hasn't loaded yet or the match doesn't line up cleanly.
  const snippetWordCount = useMemo(() => {
    if (!snippet) return 0;
    const tokenCount = snippet.trim().split(/\s+/).filter(Boolean).length;
    const apiWords =
      targetVerse?.words?.filter((w) => w.charType === "word") ?? [];
    if (apiWords.length === 0) return tokenCount;
    const target = removeDiacritics(snippet).replace(/\s+/g, "");
    if (!target) return tokenCount;
    let acc = "";
    for (let i = 0; i < apiWords.length; i++) {
      acc += removeDiacritics(apiWords[i].text_uthmani || "").replace(
        /\s+/g,
        "",
      );
      if (acc.length >= target.length) return i + 1;
    }
    return tokenCount;
  }, [snippet, targetVerse]);

  // Reset hint count when the target verse changes. Intentionally excludes
  // externalHintLevel from deps: it is only the *initial* seed, not a live
  // controller. Including it would wipe accumulated hint presses on every
  // parent re-render that happens to pass a new prop reference.
  useEffect(() => {
    setInternalHint(externalHintLevel ?? 0);
  }, [verse.sura, verse.aya]); // eslint-disable-line -- externalHintLevel intentionally omitted

  useEffect(() => {
    setRevealedNextCount(0);
  }, [verse.sura, verse.aya, isOpen]);

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

  // Verses on the page strictly before the target are de-emphasized (grey).
  // This applies on any page at-or-before the target's page.
  const greySet = useMemo(() => {
    const set = new Set<string>();
    for (const v of verses) {
      if (v.sura < verse.sura || (v.sura === verse.sura && v.aya < verse.aya)) {
        set.add(`${v.sura}:${v.aya}`);
      }
    }
    return set;
  }, [verses, verse.sura, verse.aya]);

  // Nth verse after the target across surah boundaries. n=0 → target itself.
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

  // Total verses from the target to end of the Quran (exclusive of target).
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

  // The last revealed verse (inclusive). null when nothing past target revealed.
  const lastRevealed = useMemo(
    () =>
      revealedNextCount > 0 ? nthVerseAfterTarget(revealedNextCount) : null,
    [revealedNextCount, nthVerseAfterTarget],
  );

  // Hide every verse on the current page that comes after lastRevealed (or
  // after the target itself when nothing past target has been revealed yet).
  // IMPORTANT: the target verse itself must never appear in this set — its
  // visibility is controlled word-by-word via partialTarget/hiddenPositions.
  // If globalHidden already contains the target key (e.g. from a previous
  // quiz session), leaving it in would cause MushafPage to apply
  // mushaf-verse-hidden to *all* words of the verse, overriding the partial
  // reveal and making the hint button have no visible effect.
  const mergedHidden = useMemo(() => {
    const targetKey = `${verse.sura}:${verse.aya}`;
    const set = new Set<string>(globalHidden);
    set.delete(targetKey); // always let partialTarget control the target verse
    const cutoff = lastRevealed ?? { sura: verse.sura, aya: verse.aya };
    for (const v of verses) {
      const after =
        v.sura > cutoff.sura || (v.sura === cutoff.sura && v.aya > cutoff.aya);
      if (after) set.add(`${v.sura}:${v.aya}`);
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

  const effectiveReveal = showAnswer
    ? targetWordCount
    : Math.min(targetWordCount, snippetWordCount + internalHint);

  // Build the exact set of word positions to hide for the target verse.
  // Walk the actual API word entries (skipping the end marker) and collect the
  // `position` of every word past the reveal cutoff. This avoids any
  // assumption that API positions are 1..N contiguous — we just hide whichever
  // positions are observed past the cutoff in render order.
  const partialTarget = useMemo(() => {
    if (!targetVerse) return undefined;
    const wordEntries = (targetVerse.words ?? []).filter(
      (w) => w.charType === "word",
    );
    const hiddenPositions = new Set<number>();
    for (let i = 0; i < wordEntries.length; i++) {
      if (i >= effectiveReveal) hiddenPositions.add(wordEntries[i].position);
    }
    return {
      sura: verse.sura,
      aya: verse.aya,
      revealedWordCount: effectiveReveal,
      hiddenPositions,
    };
  }, [targetOnPage, targetVerse, effectiveReveal, verse.sura, verse.aya]);

  const canHint = !!targetVerse && effectiveReveal < targetWordCount;

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
          <MushafPage
            page={currentPage}
            verses={verses}
            showBismillah={showBismillah}
            hidden={mergedHidden}
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
