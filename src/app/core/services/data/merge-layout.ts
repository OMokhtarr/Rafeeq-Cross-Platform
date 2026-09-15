/**
 * Joining the two halves of a Mushaf page.
 *
 * Content Sync (`mushafs:19`) serves the page LAYOUT — which glyph sits on
 * which line — but no word-level Uthmani text. `/verses/by_page/` serves the
 * Uthmani text but its layout is not the authoritative copy. QF confirmed on
 * 2026-09-14 that no Content Sync resource carries per-word Uthmani text, so
 * this two-source join is the permanent design, not a stopgap. See
 * docs/licensing-decisions.md §1a.
 *
 * WHY THIS REFUSES RATHER THAN PATCHES
 *
 * The two sources are joined positionally: word N of the page from the
 * snapshot pairs with word N from the API. If they ever disagree, every
 * following word is paired with the wrong text — glyphs render against the
 * wrong ayah and recite matching compares against words that are not on
 * screen. That failure is silent and would be very hard to trace back here.
 *
 * So the join is verified before it is trusted: same word count AND the same
 * glyph at every index. On any mismatch this returns null and the caller
 * falls back to the API response alone, which is always internally consistent.
 * A page that renders with slightly stale line breaks is a far better failure
 * than a page whose words are shifted.
 *
 * Count equality alone is NOT sufficient: the snapshot's `position_in_line` is
 * unusable as an ordering key on 227 of the 604 pages, and mis-ordering it
 * keeps the count identical while shifting the glyphs. Hence the glyph check.
 */

import type { Verse, VerseWord } from "../../../shared/models/verse.model";

/**
 * Do two spellings of the same word's glyphs match?
 *
 * Whitespace-insensitive, because the two sources disagree about it: 200 of
 * the 83,665 snapshot words spell a two-glyph word as "X Y" where
 * /verses/by_page/ returns "XY" (verified 2026-09-15). It decides the merge on
 * exactly two pages — 156 and 526 — and a strict comparison would throw away
 * the authoritative layout for both.
 *
 * Only spaces are ignored. A different glyph is still a mismatch, which is
 * what actually guards against a mis-ordered join.
 */
function sameGlyph(a: string, b: string): boolean {
  return a === b || a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

/**
 * Verses with layout from `layoutWords` and text from `verses`, or null when
 * the two sources do not describe the same page.
 *
 * `layoutWords` must be in page reading order (the mushafs adapter sorts by
 * `position_in_page`). The input verses are not mutated.
 */
export function mergeLayoutIntoVerses(
  verses: Verse[],
  layoutWords: VerseWord[],
): Verse[] | null {
  if (layoutWords.length === 0) return null;

  // A mushaf fetched without code_v2 (Uthmani/IndoPak/Imlaei) has nothing to
  // align against — the layout belongs to the V4 glyphs only.
  const apiWords: VerseWord[] = [];
  for (const v of verses) {
    if (!v.words || v.words.length === 0) return null;
    apiWords.push(...v.words);
  }

  if (apiWords.length !== layoutWords.length) return null;

  for (let i = 0; i < apiWords.length; i++) {
    if (!sameGlyph(apiWords[i].codeV2, layoutWords[i].codeV2)) return null;
  }

  let cursor = 0;
  return verses.map((v) => ({
    ...v,
    words: v.words!.map((w) => {
      const layout = layoutWords[cursor++];
      return {
        ...w,
        lineNumber: layout.lineNumber,
        pageNumber: layout.pageNumber,
      };
    }),
  }));
}
