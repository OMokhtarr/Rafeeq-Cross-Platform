/**
 * Reading one page's synced layout.
 *
 * The layout half of a Mushaf page lives in the Content Sync row store as
 * `mushafs:19:mushaf_page:{page}` (see adapters/mushafs.adapter.ts). This is
 * the read side: one O(1) row lookup per page turn.
 *
 * Every failure mode returns null, because the caller can always fall back to
 * `/verses/by_page/` alone. A missing or broken layout should cost slightly
 * stale line breaks, never a blank page.
 */

import { readRow } from "../sync/sync-store.service";
import type { MushafPageData } from "../sync/adapters/mushafs.adapter";
import type { VerseWord } from "../../../shared/models/verse.model";

/**
 * Mushaf id for the layout Rafeeq renders: QCF V4 Tajweed.
 *
 * Deliberately NOT read from the selected-mushaf setting. The synced layout
 * describes V4 glyph positions, so it is only valid for the V4 mushaf; the
 * other mushafs (Uthmani, IndoPak, Imlaei) keep using the API layout. The
 * caller gates on that — mergeLayoutIntoVerses() also refuses a page whose
 * words carry no `codeV2`.
 */
export const LAYOUT_MUSHAF_RESOURCE_ID = 19;

/** The page's words in reading order, or null if no usable layout is stored. */
export async function readPageLayout(
  page: number,
): Promise<VerseWord[] | null> {
  try {
    const row = await readRow(
      "mushafs",
      LAYOUT_MUSHAF_RESOURCE_ID,
      "mushaf_page",
      String(page),
    );
    const words = (row?.data as MushafPageData | undefined)?.words;
    return words && words.length > 0 ? words : null;
  } catch {
    return null;
  }
}
