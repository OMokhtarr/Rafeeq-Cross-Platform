/**
 * Surah furniture (header / bismillah) placement, derived from the page's own
 * line data.
 *
 * The API assigns every word a `line_number` on the 15-line Madani grid. Lines
 * the printed Mushaf reserves for a surah header and its bismillah simply have
 * no words on them, and each such gap sits directly above the line where the
 * new surah's text starts. Reading those gaps tells us exactly where the
 * furniture goes, so nothing has to be inferred from spare-line arithmetic.
 *
 * Verified against the live V4 layout on 28 pages: every gap was followed by a
 * surah start, with no exceptions.
 *
 *   gap of 2 → header + bismillah   (p587 lines 1-2 and 12-13)
 *   gap of 1 → header only          (p187, At-Tawbah, which has no bismillah)
 *
 * A run of empty lines at the bottom of a page is NOT a gap: it precedes no
 * text, so it belongs to no surah. Treating it as one is what previously made
 * a page draw the *next* page's header, which that page then drew again.
 */

/** Lines on a Madani page. Every V4 layout page is a 15-line grid. */
export const LINES_PER_PAGE = 15;

export interface LineGap {
  /** How many consecutive lines are free. */
  size: number;
  /** The line whose text the gap sits above. */
  beforeLine: number;
}

/**
 * Free-line runs on the page, each keyed to the text line that follows it.
 * Trailing runs are dropped — see the note above.
 */
export function findLineGaps(usedLines: Iterable<number>): LineGap[] {
  const used = new Set(usedLines);
  if (used.size === 0) return [];

  const gaps: LineGap[] = [];
  let run = 0;
  for (let line = 1; line <= LINES_PER_PAGE; line++) {
    if (used.has(line)) {
      if (run > 0) gaps.push({ size: run, beforeLine: line });
      run = 0;
    } else {
      run++;
    }
  }
  return gaps;
}

/** The gap belonging to a surah whose first word sits on `line`. */
export function gapBeforeLine(gaps: LineGap[], line: number): LineGap | null {
  return gaps.find((g) => g.beforeLine === line) ?? null;
}
