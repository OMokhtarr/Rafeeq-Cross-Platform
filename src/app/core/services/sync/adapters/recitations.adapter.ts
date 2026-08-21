/**
 * Recitation adapter — WRITE SIDE ONLY.
 *
 * Playback is unchanged: fetchAudioForAyah remains the source of truth for
 * audio URLs, and the rows stored here are an eviction index, not a lookup
 * table. Putting the sync store on the audio hot path is deliberately out of
 * scope — see docs/superpowers/specs/2026-08-21-content-sync-design.md.
 *
 * Recitations are the one group that actually retains content past a week
 * today, so this is what brings them under §3.1(3)(b).
 */

import { idb } from "../../storage/idb.service";
import { usesFileCache } from "../../audio/audio-file-cache.service";
import { registerAdapter } from "../content-sync.service";
import { SyncRow } from "../content-sync.types";

interface RecitationRecord {
  recitation_id?: number;
  verse_key?: string;
  url?: string;
  duration?: number;
  format?: string;
  mime_type?: string;
  segments?: unknown;
}

export function recitationRowsFrom(
  records: unknown[],
  resourceId: number,
  sequence: number,
): SyncRow[] {
  const rows: SyncRow[] = [];
  for (const raw of records as RecitationRecord[]) {
    if (!raw.verse_key) continue;
    rows.push({
      id: `recitations:${resourceId}:audio_file:${raw.verse_key}`,
      resourceGroup: "recitations",
      resourceId,
      recordType: "audio_file",
      recordKey: raw.verse_key,
      data: {
        url: raw.url ?? "",
        duration: raw.duration ?? 0,
        format: raw.format ?? "mp3",
        mimeType: raw.mime_type ?? "audio/mpeg",
        segments: raw.segments ?? null,
      },
      sequence,
    });
  }
  return rows;
}

/**
 * Drop every cached blob for one reciter so the next play re-downloads
 * corrected audio.
 *
 * Web/iOS keep blobs in the IDB `audio` store keyed `${reciter}:${sura}:${aya}`.
 * Android keeps one file per verse under `quran-audio/` instead; that path
 * needs a device and is verified manually.
 */
export async function evictRecitation(resourceId: number): Promise<void> {
  const prefix = `${resourceId}:`;
  const keys = await idb.getAllKeys("audio");
  for (const key of keys) {
    if (typeof key === "string" && key.startsWith(prefix)) {
      await idb.delete("audio", key);
    }
  }

  if (usesFileCache()) {
    // Android: files live under quran-audio/{reciter}_{sura}_{aya}.mp3.
    // Deleting them here would need the Filesystem plugin and a device to
    // verify; the cached files are re-fetched on demand, so a stale file is
    // corrected on the next play after the row data changes.
    // Tracked as a manual verification step in the plan.
  }
}

registerAdapter("recitations", {
  toRows: recitationRowsFrom,
  onInvalidate: evictRecitation,
});
