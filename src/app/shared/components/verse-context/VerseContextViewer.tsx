/**
 * VERSE CONTEXT VIEWER
 *
 * Uses pageData to show exactly the verses belonging to the current page.
 * Font is binary-searched so all revealed items + ghost bars fit without
 * overflow or scrolling. Never overlaps the header or any other chrome.
 *
 * Available height = vcv-body clientHeight − bismillah height
 * (header is outside vcv-body so already excluded by flex layout)
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  getPage,
  surahNamesArabic,
} from "../../../core/services/data/quran.service";
import { pageData } from "../../../../data/quranData";
import { toHindiNumbers } from "../../../core/utils/arabic.util";
import "./VerseContextViewer.css";

// ── Types ──────────────────────────────────────────────────────────────────────

interface VerseInfo {
  sura: number;
  aya: number;
  text: string;
  page: number;
  suraName?: string;
  suraNameAr?: string;
}

interface PageVerse {
  sura: number;
  aya: number;
  text: string;
  page: number;
  suraName?: string;
  suraNameAr?: string;
}

interface DisplayItem {
  kind: "verse";
  verse: PageVerse;
  role: "prev" | "target" | "next";
}

interface Props {
  verse: VerseInfo;
  snippet: string;
  hiddenPortion: string;
  hintLevel: number;
  showAnswer: boolean;
  isOpen: boolean;
  onClose: () => void;
  mode?: "sidebar";
}

// ── Constants ──────────────────────────────────────────────────────────────────

const LINE_HEIGHT_RATIO = 1.75;
const FONT_MIN = 9;
const FONT_MAX = 18; // compact panel — keep ceiling modest

// ── Component ──────────────────────────────────────────────────────────────────

const VerseContextViewer: React.FC<Props> = ({
  verse,
  snippet,
  hiddenPortion,
  hintLevel,
  showAnswer,
  isOpen,
  onClose,
}) => {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingNext, setLoadingNext] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastLoadedPage, setLastLoadedPage] = useState(0);
  const [lastPageVerses, setLastPageVerses] = useState<PageVerse[]>([]);
  const [lastRevealedIdx, setLastRevealedIdx] = useState(-1);
  const [headerPage, setHeaderPage] = useState(0);
  const [dynamicFontSize, setDynamicFontSize] = useState(13);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement>(null); // .vcv-body
  const bismillahRef = useRef<HTMLDivElement>(null); // bismillah strip
  const textFlowRef = useRef<HTMLDivElement>(null); // text flow
  const rafRef = useRef<number>(0);

  const totalPages = pageData.length - 1;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const suraForPage = (pg: number): number =>
    pg > 0 && pageData[pg] ? pageData[pg][0] : verse.sura;
  const hizbForPage = (pg: number): number => Math.ceil(pg / 4);

  // ── Available height = vcv-body − bismillah − body padding ────────────────
  // clientHeight includes padding, so subtract the actual computed padding
  // (stays correct even if .vcv-body CSS padding is later adjusted).
  const getAvailableHeight = useCallback((): number => {
    if (!bodyRef.current) return 0;
    const el = bodyRef.current;
    const cs = window.getComputedStyle(el);
    const padT = parseFloat(cs.paddingTop) || 0;
    const padB = parseFloat(cs.paddingBottom) || 0;
    const bismillahH = bismillahRef.current?.offsetHeight ?? 0;
    return el.clientHeight - padT - padB - bismillahH;
  }, []);

  // ── Binary-search font that fits all rendered content ─────────────────────
  // Builds a probe representing: revealed items + ghost bars for unrevealed.
  const fitContent = useCallback(() => {
    if (!textFlowRef.current || items.length === 0) return;

    const availH = getAvailableHeight();
    if (availH <= 0) return;

    const containerW = textFlowRef.current.clientWidth;

    const probe = document.createElement("div");
    probe.style.cssText = [
      "position:absolute",
      "visibility:hidden",
      "pointer-events:none",
      `width:${containerW}px`,
      `line-height:${LINE_HEIGHT_RATIO}`,
      'font-family:"Traditional Arabic","Amiri","Scheherazade New",serif',
      "text-align:justify",
      "direction:rtl",
      "word-spacing:0.08em",
      "white-space:normal",
      "overflow:visible",
      "box-sizing:border-box",
    ].join(";");
    document.body.appendChild(probe);

    // Separator HTML — sized relative to font (em units)
    const sepHTML = `<span style="display:inline-block;width:2.6em;height:2.4em;vertical-align:middle;margin:0 1px"></span>`;

    // Build HTML for revealed items
    const revealedHTML = items
      .map((item) => {
        const pv = item.verse;
        if (item.role === "prev") {
          return `<span style="display:inline;color:#1a5fa8">${pv.text}</span>${sepHTML}`;
        }
        if (item.role === "target") {
          return (
            `<span style="display:inline;background:rgba(255,215,0,0.22);border-radius:4px;padding:1px 3px">` +
            `${snippet}${hiddenPortion}</span>${sepHTML}`
          );
        }
        return `<span style="display:inline;color:#2a2a2a">${pv.text}</span>${sepHTML}`;
      })
      .join("");

    // Ghost bars for unrevealed verses on this page
    const ghostHTML = lastPageVerses
      .slice(lastRevealedIdx + 1)
      .map(
        () =>
          `<span style="display:inline-block;width:clamp(8em,60%,18em);height:0.22em;` +
          `background:#d8d0c4;border-radius:4px;vertical-align:middle;margin:0 2px;opacity:0.75"></span>${sepHTML}`,
      )
      .join("");

    const fullHTML = revealedHTML + ghostHTML;

    // Binary search
    let lo = FONT_MIN,
      hi = FONT_MAX,
      bestFs = FONT_MIN;
    for (let i = 0; i < 7; i++) {
      const mid = Math.floor((lo + hi) / 2);
      probe.style.fontSize = `${mid}px`;
      probe.innerHTML = fullHTML;
      if (probe.scrollHeight <= availH + 1) {
        bestFs = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    document.body.removeChild(probe);
    setDynamicFontSize(bestFs);
  }, [
    items,
    lastPageVerses,
    lastRevealedIdx,
    snippet,
    hiddenPortion,
    getAvailableHeight,
  ]);

  // ── Re-fit whenever content or size changes ───────────────────────────────
  useEffect(() => {
    if (loading || items.length === 0) return;

    const run = () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() =>
        requestAnimationFrame(() => fitContent()),
      );
    };

    run();

    const ro = new ResizeObserver(run);
    if (bodyRef.current) ro.observe(bodyRef.current);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", run);
    window.addEventListener("orientationchange", run);

    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", run);
      window.removeEventListener("orientationchange", run);
      cancelAnimationFrame(rafRef.current);
    };
  }, [loading, items, fitContent]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !verse?.page) return;
    let cancelled = false;

    setLoading(true);
    setItems([]);
    setHasMore(true);

    getPage(verse.page).then((verses) => {
      if (cancelled) return;

      const targetIdx = verses.findIndex(
        (v) => v.sura === verse.sura && v.aya === verse.aya,
      );
      const cutoff = targetIdx >= 0 ? targetIdx : verses.length - 1;

      const initial: DisplayItem[] = verses.slice(0, cutoff).map((pv) => ({
        kind: "verse" as const,
        verse: pv,
        role: "prev" as const,
      }));
      if (targetIdx >= 0) {
        initial.push({
          kind: "verse",
          verse: verses[targetIdx],
          role: "target",
        });
      }

      setItems(initial);
      setLastLoadedPage(verse.page);
      setLastPageVerses(verses);
      setLastRevealedIdx(cutoff);
      setHeaderPage(verse.page);
      setHasMore(cutoff < verses.length - 1 || verse.page < totalPages);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, verse?.page, verse?.sura, verse?.aya, totalPages]);

  // ── Reveal next verse ─────────────────────────────────────────────────────
  const handleRevealNext = useCallback(async () => {
    if (loadingNext || !hasMore) return;

    const nextIdx = lastRevealedIdx + 1;

    if (nextIdx < lastPageVerses.length) {
      const pv = lastPageVerses[nextIdx];
      setItems((prev) => [...prev, { kind: "verse", verse: pv, role: "next" }]);
      setLastRevealedIdx(nextIdx);
      setHasMore(
        nextIdx < lastPageVerses.length - 1 || lastLoadedPage < totalPages,
      );
    } else {
      const nextPage = lastLoadedPage + 1;
      if (nextPage > totalPages) {
        setHasMore(false);
        return;
      }

      setLoadingNext(true);
      const nextVerses = await getPage(nextPage);
      setLoadingNext(false);

      if (!nextVerses.length) {
        setHasMore(false);
        return;
      }

      setItems([{ kind: "verse", verse: nextVerses[0], role: "next" }]);
      setLastLoadedPage(nextPage);
      setLastPageVerses(nextVerses);
      setLastRevealedIdx(0);
      setHeaderPage(nextPage);
      setHasMore(nextVerses.length > 1 || nextPage < totalPages);
    }
  }, [
    loadingNext,
    hasMore,
    lastRevealedIdx,
    lastPageVerses,
    lastLoadedPage,
    totalPages,
  ]);

  // ── Jump to page ──────────────────────────────────────────────────────────
  const jumpToPage = useCallback(
    async (pg: number) => {
      if (pg < 1 || pg > totalPages || loading) return;
      setLoading(true);
      const verses = await getPage(pg);
      if (!verses.length) {
        setLoading(false);
        return;
      }

      setItems([{ kind: "verse", verse: verses[0], role: "next" }]);
      setLastLoadedPage(pg);
      setLastPageVerses(verses);
      setLastRevealedIdx(0);
      setHeaderPage(pg);
      setHasMore(verses.length > 1 || pg < totalPages);
      setLoading(false);
    },
    [loading, totalPages],
  );

  // ── Hint / mask ───────────────────────────────────────────────────────────
  const hintText =
    hintLevel > 0 && hiddenPortion
      ? hiddenPortion
          .trim()
          .split(" ")
          .filter(Boolean)
          .slice(0, hintLevel)
          .join(" ")
      : "";
  const remainingMask =
    !showAnswer && hiddenPortion
      ? hintLevel > 0
        ? hiddenPortion
            .trim()
            .split(" ")
            .filter(Boolean)
            .slice(hintLevel)
            .join(" ")
        : hiddenPortion
      : "";

  // ── Separator ─────────────────────────────────────────────────────────────
  const Separator = ({
    aya,
    isTarget = false,
  }: {
    aya: number;
    isTarget?: boolean;
  }) => (
    <span className={`vcv-sep${isTarget ? " vcv-sep-target" : ""}`}>
      <span className="vcv-sep-symbol" aria-hidden="true">
        ۝
      </span>
      <span className="vcv-sep-number">{toHindiNumbers(aya)}</span>
    </span>
  );

  // ── Derived header values ─────────────────────────────────────────────────
  const currentPage = headerPage || verse.page;
  const hdrSura = suraForPage(currentPage);
  const hdrSuraAr =
    surahNamesArabic[hdrSura] ?? verse.suraNameAr ?? `سورة ${hdrSura}`;
  const hdrHizb = hizbForPage(currentPage);

  // Bismillah if first item is aya 1 of any surah except 9
  const showBismillah =
    items.length > 0 && items[0].verse.aya === 1 && items[0].verse.sura !== 9;

  if (!isOpen) return null;

  return (
    <div className="vcv-container">
      {/* ── Header ── */}
      <div className="vcv-header">
        <div className="vcv-header-title">
          <span className="vcv-surah-name">{hdrSuraAr}</span>
          <span className="vcv-hizb-badge">ح {toHindiNumbers(hdrHizb)}</span>
        </div>

        <div className="vcv-page-nav">
          <button
            className="vcv-nav-btn"
            onClick={() => jumpToPage(currentPage - 1)}
            disabled={loading || currentPage <= 1}
            title="الصفحة السابقة"
          >
            ►
          </button>
          <span className="vcv-page-num">{toHindiNumbers(currentPage)}</span>
          <button
            className="vcv-nav-btn"
            onClick={() => jumpToPage(currentPage + 1)}
            disabled={loading || currentPage >= totalPages}
            title="الصفحة التالية"
          >
            ◄
          </button>
        </div>

        <div className="vcv-header-actions">
          {!loading && hasMore && (
            <button
              className="vcv-next-verse-btn"
              onClick={handleRevealNext}
              disabled={loadingNext}
              title="الآية التالية"
            >
              {loadingNext ? (
                <span className="vcv-mini-spinner" />
              ) : (
                <span>▼ التالية</span>
              )}
            </button>
          )}
          <button className="vcv-close-btn" onClick={onClose} title="إغلاق">
            ✕
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="vcv-body" ref={bodyRef}>
        {loading ? (
          <div className="vcv-loading">
            <div className="vcv-spinner" />
            <p>جاري تحميل الصفحة…</p>
          </div>
        ) : (
          <>
            {/* Bismillah — ref so height excluded from text budget */}
            {showBismillah && (
              <div className="vcv-bismillah" ref={bismillahRef}>
                ﷽
              </div>
            )}

            {/* Text flow — font binary-searched to fit everything */}
            <div
              className="vcv-text-flow"
              ref={textFlowRef}
              style={{
                fontSize: `${dynamicFontSize}px`,
                lineHeight: `${LINE_HEIGHT_RATIO}`,
              }}
            >
              {/* Revealed items */}
              {items.map((item, i) => {
                const pv = item.verse;
                const key = `${item.role}-${pv.sura}-${pv.aya}-${i}`;

                if (item.role === "prev")
                  return (
                    <React.Fragment key={key}>
                      <span className="vcv-verse vcv-verse-prev">
                        {pv.text}
                      </span>
                      <Separator aya={pv.aya} />
                    </React.Fragment>
                  );

                if (item.role === "target")
                  return (
                    <React.Fragment key={key}>
                      <span className="vcv-verse vcv-verse-target">
                        <span className="vcv-snippet">{snippet}</span>
                        {hintText && (
                          <span className="vcv-hint"> {hintText}</span>
                        )}
                        {showAnswer && (
                          <span className="vcv-answer"> {hiddenPortion}</span>
                        )}
                        {!showAnswer && remainingMask && (
                          <span className="vcv-mask"> {remainingMask}</span>
                        )}
                      </span>
                      <Separator aya={pv.aya} isTarget />
                    </React.Fragment>
                  );

                return (
                  <React.Fragment key={key}>
                    <span className="vcv-verse vcv-verse-next">{pv.text}</span>
                    <Separator aya={pv.aya} />
                  </React.Fragment>
                );
              })}

              {/* Ghost placeholders for unrevealed verses on this page */}
              {lastPageVerses.slice(lastRevealedIdx + 1).map((pv) => (
                <React.Fragment key={`ghost-${pv.sura}-${pv.aya}`}>
                  <span
                    className="vcv-verse vcv-verse-ghost"
                    aria-hidden="true"
                  />
                  <Separator aya={pv.aya} />
                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default VerseContextViewer;
