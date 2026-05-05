/**
 * MUSHAF PAGE
 *
 * Renders a single Madani Mushaf page using QPC V1 glyphs. The data shape
 * is whatever quran.service.getPage(n) returns — each verse carries a
 * `words` array with `codeV1` strings and `lineNumber` 1..15.
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
 */

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Verse, VerseWord } from "../../models/verse.model";
import {
  ensurePageFont,
  ensureBismillahFont,
  fontFamilyForPage,
  BISMILLAH_FONT_FAMILY,
} from "../../../core/services/api/font.loader";
import { getSurahNameArabic } from "../../../core/services/data/metadata.service";
import "./MushafPage.css";

interface Props {
  page: number;
  verses: Verse[];
  /** Show bismillah row at the top. Caller decides (e.g. when first verse
   *  on the page is aya 1 of a non-Tawbah surah). */
  showBismillah?: boolean;
  /** Highlight every word of this verse (for quiz context viewing). */
  target?: { sura: number; aya: number };
  /** Set of "sura:aya" keys currently selected (visual highlight). */
  selected?: Set<string>;
  /** Set of "sura:aya" keys currently hidden (faded + badge). */
  hidden?: Set<string>;
  /** Set of "sura:aya" keys to render in green (used by the next-verse reveal). */
  green?: Set<string>;
  /** Set of "sura:aya" keys to render in grey (used by quiz context — verses
   *  before the target verse are de-emphasized). */
  grey?: Set<string>;
  /**
   * For quiz context: hide selected words of the named verse. The caller
   * passes the explicit set of word `position` values to hide via
   * `hiddenPositions`; this avoids any assumption that API positions are 1..N
   * contiguous. The verse-end ornament always stays visible so the boundary
   * remains legible. `revealedWordCount` is kept for backwards compatibility:
   * if `hiddenPositions` is omitted, words whose 1-based position exceeds
   * `revealedWordCount` are hidden.
   */
  partialTarget?: {
    sura: number;
    aya: number;
    revealedWordCount: number;
    hiddenPositions?: Set<number>;
  };
  /** Tap/long-press a word → toggle selection. Receives "sura:aya". */
  onVerseTap?: (verseKey: string) => void;
  /**
   * Optional separate handler for long-press / right-click. When provided,
   * long-press triggers this instead of `onVerseTap` — used by PageViewer
   * to open the verse action sheet (audio / translation / tafsir).
   */
  onVerseLongPress?: (verseKey: string) => void;
}

const LONG_PRESS_MS = 350;

