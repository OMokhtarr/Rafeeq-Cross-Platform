/**
 * Size fit for the Unicode (Madani 1405) Mushaf.
 *
 * The V4 glyph fonts are drawn to the printed page's proportions, so a
 * height-derived size always suits the width. The Unicode Hafs font is wider
 * and its lines vary, so the size is set by the page width instead, and is the
 * same on every page so the text never changes size as the reader turns:
 *
 *  - The size is `width / TYPICAL_LINE_EM`, capped so no line outgrows its
 *    1/15-of-the-page slot.
 *  - A line longer than that loses its word gaps first (`space-between` with
 *    no room left), and only the remainder is condensed sideways
 *    (`lineSqueeze`). Measured across all 604 pages with the real font, 17.5em
 *    (21px on a 369px-wide line) leaves 215 of 8,820 lines (98 pages) to
 *    condense, at most to 0.84.
 *
 * The rendered size is read back from the line height (`line-height` is a
 * fixed em multiple, see MushafPage.css), so an OS text zoom the probe
 * misjudged cannot skew it. Line height scales linearly with font size, so one
 * measured pass is enough.
 */

/** Line width, in em, that sets the common page size. */
export const TYPICAL_LINE_EM = 17.5;

/** Must match `.mushaf-page-unicode { line-height }` in MushafPage.css. */
export const UNICODE_LINE_HEIGHT_EM = 1.8;

/**
 * Font size to request so the text renders at the common page size. A zero
 * line height (nothing laid out yet) leaves the size as it is.
 */
export function fitUnicodeFontPx(
  currentPx: number,
  containerWidthPx: number,
  lineHeightAtCurrentPx: number,
  slotPx: number,
): number {
  if (lineHeightAtCurrentPx <= 0) return currentPx;
  const renderedPx = lineHeightAtCurrentPx / UNICODE_LINE_HEIGHT_EM;
  // Nearest pixel for the width target (a line it overruns is condensed), but
  // never a fraction past the slot, where the overflow clip would cut marks.
  const byWidth = Math.round(
    (currentPx * containerWidthPx) / TYPICAL_LINE_EM / renderedPx,
  );
  if (slotPx <= 0) return byWidth;
  return Math.min(
    byWidth,
    Math.floor((currentPx * slotPx) / lineHeightAtCurrentPx),
  );
}

/**
 * Horizontal scale that fits a line's words, set edge to edge, into the line:
 * 1 when they already fit, else the fraction that makes them fit exactly.
 */
export function lineSqueeze(wordsWidthPx: number, lineWidthPx: number): number {
  if (wordsWidthPx <= lineWidthPx || lineWidthPx <= 0) return 1;
  return lineWidthPx / wordsWidthPx;
}
