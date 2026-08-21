/**
 * Tafsir adapter.
 *
 * Tafsir records can cover a verse RANGE, not a single verse
 * (group_verse_key_from / group_verse_key_to). A record for 2:1-2:5 is
 * expanded into five rows sharing one text, so a lookup for 2:3 finds it.
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

/** ["2", 5] from "2:5"; null when unparseable. */
function splitKey(key: string): { surah: string; ayah: number } | null {
  const [s, a] = key.split(":");
  const ayah = Number(a);
  if (!s || !Number.isFinite(ayah)) return null;
  return { surah: s, ayah };
}

/** Every verse key from `from` to `to` inclusive. Both bounds share a surah. */
function expandRange(from: string, to: string): string[] {
  const a = splitKey(from);
  const b = splitKey(to);
  if (!a || !b || a.surah !== b.surah || b.ayah < a.ayah) return [from];
  const out: string[] = [];
  for (let n = a.ayah; n <= b.ayah; n++) out.push(`${a.surah}:${n}`);
  return out;
}

export function tafsirRowsFrom(
  records: unknown[],
  resourceId: number,
  sequence: number,
): SyncRow[] {
  const rows: SyncRow[] = [];
  for (const raw of records as TafsirRecord[]) {
    const anchor = raw.verse_key ?? raw.group_verse_key_from ?? null;
    if (!anchor) continue;
    const from = raw.group_verse_key_from ?? anchor;
    const to = raw.group_verse_key_to ?? from;
    const text = raw.text ?? "";
    for (const key of expandRange(from, to)) {
      rows.push({
        id: `tafsirs:${resourceId}:tafsir:${key}`,
        resourceGroup: "tafsirs",
        resourceId,
        recordType: "tafsir",
        recordKey: key,
        data: { text },
        sequence,
      });
    }
  }
  return rows;
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
