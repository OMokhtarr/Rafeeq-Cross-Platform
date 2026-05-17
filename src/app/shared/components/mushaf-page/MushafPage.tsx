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
  fontFamilyForPage,
  paletteNameForPage,
  setMonoPaletteColor,
  BISMILLAH_FONT_FAMILY,
} from "../../../core/services/api/font.loader";
import { getSurahNameArabic } from "../../../core/services/data/metadata.service";
import { useTheme } from "../../../core/context/ThemeContext";
import "./MushafPage.css";

interface Props {
  page: number;
  verses: Verse[];
  showBismillah?: boolean;
  /** Suppress the auto-rendered top-of-page surah header (previous page shows it as trailing). */
  suppressTopHeader?: boolean;
  /** Surah header to render at the bottom of this page (next page starts this surah). No bismillah — that stays on the next page. */
  trailingSurahStart?: { sura: number };
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
  showBismillah,
  suppressTopHeader = false,
  trailingSurahStart,
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

  // Container-aware font sizing. The 15 Madani lines must fit between the
  // top chrome (surah header / bismillah) and the bottom of the parent
  // box. Word→line grouping is fixed by the API (`lineNumber`), so we only
  // need to scale the font; the flex `justify-content: space-between` on
  // each .mushaf-line keeps spacing consistent at any font size.
  const containerRef = useRef<HTMLDivElement>(null);
  const [fittedFontPx, setFittedFontPx] = useState<number | null>(null);

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
  const midPageSurahStarts = React.useMemo(() => {
    if (verses.length === 0) return [];
    return verses
      .filter((v, idx) => idx > 0 && v.aya === 1 && v.words?.length)
      .map((v) => ({
        sura: v.sura,
        lineNumber: v.words[0].lineNumber,
        // Tawbah (9) has no bismillah by tradition.
        showBismillah: v.sura !== 9,
      }));
  }, [verses]);

  // Bismillah font is needed if the top strip is shown OR any mid-page
  // surah start renders its own inline bismillah.
  const needsBismillahFont =
    !!showBismillah || midPageSurahStarts.some((s) => s.showBismillah);

