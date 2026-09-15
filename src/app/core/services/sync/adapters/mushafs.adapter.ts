/**
 * Mushaf layout adapter — QCF V4 Tajweed (`mushafs:19`).
 *
 * Carries the page LAYOUT only: which glyph sits on which line of which page.
 * It deliberately does NOT carry two things the renderer also needs, because
 * Content Sync does not serve them (confirmed by QF on 2026-09-14, recorded in
 * docs/licensing-decisions.md §1a):
 *
 *   - the per-page COLRv1 fonts  → still fetched by font.loader.ts from the
 *     QF CDN and cached locally
 *   - word-level `text_uthmani`  → still fetched from /verses/by_page/ and
 *     merged onto these rows at read time
 *
 * So `text_uthmani` is intentionally empty on every word here. A row from this
 * adapter is half of a page; quran.service joins it with the API response.
 *
 * ONE ROW PER PAGE, not per word. The read path is getPage(n), so page-keyed
 * rows make it a single idb.get. Per-word rows would be 83,665 records and
 * would repeat the "deserialize a whole resource per tap" problem recorded in
 * docs/superpowers/specs/2026-08-22-content-sync-followups.md §2.
 */

import { registerAdapter } from "../content-sync.service";
import { SyncRow } from "../content-sync.types";
import { clearDerivedPageCache } from "../../data/page-cache";
import type { VerseWord } from "../../../../shared/models/verse.model";

interface MushafWordRecord {
  record_type?: string;
  page_number?: number;
  line_number?: number;
  position_in_verse?: number;
  position_in_page?: number;
  text?: string;
  char_type_name?: string;
}

interface MushafPageRecord {
  record_type?: string;
  page_number?: number;
  verse_mapping?: Record<string, string>;
}

/** Payload stored on one `mushaf_page` row. */
export interface MushafPageData {
  pageNumber: number;
  /** `{ "<surah>": "<from>-<to>" }` — which verses land on this page. */
  verseMapping: Record<string, string>;
  /** Page order, already sorted. `text_uthmani` is filled in at read time. */
  words: VerseWord[];
}

/**
 * Words in true reading order.
 *
 * MUST sort by `position_in_page`. `position_in_line` looks like the obvious
 * key and is wrong: on 227 of the 604 pages at least one word carries a
 * position_in_line beyond its line's own word count (e.g. page 50 line 4 holds
 * a word numbered 14 among words numbered 1..9). Sorting by
 * (line_number, position_in_line) moves that word to the end of its line and
 * shifts every following glyph by one — silently, because the word COUNT still
 * matches. Verified against the live snapshot: position_in_page is a clean
 * 1..N on every page, with line numbers monotonic under it.
 */
function orderWords(words: MushafWordRecord[]): MushafWordRecord[] {
  return [...words].sort(
    (a, b) => (a.position_in_page ?? 0) - (b.position_in_page ?? 0),
  );
}

function toVerseWord(raw: MushafWordRecord): VerseWord {
  return {
    position: raw.position_in_verse ?? 0,
    // Matches the inversion fetchVersesByPage already applies
    // (quran-api.client.ts) — the renderer depends on this mapping, so the two
    // sources must agree. Do not "correct" one without the other.
    charType: raw.char_type_name === "end" ? "word" : "end",
    text_uthmani: "",
    codeV2: raw.text ?? "",
    lineNumber: raw.line_number ?? 0,
    pageNumber: raw.page_number ?? 0,
  };
}

export function mushafRowsFrom(
  records: unknown[],
  resourceId: number,
  sequence: number,
): SyncRow[] {
  const wordsByPage = new Map<number, MushafWordRecord[]>();
  const mappingByPage = new Map<number, Record<string, string>>();

  for (const raw of records as (MushafWordRecord & MushafPageRecord)[]) {
    const page = raw?.page_number;
    if (typeof page !== "number") continue;

    if (raw.record_type === "mushaf_word") {
      const bucket = wordsByPage.get(page);
      if (bucket) bucket.push(raw);
      else wordsByPage.set(page, [raw]);
    } else if (raw.record_type === "mushaf_page") {
      mappingByPage.set(page, raw.verse_mapping ?? {});
    }
  }

  // Pages with words but no page record still hold the layout; pages with a
  // record but no words would store nothing useful, so only words create rows.
  const rows: SyncRow[] = [];
  for (const [page, words] of wordsByPage) {
    const data: MushafPageData = {
      pageNumber: page,
      verseMapping: mappingByPage.get(page) ?? {},
      words: orderWords(words).map(toVerseWord),
    };
    rows.push({
      id: `mushafs:${resourceId}:mushaf_page:${page}`,
      resourceGroup: "mushafs",
      resourceId,
      recordType: "mushaf_page",
      recordKey: String(page),
      data,
      sequence,
    });
  }
  return rows;
}

/**
 * Called when the layout resource is replaced or removed.
 *
 * The rows themselves are handled by the sync engine; what it cannot know is
 * that getPage() keeps a SECOND copy of every page in the `pages` store, with
 * the old layout already merged in, and reads it before consulting the layout
 * row. Without this the new layout would never be seen.
 */
export async function evictMushafLayout(_resourceId: number): Promise<void> {
  await clearDerivedPageCache();
}

registerAdapter("mushafs", {
  toRows: mushafRowsFrom,
  onInvalidate: evictMushafLayout,
});
