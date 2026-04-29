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

import React, { useEffect, useRef, useState } from "react";
import type { Verse, VerseWord } from "../../models/verse.model";
import {
  ensurePageFont,
  ensureBismillahFont,
  fontFamilyForPage,
  BISMILLAH_FONT_FAMILY,
} from "../../../core/services/api/font.loader";
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

  return (
    <div className="mushaf-page-glyph" style={{ fontFamily: family }}>
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

            const base =
              tw.word.charType === "end" ? "mushaf-ayah-end" : "mushaf-word";
            const cls = [
              base,
              isTarget ? `${base}-target` : "",
              isSelected ? "mushaf-verse-selected" : "",
              isHidden ? "mushaf-verse-hidden" : "",
              tw.word.charType === "end" ? "mushaf-verse-end-marker" : "",
            ]
              .filter(Boolean)
              .join(" ");

            // Show the "آية مخفية" badge once per verse — pinned to the
            // verse-end ornament so it doesn't disturb word-level layout.
            const showHiddenBadge = isHidden && tw.word.charType === "end";

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
                {tw.word.codeV1 || tw.word.textUthmani}
                {showHiddenBadge && (
                  <span
                    className="mushaf-hidden-badge"
                    aria-label="آية مخفية"
                    title="آية مخفية — انقر للإظهار"
                  >
                    ✦
                  </span>
                )}
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
