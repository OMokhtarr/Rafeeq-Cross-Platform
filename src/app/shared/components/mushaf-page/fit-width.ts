/**
 * Width fit for the Unicode Mushaf.
 *
 * The V4 glyph fonts are drawn to the printed page's proportions, so a
 * height-derived size always fits the width. A Unicode font is not, and a
 * long line can run past the page edge at that size. Text width scales
 * linearly with font size, so shrinking by `container / widest` makes the
 * widest line fit exactly; flooring keeps it from overshooting by a fraction.
 */
export function fitFontToWidth(
  heightPx: number,
  naturalLineWidthsAtHeightPx: number[],
  containerWidthPx: number,
): number {
  const widest = Math.max(0, ...naturalLineWidthsAtHeightPx);
  if (widest <= containerWidthPx) return heightPx;
  return Math.floor((heightPx * containerWidthPx) / widest);
}