const MushafPage: React.FC<Props> = ({
  page,
  verses,
  showBismillah,
  target,
  selected,
  hidden,
  green,
  grey,
  partialTarget,
  onVerseTap,
  onVerseLongPress,
}) => {
  const [fontReady, setFontReady] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setFontReady(false);
    Promise.all([
      ensurePageFont(page),
      showBismillah ? ensureBismillahFont() : Promise.resolve(),
    ])
      .then(() => {
        if (!cancelled) setFontReady(true);
      })
      .catch((err) => {
        console.error("[MushafPage] font load failed", err);
        if (!cancelled) setFontReady(true); // render text even if font fails
      });
    return () => {
      cancelled = true;
    };
  }, [page, showBismillah]);

  // Container-aware font sizing.
  //
  // The Madani page uses 15 lines (.mushaf-line). Each line is a flex row
  // whose height = fontSize × line-height. The .mushaf-page-glyph parent
  // uses justify-content: space-between, so DOM-probing won't reveal
  // overflow — instead we compute the largest font size analytically:
  //
  //   maxFont = (availableHeight - chrome) / (lineCount * lineHeight)
  //
  // where chrome is the surah-header banner + bismillah strip (when
  // shown). Re-runs on parent resize and orientation change.
  useLayoutEffect(() => {
    if (!fontReady) return;
    const node = containerRef.current;
    if (!node) return;

    const LINE_HEIGHT_RATIO = 1.4; // mirrors .mushaf-page-glyph CSS
    const LINE_GAP_RATIO = 0.25; // mirrors .mushaf-page-glyph `gap: 0.25em`
    // Bismillah strip: 0.95em font + 0.2em margin — see MushafPage.css.
    const BISMILLAH_LINES = 1.15;
    const FONT_MIN = 8;
    const FONT_MAX = 64;
    // Surah-name banner is now slim (0.4em name + 0.3em padding × 2 + small
    // top/bottom margins). Roughly 1.4 line-heights of vertical space.
    const SURAH_HEADER_LINES = 1.4;

    const computeFit = () => {
      const el = containerRef.current;
      if (!el) return;
      const parent = el.parentElement;
      if (!parent) return;

      // Use the parent's content box height — the .mushaf-page-glyph fills it.
      const parentStyle = window.getComputedStyle(parent);
      const padT = parseFloat(parentStyle.paddingTop) || 0;
      const padB = parseFloat(parentStyle.paddingBottom) || 0;
      const padL = parseFloat(parentStyle.paddingLeft) || 0;
      const padR = parseFloat(parentStyle.paddingRight) || 0;
      const availH = parent.clientHeight - padT - padB;
      const availW = parent.clientWidth - padL - padR;
      if (availH <= 0 || availW <= 0) return;

      const lineCount = Math.max(1, groupByLine(verses).length);
      const chromeLines =
        (showBismillah ? BISMILLAH_LINES : 0) +
        (verses.length > 0 && verses[0].aya === 1 ? SURAH_HEADER_LINES : 0);

      // Height-derived font: (chrome + lines) × line-height + gaps.
      const emPerPx =
        (chromeLines + lineCount) * LINE_HEIGHT_RATIO +
        Math.max(0, lineCount - 1) * LINE_GAP_RATIO;
      const heightFit = Math.floor((availH * 0.99) / emPerPx);

      // Width-derived font: sum each word/ornament's natural width per line
      // (justify-content: space-between makes the flex row's own width equal
      // to the container, so we can't read it directly — we sum children).
      // Then pick the widest line and scale so it just fills availW. Without
      // this, height-fit leaves wide containers under-filled and the
      // space-between justification opens big gaps between words.
      const lineNodes = el.querySelectorAll<HTMLElement>(".mushaf-line");
      let widthFit = FONT_MAX;
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
          // 0.97 leaves a hair of breathing room so words don't touch.
          widthFit = Math.floor((availW * 0.97 * fittedFontPx) / maxNatural);
        }
      }

      const target = Math.min(heightFit, widthFit);
      const clamped = Math.max(FONT_MIN, Math.min(FONT_MAX, target));
      if (clamped !== fittedFontPx) setFittedFontPx(clamped);
    };

    computeFit();
    const ro = new ResizeObserver(computeFit);
    if (node.parentElement) ro.observe(node.parentElement);
    window.addEventListener("orientationchange", computeFit);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", computeFit);
    };
  }, [fontReady, verses, showBismillah, fittedFontPx]);

  if (!fontReady) {
    return (
      <div className="mushaf-page-loading">
        <div className="mushaf-spinner" aria-label="Loading Mushaf" />
      </div>
    );
  }

  const lines = groupByLine(verses);
  const family = fontFamilyForPage(page);

  // Helpers — kept out of JSX for readability
  const longPressFire = (key: string) => {
    // Long-press / right-click prefers the dedicated handler when given
    // (PageViewer uses it to open the verse action sheet). Falls back to
    // the tap handler so older callers without onVerseLongPress keep
    // their original "long-press = toggle selection" behavior.
    (onVerseLongPress ?? onVerseTap)?.(key);
  };

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
      longPressFire(key);
    }, LONG_PRESS_MS);
  };

  const cancelPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressKey.current = null;
  };

  // Decorative surah-name header — shown whenever the first verse on the
  // page is aya 1 (i.e. this page starts a new surah). At-Tawbah (9) gets
  // the header even though it has no Bismillah after it.
  const surahStartVerse =
    verses.length > 0 && verses[0].aya === 1 ? verses[0] : null;
  const surahHeaderName = surahStartVerse
    ? getSurahNameArabic(surahStartVerse.sura)
    : null;

  return (
    <div
      className="mushaf-page-glyph"
      ref={containerRef}
      style={{
        fontFamily: family,
        ...(fittedFontPx !== null ? { fontSize: `${fittedFontPx}px` } : null),
      }}
    >
      {surahHeaderName && (
        <div className="mushaf-surah-header" aria-label={surahHeaderName}>
          <span className="mushaf-surah-header-frame">
            <span className="mushaf-surah-header-name">
              سُورَةُ {surahHeaderName}
            </span>
          </span>
        </div>
      )}
      {showBismillah && (
        <div
          className="mushaf-bismillah"
          style={{ fontFamily: BISMILLAH_FONT_FAMILY }}
        >
          ﭑ ﭒ ﭓ
        </div>
      )}
      {lines.map((line) => (
        <div className="mushaf-line" key={line.lineNumber}>
          {line.words.map((tw, i) => {
            const key = `${tw.sura}:${tw.aya}`;
            const isTarget =
              !!target && tw.sura === target.sura && tw.aya === target.aya;
            const isSelected = !!selected?.has(key);
            const isHidden = !!hidden?.has(key);
            const isGreen = !!green?.has(key);
            const isGrey = !!grey?.has(key);

            // Partial-target hiding: for the named verse, hide every word
            // whose `position` appears in `hiddenPositions` (preferred) or,
            // for legacy callers, whose 1-based position is past
            // `revealedWordCount`. The end-of-ayah ornament is always shown.
            const isPartialTargetVerse =
              !!partialTarget &&
              tw.sura === partialTarget.sura &&
              tw.aya === partialTarget.aya;
            const isWordPastReveal =
              isPartialTargetVerse &&
              tw.word.charType === "word" &&
              (partialTarget!.hiddenPositions
                ? partialTarget!.hiddenPositions.has(tw.word.position)
                : tw.word.position > partialTarget!.revealedWordCount);

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
              isSelected ? "mushaf-verse-selected" : "",
              isHidden ? "mushaf-verse-hidden" : "",
              isGreen ? "mushaf-verse-green" : "",
              isGrey ? "mushaf-verse-grey" : "",
              isWordPastReveal ? "mushaf-verse-hidden" : "",
              isEndMarker ? "mushaf-verse-end-marker" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <span
                key={`${line.lineNumber}-${i}`}
                className={cls}
                data-verse-key={key}
                onClick={onVerseTap ? () => handleClick(key) : undefined}
                onTouchStart={
                  onVerseTap || onVerseLongPress
                    ? () => startPress(key)
                    : undefined
                }
                onTouchEnd={
                  onVerseTap || onVerseLongPress ? cancelPress : undefined
                }
                onTouchMove={
                  onVerseTap || onVerseLongPress ? cancelPress : undefined
                }
                onContextMenu={
                  onVerseTap || onVerseLongPress
                    ? (e) => {
                        // Right-click / long-press on desktop fires the
                        // long-press handler (action sheet) when provided,
                        // else falls back to the tap toggle.
                        e.preventDefault();
                        longPressFire(key);
                      }
                    : undefined
                }
              >
                {tw.word.codeV1 || tw.word.text_uthmani}
              </span>
            );
          })}
        </div>
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