  useEffect(() => {
    let cancelled = false;
    setFontReady(false);
    Promise.all([
      ensurePageFont(page),
      needsBismillahFont ? ensureBismillahFont() : Promise.resolve(),
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
  }, [page, needsBismillahFont]);

  // Reset fitted size when page/verses change so we never carry a stale
  // font size from the previous page into the next page's first render.
  // Without this, page N's fitted size is applied to page N+1's DOM before
  // computeFit runs, causing the width measurement to be based on the wrong
  // font size and producing an incorrect widthFit on the first pass.
  useEffect(() => {
    setFittedFontPx(null);
  }, [page, verses]);

  // Font fitting logic (only used when bigTextMode = false)
  useLayoutEffect(() => {
    if (!fontReady) return;
    if (bigTextMode) return;

    const node = containerRef.current;
    if (!node) return;

    const TOTAL_SLOTS = 15;
    const FONT_MIN = 8;
    const FONT_MAX = 64;

    const computeFit = () => {
      const el = containerRef.current;
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;

      const parentStyle = window.getComputedStyle(parent);
      const padT = parseFloat(parentStyle.paddingTop) || 0;
      const padB = parseFloat(parentStyle.paddingBottom) || 0;
      const padL = parseFloat(parentStyle.paddingLeft) || 0;
      const padR = parseFloat(parentStyle.paddingRight) || 0;
      const availH = parent.clientHeight - padT - padB;
      const availW = parent.clientWidth - padL - padR;
      if (availH <= 0 || availW <= 0) return;

      // Each slot (verse line, surah header, bismillah) is exactly 1/15 of
      // the available height. Font size is chosen so one line of text fills
      // one slot. Header and bismillah are sized to the same slot height via
      // CSS custom property --slot-px set below.
      const slotPx = availH / TOTAL_SLOTS;
      // A verse line rendered at font size F has visual height F * LINE_HEIGHT.
      // We want F * LINE_HEIGHT = slotPx, so F = slotPx / LINE_HEIGHT.
      const LINE_HEIGHT = 1.4;
      const heightFit = Math.floor(slotPx / LINE_HEIGHT);

      let widthFit = FONT_MAX;
      const lineNodes = el.querySelectorAll<HTMLElement>(".mushaf-line");
      if (lineNodes.length > 0 && fittedFontPx) {
        let maxNatural = 0;
        for (const ln of lineNodes) {
          let sum = 0;
          for (const child of Array.from(ln.children) as HTMLElement[]) {
            sum += child.getBoundingClientRect().width;
          }
          if (sum > maxNatural) maxNatural = sum;
        }
        if (maxNatural > 0) {
          widthFit = Math.floor((availW * 0.97 * fittedFontPx) / maxNatural);
        }
      }

      const target = Math.min(heightFit, widthFit);
      const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, target));

      // Expose slot height to CSS so header/bismillah can match exactly one slot.
      el.style.setProperty("--slot-px", `${Math.round(slotPx)}px`);

      if (clamped !== fittedFontPx) {
        setFittedFontPx(clamped);
      }
    };

    computeFit();
    const ro = new ResizeObserver(computeFit);
    if (node.parentElement) ro.observe(node.parentElement);
    window.addEventListener("orientationchange", computeFit);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", computeFit);
    };
  }, [
    fontReady,
    verses,
    showBismillah,
    suppressTopHeader,
    trailingSurahStart,
    midPageSurahStarts,
    fittedFontPx, // keep so we re-run after first pass sets a value
    bigTextMode,
  ]);

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
  }, [hidden, partialTarget, fittedFontPx, fontReady, verses, bigTextMode]);

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

  const surahStartVerse =
    !suppressTopHeader && verses.length > 0 && verses[0].aya === 1
      ? verses[0]
      : null;
  const surahHeaderName = surahStartVerse
    ? getSurahNameArabic(surahStartVerse.sura)
    : null;

  const renderSurahHeader = (sura: number, key: string) => {
    const name = getSurahNameArabic(sura);
    if (!name) return null;
    return (
      <div className="mushaf-surah-header" aria-label={name} key={key}>
        <span className="mushaf-surah-header-frame">
          <span className="mushaf-surah-header-name">سُورَةُ {name}</span>
        </span>
      </div>
    );
  };

  const renderBismillah = (key: string) => (
    <div
      className="mushaf-bismillah"
      style={{
        fontFamily: BISMILLAH_FONT_FAMILY,
      }}
      key={key}
    >
      ﭑ ﭒ ﭓ
    </div>
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
        onClick={onVerseTap ? () => handleClick(key) : undefined}
        onTouchStart={
          onVerseTap || onVerseLongPress ? () => startPress(key) : undefined
        }
        onTouchEnd={onVerseTap || onVerseLongPress ? cancelPress : undefined}
        onTouchMove={onVerseTap || onVerseLongPress ? cancelPress : undefined}
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
      {surahHeaderName &&
        surahStartVerse &&
        renderSurahHeader(surahStartVerse.sura, "top-header")}
      {showBismillah && renderBismillah("top-bismillah")}
      {lines.map((line) => {
        const midStarts = midStartsByLine.get(line.lineNumber) ?? [];
        return (
          <React.Fragment key={line.lineNumber}>
            {midStarts.map((s) => (
              <React.Fragment key={`mid-${s.sura}`}>
                {renderSurahHeader(s.sura, `mid-header-${s.sura}`)}
                {s.showBismillah && renderBismillah(`mid-bismillah-${s.sura}`)}
              </React.Fragment>
            ))}
            <div className="mushaf-line">
              {line.words.map((tw, i) => renderWord(tw, i, line.lineNumber))}
            </div>
          </React.Fragment>
        );
      })}
      {trailingSurahStart &&
        renderSurahHeader(trailingSurahStart.sura, "trailing-header")}
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

    if (surahHeaderName && surahStartVerse) {
      flowItems.push({
        type: "header",
        sura: surahStartVerse.sura,
        key: "top-header",
      });
    }
    if (showBismillah) {
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

    if (trailingSurahStart) {
      flowItems.push({
        type: "header",
        sura: trailingSurahStart.sura,
        key: "trailing-header",
      });
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
        ...(fittedFontPx !== null && !bigTextMode
          ? { fontSize: `${fittedFontPx}px` }
          : null),
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
