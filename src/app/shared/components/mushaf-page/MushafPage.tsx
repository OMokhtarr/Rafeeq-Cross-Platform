/**
 * MUSHAF PAGE
 *
 * Renders a single Madani Mushaf page using QPC V4 Tajweed glyphs.
  * shape is whatever quran.service.getPage(n) returns — each verse carries a
 * `words` array with `codeV2` strings and `lineNumber` 1..15.
 *
 * Render strategy:
 *   - Group words by lineNumber (1..15).
 *   - Each line is a flex row, justified between, glyphs drawn in the
 *     page-specific font (registered by ensurePageFont).
 *   - End-of-ayah ornaments come from the same font and are kept in place
 *     so verse boundaries appear exactly as in the printed Mushaf.
 *
 * Selection / hide overlays:
 *   - Each glyph span carries `data-verse-key="sura:aya"` so the parent
 *     can light up every word in a verse with a single CSS rule.
 *   - Selection visual = soft gold ring (works on both day/night themes).
 *   - Hidden visual = glyphs faded + small "آية مخفية" placeholder badge
 *     pinned to the verse-end ornament. Layout/measurement isn't disturbed,
 *     so the page-perfect Madani lines stay intact when verses are hidden.
 *   - Tap (or long-press) any word to toggle selection — handled by parent
 *     via the `onVerseTap` callback, which receives the verse key.
 *
 * The font is loaded asynchronously; while it's loading the page shows a
 * spinner. Subsequent visits to the same page hit the IDB font cache and
 * paint instantly.

* Supports two layout modes:
 *   - bigTextMode = false: strict line‑by‑line layout (as in printed Mushaf)
 *   - bigTextMode = true: relaxed, natural word‑wrapped layout for large text / narrow screens
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Verse, VerseWord } from "../../models/verse.model";
import {
  ensurePageFont,
  ensureBismillahFont,
  ensureSurahNamesFont,
  fontFamilyForPage,
  paletteNameForPage,
  setMonoPaletteColor,
  BISMILLAH_FONT_FAMILY,
} from "../../../core/services/api/font.loader";
import { getSurahNameArabic } from "../../../core/services/data/metadata.service";
import { useTheme } from "../../../core/context/ThemeContext";
import { findLineGaps, gapBeforeLine } from "./page-line-gaps";
import { measureTextZoom } from "./text-zoom";
import {
  SURAH_BANNER_PATH,
  SURAH_BANNER_VIEWBOX,
} from "./surah-banner.art";
import "./MushafPage.css";

interface Props {
  page: number;
  verses: Verse[];
  target?: { sura: number; aya: number };
  flash?: { sura: number; aya: number };
  selected?: Set<string>;
  hidden?: Set<string>;
  green?: Set<string>;
  grey?: Set<string>;
  partialTarget?: {
    sura: number;
    aya: number;
    revealedWordCount: number;
    hiddenPositions?: Set<number>;
    hintedPositions?: Set<number>;
    /** Word positions currently being recited correctly — highlighted green
     *  as live "you said this" feedback during recite mode. */
    recitedPositions?: Set<number>;
  };
  onVerseTap?: (verseKey: string) => void;
  onVerseLongPress?: (verseKey: string) => void;
  /**
   * When true, disables the strict line‑by‑line Madani layout and uses
   * a flex‑wrapped container that allows natural line breaks.
   * Prevents cut‑off glyphs and excessive gaps on narrow viewports.
   */
  bigTextMode?: boolean;
}

const LONG_PRESS_MS = 350;

