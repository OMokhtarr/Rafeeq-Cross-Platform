/**
 * Tafsir adapter.
 *
 * Tafsir records can cover a verse RANGE, not a single verse
 * (group_verse_key_from / group_verse_key_to). A record for 2:1-2:5 is
 * expanded into five rows sharing one text, so a lookup for 2:3 finds it.
 *
 * The range can also cross a surah boundary — verified in the live Ibn
 * Kathir (169) snapshot, e.g. 104:1 -> 105:5 (end of Al-Humazah into the
 * start of Al-Fil), 14 such records out of 6236. expandRange() walks verse
 * counts across surahs to cover these correctly.
 *
 * Live data also does NOT always send one record per group: most groups
 * arrive as one record PER VERSE in the group, all sharing the same
 * group_verse_key_from/_to, with text only on the first. See the
 * populated-wins rule documented on tafsirRowsFrom().
 */

import { registerAdapter } from "../content-sync.service";
import { readResourceRows } from "../sync-store.service";
import { SyncRow } from "../content-sync.types";

interface TafsirRecord {
  verse_key?: string;
  text?: string;
  group_verse_key_from?: string | null;
  group_verse_key_to?: string | null;
}

// Verse counts per surah — used to walk a range across a surah boundary.
// Index 0 unused; index 1-114 maps surah number -> verse count.
const SURAH_VERSE_COUNTS: readonly number[] = [
  0,
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111, 43, 52, 99, 128, 111, 110, 98, 135,
  112, 78, 118, 64, 77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83, 182, 88, 75, 85,
  54, 53, 89, 59, 37, 35, 38, 29, 18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28, 20, 56, 40, 31, 50, 40, 46, 42,
  29, 19, 36, 25, 22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19, 5, 8, 8, 11,
  11, 8, 3, 9, 5, 4, 7, 3, 6, 3, 5, 4, 5, 6,
];

/** Upper bound on verses a single walk may emit — guards against a corrupt record spinning forever. */
const MAX_RANGE_VERSES = 6300;

/** { surah: 2, ayah: 5 } from "2:5"; null when unparseable or surah out of 1-114. */
function splitKey(key: string): { surah: number; ayah: number } | null {
  const [s, a] = key.split(":");
  const surah = Number(s);
  const ayah = Number(a);
  if (!Number.isFinite(surah) || surah < 1 || surah > 114 || !Number.isFinite(ayah)) return null;
  return { surah, ayah };
}

/**
 * Every verse key from `from` to `to` inclusive, walking across surah
 * boundaries when needed. Falls back to `[from]` for anything that isn't a
 * clean forward walk: unparseable keys, an end surah before the start
 * surah, or a reversed range within one surah.
 */
function expandRange(from: string, to: string): string[] {
  const a = splitKey(from);
  const b = splitKey(to);
  if (!a || !b || b.surah < a.surah || (a.surah === b.surah && b.ayah < a.ayah)) return [from];

  const out: string[] = [];
  let surah = a.surah;
  let ayah = a.ayah;
  while (out.length < MAX_RANGE_VERSES) {
    out.push(`${surah}:${ayah}`);
    if (surah === b.surah && ayah === b.ayah) return out;
    const count = SURAH_VERSE_COUNTS[surah];
    if (!count) return [from]; // corrupt surah number — degrade safely
    if (ayah < count) {
      ayah += 1;
    } else {
      surah += 1;
      ayah = 1;
      if (surah > 114) return [from]; // walked off the end — degrade safely
    }
  }
  return [from]; // exceeded the sane upper bound — degrade safely
}

/**
 * Live QF data (verified against the Ibn Kathir / 169 snapshot) does not
 * always give one record per group with the full range on it. For most
 * groups it instead emits one record PER VERSE in the group, every one
 * carrying the SAME group_verse_key_from/_to, and only the first record has
 * text — the rest have text: "". Naive last-write-wins on `key` then depends
 * on arrival order: whichever record is processed last for a given verse
 * key overwrites the others, so an empty record arriving after the
 * populated one blanks it (measured: 4,328 of 6,236 records this way).
 *
 * Rule applied here, independent of arrival order: a record with non-empty
 * text always wins over one with empty text for the same verse key. Between
 * two records that both have non-empty text for the same key (not observed
 * live, but not ruled out), the first one encountered wins — deterministic
 * and stable regardless of input order beyond that.
 */
export function tafsirRowsFrom(
  records: unknown[],
  resourceId: number,
  sequence: number,
): SyncRow[] {
  const textByKey = new Map<string, string>();
  const order: string[] = [];

  for (const raw of records as TafsirRecord[]) {
    const anchor = raw.verse_key ?? raw.group_verse_key_from ?? null;
    if (!anchor) continue;
    const from = raw.group_verse_key_from ?? anchor;
    const to = raw.group_verse_key_to ?? from;
    const text = raw.text ?? "";
    for (const key of expandRange(from, to)) {
      const existing = textByKey.get(key);
      if (existing === undefined) {
        order.push(key);
        textByKey.set(key, text);
      } else if (existing === "" && text !== "") {
        // A populated record always beats an empty placeholder, regardless
        // of which arrived first.
        textByKey.set(key, text);
      }
      // Otherwise keep what's already stored: either it's already populated
      // (first-populated-wins), or both are empty and there's nothing to gain.
    }
  }

  return order.map((key) => ({
    id: `tafsirs:${resourceId}:tafsir:${key}`,
    resourceGroup: "tafsirs",
    resourceId,
    recordType: "tafsir",
    recordKey: key,
    data: { text: textByKey.get(key) ?? "" },
    sequence,
  }));
}

export async function readCachedTafsir(
  resourceId: number,
  verseKey: string,
): Promise<string | null> {
  const rows = await readResourceRows("tafsirs", resourceId);
  const hit = rows.find((r) => r.recordKey === verseKey);
  const text = (hit?.data as { text?: string } | undefined)?.text;
  return text ?? null;
}

export async function hasCachedTafsir(resourceId: number): Promise<boolean> {
  const rows = await readResourceRows("tafsirs", resourceId);
  return rows.length > 0;
}

registerAdapter("tafsirs", { toRows: tafsirRowsFrom });
