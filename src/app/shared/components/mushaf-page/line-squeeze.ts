/**
 * Horizontal condensing for a Madani 1405 line.
 *
 * 1405 lays the 1421 V4 word glyphs out on its own line breaks. Some of those
 * glyphs were stretched to fill their 1421 line, so a 1405 line can come out
 * wider than the page; that line alone is condensed (MushafPage
 * `squeezeLineToFit`), never the page's font size.
 */

/**
 * Horizontal scale that fits a line's words, set edge to edge, into the line:
 * 1 when they already fit, else the fraction that makes them fit exactly.
 */
export function lineSqueeze(wordsWidthPx: number, lineWidthPx: number): number {
  if (wordsWidthPx <= lineWidthPx || lineWidthPx <= 0) return 1;
  return lineWidthPx / wordsWidthPx;
}