const MushafPage: React.FC<Props> = ({
  page,
  verses,
  target,
  flash,
  selected,
  hidden,
  green,
  grey,
  partialTarget,
  onVerseTap,
  onVerseLongPress,
  bigTextMode = false,
}) => {
  const [fontReady, setFontReady] = useState(false);
  const { theme } = useTheme();
  const [tajweedOn, setTajweedOn] = useState(readTajweedSetting);

  // Live reaction to the "Tajweed colors" toggle in Settings. The native
  // `storage` event only fires across tabs, so Settings also dispatches a
  // same-tab `rafiq-settings-changed` CustomEvent whenever it persists.
  useEffect(() => {
    const refresh = () => setTajweedOn(readTajweedSetting());
    window.addEventListener("storage", refresh);
    window.addEventListener("rafiq-settings-changed", refresh);
    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("rafiq-settings-changed", refresh);
    };
  }, []);

  // Push the active text color into the V4 mono palette whenever theme
  // changes. The mono palette overrides every color slot to a literal
  // color (instead of `currentColor`, which has spotty support inside
  // `override-colors`), so it has to be rebuilt on theme flip.
  useEffect(() => {
    setMonoPaletteColor(theme === "night" ? "#ffffff" : "#000000");
  }, [theme]);

  // Refs for tap-vs-longpress detection. We treat both gestures the same
  // (toggle selection) but suppress synthetic clicks fired after a long
  // press so we don't double-toggle on touch devices.
  const pressTimer = useRef<number | null>(null);
  const pressKey = useRef<string | null>(null);
  const consumedByLongPress = useRef(false);
  const endMarkerTouchStart = useRef<{ x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Hidden-verse line overlays: one horizontal bar per (verse × mushaf-line).
  interface HiddenSegment {
    top: number;
    left: number;
    width: number;
  }
  const [hiddenSegments, setHiddenSegments] = useState<HiddenSegment[]>([]);

  // Mid-page surah starts: any aya-1 verse that isn't the first verse on
  // the page. These render an inline surah-name banner + (for non-Tawbah)
  // bismillah row positioned right before the line where the new surah's
  // first word lives. The page-start surah (verses[0].aya === 1) stays
  // handled by the top-of-page banner so existing layouts don't shift.
  const surahStartVerse =
    verses.length > 0 && verses[0].aya === 1 ? verses[0] : null;

  // Where this page reserves lines for surah headers / bismillah. Derived from
  // the API's own line numbering — see page-line-gaps.ts for why.
  const lineGaps = React.useMemo(() => {
    const usedLines: number[] = [];
    for (const v of verses)
      for (const w of v.words ?? []) usedLines.push(w.lineNumber);
    return findLineGaps(usedLines);
  }, [verses]);

  const gapBefore = React.useCallback(
    (line: number) => gapBeforeLine(lineGaps, line),
    [lineGaps],
  );

  const topGap = surahStartVerse?.words?.length
    ? gapBefore(surahStartVerse.words[0].lineNumber)
    : null;

  // Pages 1-2 (Al-Fatihah / start of Al-Baqarah) are centered blocks with a
  // large leading gap rather than the standard 15-line grid, so they keep the
  // existing top-of-page treatment instead of gap-derived slots.
  const isOpeningPage = page <= 2;

  const showTopHeader = !!surahStartVerse && (isOpeningPage || !!topGap);
  const showTopBismillah =
    !!surahStartVerse &&
    surahStartVerse.sura !== 9 &&
    page > 1 &&
    (isOpeningPage || (topGap?.size ?? 0) >= 2);

  // NB: there is deliberately no "trailing header" for the next page's surah.
  // The printed page never carries it: when a surah's header belongs at the
  // bottom of a page, that page's own line data contains the gap *and* the
  // surah's opening text. Drawing one ahead of the page break is what made the
  // header appear on two consecutive pages.

  const midPageSurahStarts = React.useMemo(() => {
    if (verses.length === 0) return [];
    return verses
      .filter((v, idx) => idx > 0 && v.aya === 1 && v.words?.length)
      .map((v) => {
        const gap = gapBefore(v.words[0].lineNumber);
        return {
          sura: v.sura,
          lineNumber: v.words[0].lineNumber,
          // Only claim a bismillah row when the page actually reserved two
          // lines for this surah. At-Tawbah gets a one-line gap (header only),
          // and the data says so without needing a special case.
          showBismillah: v.sura !== 9 && (gap?.size ?? 0) >= 2,
        };
      });
  }, [verses, gapBefore]);

  // Bismillah font is needed if the top bismillah is shown OR any mid-page
  // surah start renders its own inline bismillah.
  const needsBismillahFont =
    showTopBismillah || midPageSurahStarts.some((s) => s.showBismillah);

  // Surah-name font is needed wherever a banner is drawn — at the top of the
  // page or before any mid-page surah start.
  const needsSurahNamesFont =
    showTopHeader || midPageSurahStarts.length > 0;

  useEffect(() => {
    let cancelled = false;
    setFontReady(false);
    Promise.all([
      ensurePageFont(page),
      needsBismillahFont ? ensureBismillahFont() : Promise.resolve(),
      needsSurahNamesFont ? ensureSurahNamesFont() : Promise.resolve(),
    ])
      .then(() => {
        if (!cancelled) setFontReady(true);
      })
      .catch((err) => {
        console.error("[MushafPage] font load failed", err);
        if (!cancelled) setFontReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [page, needsBismillahFont, needsSurahNamesFont]);

  // Keep --slot-px in sync with the container height so the surah header and
  // bismillah always occupy exactly 1/15 of the page (no font-size fitting).
  // Font-size is derived from the height available for verse lines only.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const h = el.clientHeight;
      const w = el.clientWidth;
      if (h <= 0 || w <= 0) return;
      const slotPx = Math.round(h / 15);
      el.style.setProperty("--slot-px", `${slotPx}px`);
      el.style.setProperty("--header-px", `${slotPx}px`);
      // The OS text-size setting reaches the WebView as a post-layout glyph
      // multiplier (see text-zoom.ts). The Mushaf page is a fixed 15-line grid
      // whose lines must never wrap or run past the page edge, so its glyph
      // size is dictated by the page geometry alone: divide the zoom back out
      // so Quran text renders at its designed size at any OS font setting.
      // Every other surface in the app still scales normally.
      const zoom = measureTextZoom();
      // Published so the CSS-sized slots (bismillah, surah name) can cancel
      // the same multiplier — they must stay inside their fixed-height slot.
      el.style.setProperty("--text-zoom", `${zoom}`);
      const setFontPx = (px: number) => {
        el.style.fontSize = `${px / zoom}px`;
      };
      // Pages 1-2 stack naturally from top — width-only sizing.
      if (page <= 2) {
        setFontPx(Math.round(Math.min(w * 0.055, 28)));
        return;
      }
      // Font size is always derived from a full 15-slot page so text stays
      // the same size regardless of how many slots header/bismillah occupy.
      // Header and bismillah have a fixed height (--slot-px) that comes out
      // of the flex space-between distribution — they don't shrink the text.
      const byHeight = slotPx / 2.0;
      const byWidth = w * 0.052;
      setFontPx(Math.round(Math.min(byHeight, byWidth)));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fontReady, page]);

  // Measure hidden-word spans after layout and compute one overlay bar per
  // contiguous hidden segment on each mushaf line.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const hasHidden = hidden && hidden.size > 0;
    const hasPartial =
      partialTarget &&
      partialTarget.hiddenPositions &&
      partialTarget.hiddenPositions.size > 0;
    if (!container || (!hasHidden && !hasPartial)) {
      setHiddenSegments([]);
      return;
    }
    const containerRect = container.getBoundingClientRect();
    // Each hidden non-end-marker word gets data-hidden-seg="verseKey:lineNum"
    const spans = container.querySelectorAll<HTMLElement>("[data-hidden-seg]");
    // Group spans by their segment key (verseKey:lineNum)
    const groups = new Map<string, HTMLElement[]>();
    for (const span of spans) {
      const segKey = span.dataset.hiddenSeg!;
      const arr = groups.get(segKey) ?? [];
      arr.push(span);
      groups.set(segKey, arr);
    }
    const segments: HiddenSegment[] = [];
    for (const spans of groups.values()) {
      if (spans.length === 0) continue;
      let minLeft = Infinity;
      let maxRight = -Infinity;
      let bottomY = 0;
      for (const span of spans) {
        const r = span.getBoundingClientRect();
        if (r.width === 0) continue;
        minLeft = Math.min(minLeft, r.left);
        maxRight = Math.max(maxRight, r.right);
        bottomY = r.bottom - r.height * 0.3;
      }
      if (minLeft === Infinity) continue;
      segments.push({
        left: minLeft - containerRect.left,
        width: maxRight - minLeft,
        top: bottomY - containerRect.top,
      });
    }
    setHiddenSegments(segments);
  }, [hidden, partialTarget, fontReady, verses, bigTextMode]);

  if (!fontReady) {
    return (
      <div className="mushaf-page-loading">
        <div className="mushaf-spinner" aria-label="Loading Mushaf" />
      </div>
    );
  }

  const lines = groupByLine(verses);
  const family = fontFamilyForPage(page);

  const handleClick = (key: string) => {
    if (!onVerseTap) return;
    if (consumedByLongPress.current) {
      consumedByLongPress.current = false;
      return;
    }
    onVerseTap(key);
  };

  const startPress = (key: string) => {
    if (!onVerseTap && !onVerseLongPress) return;
    pressKey.current = key;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      consumedByLongPress.current = true;
      const handler = onVerseLongPress ?? onVerseTap;
      handler?.(key);
    }, LONG_PRESS_MS);
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressKey.current = null;
  };

  const longPressFire = (key: string) => {
    const handler = onVerseLongPress ?? onVerseTap;
    handler?.(key);
  };

  /**
   * Ornamental surah banner, drawn the way the printed Mushaf does it: the
   * name and its frame are a single glyph in the SurahNames font, selected by
   * typing the zero-padded surah number ("081" → At-Takwir). The digits are a
   * glyph selector rather than readable content, so they are hidden from
   * assistive tech (the real name goes on aria-label) and marked
   * translate="no" so a page translator can't rewrite them into another
   * numeral system and break the ligature.
   */
  const renderSurahHeader = (sura: number, key: string) => {
    const name = getSurahNameArabic(sura);
    return (
      <div
        className="mushaf-surah-header"
        role="heading"
        aria-level={2}
        aria-label={name ? `سُورَةُ ${name}` : undefined}
        key={key}
      >
        {/* Illuminated band. Sits behind the name and scales to the slot; the
            path is the ornament's ink, so it picks up the header's color. */}
        <svg
          className="mushaf-surah-header-frame"
          viewBox={SURAH_BANNER_VIEWBOX}
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path fill="currentColor" fillRule="evenodd" d={SURAH_BANNER_PATH} />
        </svg>
        {/* The name, centered in the cartouche the artwork leaves clear. */}
        <span
          className="mushaf-surah-header-name"
          translate="no"
          aria-hidden="true"
        >
          {String(sura).padStart(3, "0")}
        </span>
      </div>
    );
  };

  const renderBismillah = (key: string) => (
    <div
      className="mushaf-bismillah"
      style={{ fontFamily: BISMILLAH_FONT_FAMILY }}
      key={key}
    >
      ﭑ ﭒ ﭓ
    </div>
  );

  // When header and bismillah appear together they each get their own full slot
  // (13-line pages have 2 free slots — header takes slot 1, bismillah takes slot 2).
  const renderHeaderWithBismillah = (sura: number, keyPrefix: string) => (
    // No name lookup guard here: the banner is a glyph keyed off the surah
    // number, so it renders even if the Arabic name isn't in metadata yet
    // (the name is only used for the accessible label).
    <React.Fragment key={keyPrefix}>
      {renderSurahHeader(sura, `${keyPrefix}-header`)}
      {renderBismillah(`${keyPrefix}-bismillah`)}
    </React.Fragment>
  );

  const midStartsByLine = new Map<number, typeof midPageSurahStarts>();
  for (const s of midPageSurahStarts) {
    const arr = midStartsByLine.get(s.lineNumber) ?? [];
    arr.push(s);
    midStartsByLine.set(s.lineNumber, arr);
  }

  // Helper to render a single word/end‑marker with all its interactions
  const renderWord = (
    tw: { word: VerseWord; sura: number; aya: number },
    idx: number,
    lineNumber: number,
  ) => {
    const key = `${tw.sura}:${tw.aya}`;
    const isTarget =
      !!target && tw.sura === target.sura && tw.aya === target.aya;
    const isFlash = !!flash && tw.sura === flash.sura && tw.aya === flash.aya;
    const isSelected = !!selected?.has(key);
    const isHidden = !!hidden?.has(key);
    const isGreen = !!green?.has(key);
    const isGrey = !!grey?.has(key);

    const isPartialTargetVerse =
      !!partialTarget &&
      tw.sura === partialTarget.sura &&
      tw.aya === partialTarget.aya;
    const isWordPastReveal =
      isPartialTargetVerse &&
      tw.word.charType === "end" &&
      (partialTarget!.hiddenPositions
        ? partialTarget!.hiddenPositions.has(tw.word.position)
        : tw.word.position > partialTarget!.revealedWordCount);

    const isWordHinted =
      isPartialTargetVerse &&
      tw.word.charType !== "end" &&
      !!partialTarget!.hintedPositions?.has(tw.word.position);

    // Live recite highlight: a word the reciter has just said correctly.
    // NB: in this codebase's (inverted) model, actual recitable words are
    // charType === "end" and the ayah-number marker is charType === "word"
    // (see quran.service mapping) — so this matches the same glyphs the
    // reveal/hide logic above does. recitedPositions only holds already-
    // revealed words, so it never overlaps hiddenPositions.
    const isWordRecited =
      isPartialTargetVerse &&
      tw.word.charType === "end" &&
      !!partialTarget!.recitedPositions?.has(tw.word.position);

    const isEndMarker =
      tw.word.charType === "end" &&
      tw.word.position ===
        Math.max(
          ...verses
            .find((v) => v.sura === tw.sura && v.aya === tw.aya)!
            .words.map((w) => w.position),
        );

    const base = isEndMarker ? "mushaf-ayah-end" : "mushaf-word";

    const cls = [
      base,
      isTarget ? `${base}-target` : "",
      isFlash ? "mushaf-word-flash" : "",
      isSelected ? "mushaf-verse-selected" : "",
      isHidden ? "mushaf-verse-hidden" : "",
      isGreen ? "mushaf-verse-green" : "",
      isGrey ? "mushaf-verse-grey" : "",
      isWordPastReveal ? "mushaf-verse-hidden" : "",
      isWordHinted ? "mushaf-word-hinted" : "",
      isWordRecited ? "mushaf-word-recited" : "",
      isEndMarker ? "mushaf-verse-end-marker" : "",
    ]
      .filter(Boolean)
      .join(" ");

    // Tag spans that should contribute to a hidden-line overlay.
    // Two cases:
    //   1. Whole-verse hide (isHidden): every non-end-marker word on the line.
    //   2. Partial-target hide (isWordPastReveal): the end-marker span whose
    //      position is in hiddenPositions, plus any non-end word at the same
    //      position — both need to be measured to draw one bar per line segment.
    const isPartialWordHidden =
      isPartialTargetVerse &&
      !isEndMarker &&
      !!partialTarget!.hiddenPositions?.has(tw.word.position);

    const hiddenSegKey =
      isHidden && !isEndMarker
        ? `${key}:${lineNumber}`
        : isWordPastReveal || isPartialWordHidden
        ? `partial:${key}:${lineNumber}`
        : undefined;

    return (
      <span
        key={`${lineNumber}-${idx}${isFlash ? "-f" : ""}`}
        className={cls}
        data-verse-key={key}
        {...(hiddenSegKey ? { "data-hidden-seg": hiddenSegKey } : {})}
        onClick={
          isEndMarker && onVerseLongPress
            ? (e) => { e.stopPropagation(); onVerseLongPress(key); }
            : onVerseTap ? () => handleClick(key) : undefined
        }
        onTouchStart={
          isEndMarker && onVerseLongPress
            ? (e) => { endMarkerTouchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }
            : !isEndMarker && (onVerseTap || onVerseLongPress) ? () => startPress(key) : undefined
        }
        onTouchEnd={
          isEndMarker && onVerseLongPress
            ? (e) => {
                const start = endMarkerTouchStart.current;
                endMarkerTouchStart.current = null;
                if (!start) return;
                const dx = e.changedTouches[0].clientX - start.x;
                const dy = e.changedTouches[0].clientY - start.y;
                if (Math.sqrt(dx * dx + dy * dy) > 8) return;
                e.preventDefault();
                e.stopPropagation();
                onVerseLongPress(key);
              }
            : onVerseTap || onVerseLongPress ? cancelPress : undefined
        }
        onTouchMove={!isEndMarker && (onVerseTap || onVerseLongPress) ? cancelPress : undefined}
        onContextMenu={
          onVerseTap || onVerseLongPress
            ? (e) => {
                e.preventDefault();
                longPressFire(key);
              }
            : undefined
        }
      >
        {tw.word.codeV2 || tw.word.text_uthmani}
      </span>
    );
  };

  // --- Strict line‑by‑line layout (default) ---
  const renderStrictLines = () => (
    <>
      {showTopHeader && showTopBismillah
        ? renderHeaderWithBismillah(
            surahStartVerse!.sura,
            "top-header-bismillah",
          )
        : showTopBismillah && !showTopHeader
        ? renderBismillah("top-bismillah")
        : showTopHeader
        ? renderSurahHeader(surahStartVerse!.sura, "top-header")
        : null}
      {lines.map((line) => {
        const midStarts = midStartsByLine.get(line.lineNumber) ?? [];
        return (
          <React.Fragment key={line.lineNumber}>
            {midStarts.map((s) => (
              <React.Fragment key={`mid-${s.sura}`}>
                {s.showBismillah
                  ? renderHeaderWithBismillah(s.sura, `mid-${s.sura}`)
                  : renderSurahHeader(s.sura, `mid-header-${s.sura}`)}
              </React.Fragment>
            ))}
            <div className="mushaf-line">
              {line.words.map((tw, i) => renderWord(tw, i, line.lineNumber))}
            </div>
          </React.Fragment>
        );
      })}
    </>
  );

  // --- Relaxed, wrapped layout (bigTextMode = true) ---
  const renderWrappedFlow = () => {
    const allWords: { word: VerseWord; sura: number; aya: number }[] = [];
    for (const line of lines) {
      allWords.push(...line.words);
    }

    interface FlowItem {
      type: "header" | "bismillah" | "word";
      sura?: number;
      wordData?: (typeof allWords)[0];
      key: string;
    }

    const flowItems: FlowItem[] = [];

    if (showTopHeader && surahStartVerse) {
      flowItems.push({
        type: "header",
        sura: surahStartVerse.sura,
        key: "top-header",
      });
    }
    if (showTopBismillah) {
      flowItems.push({ type: "bismillah", key: "top-bismillah" });
    }

    let wordIdx = 0;
    for (const line of lines) {
      const midStarts = midStartsByLine.get(line.lineNumber) ?? [];
      for (const s of midStarts) {
        flowItems.push({
          type: "header",
          sura: s.sura,
          key: `mid-header-${s.sura}`,
        });
        if (s.showBismillah) {
          flowItems.push({
            type: "bismillah",
            key: `mid-bismillah-${s.sura}`,
          });
        }
      }
      for (const w of line.words) {
        flowItems.push({
          type: "word",
          wordData: w,
          key: `${line.lineNumber}-${wordIdx++}`,
        });
      }
    }

    return (
      <div className="mushaf-big-text-container">
        {flowItems.map((item) => {
          if (item.type === "header") {
            return renderSurahHeader(item.sura!, item.key);
          }
          if (item.type === "bismillah") {
            return renderBismillah(item.key);
          }
          if (item.type === "word" && item.wordData) {
            const parts = item.key.split("-");
            const lineNum = parseInt(parts[0], 10);
            const idxInLine = parseInt(parts[1], 10);
            return renderWord(item.wordData, idxInLine, lineNum);
          }
          return null;
        })}
      </div>
    );
  };

  return (
    <div
      className={`mushaf-page-glyph ${
        bigTextMode ? "mushaf-page-bigtext" : ""
      } ${page <= 2 ? "mushaf-page-natural-width" : ""}`}
      ref={containerRef}
      style={{
        fontFamily: family,
        position: "relative",
        fontPalette: tajweedOn
          ? paletteNameForPage(page, theme)
          : paletteNameForPage(page, "mono"),
      }}
    >
      {bigTextMode ? renderWrappedFlow() : renderStrictLines()}
      {hiddenSegments.map((seg, i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            position: "absolute",
            top: seg.top,
            left: seg.left,
            width: seg.width,
            height: 0.5,
            background:
              theme === "night"
                ? "rgba(200,200,200,0.18)"
                : "rgba(120,120,120,0.22)",
            borderRadius: 1,
            pointerEvents: "none",
            transform: "none",
          }}
        />
      ))}
    </div>
  );
};

interface TaggedWord {
  word: VerseWord;
  sura: number;
  aya: number;
}

interface Line {
  lineNumber: number;
  words: TaggedWord[];
}

function readTajweedSetting(): boolean {
  try {
    const raw = localStorage.getItem("rafiq_settings_v1");
    if (raw) {
      const s = JSON.parse(raw);
      if (typeof s.showTajweedColors === "boolean") return s.showTajweedColors;
    }
  } catch {}
  return true;
}

function groupByLine(verses: Verse[]): Line[] {
  const map = new Map<number, TaggedWord[]>();
  for (const v of verses) {
    if (!v.words) continue;
    for (const w of v.words) {
      const arr = map.get(w.lineNumber) ?? [];
      arr.push({ word: w, sura: v.sura, aya: v.aya });
      map.set(w.lineNumber, arr);
    }
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a - b)
    .map(([lineNumber, words]) => ({ lineNumber, words }));
}

export default MushafPage;
