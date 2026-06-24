/**
 * AUDIO DURATION SERVICE
 *
 * Resolves accurate per-verse and total durations for a playback range using the Quran
 * Foundation timestamp endpoint (/audio/reciters/{reciter_id}/timestamp) instead of
 * probing downloaded audio files. Probing was unreliable on Android (the WebView often
 * never fires loadedmetadata for capacitor:// file URLs), which left the duration bar's
 * total wrong and growing one verse at a time.
 *
 * The timestamp endpoint returns millisecond ranges on the reciter's full-surah timeline,
 * so a verse's duration is `timestamp_to - timestamp_from`. Two big wins:
 *   - A range that is an ENTIRE surah resolves its total in ONE call (chapter_number).
 *   - Results are cached per (reciter, verse) in IDB, so replays are instant and offline.
 *
 * Reciter id: the timestamp endpoint wants a CHAPTER-reciter id. For every reciter this
 * app ships, that id equals the ayah-recitation id we already store, so the stored id is
 * passed through. AUDIO_RECITER_ID_MAP overrides any reciter whose ids ever diverge.
 */

import { fetchAudioTimestamp } from "../api/quran-data-provider";
import { idb } from "../storage/idb.service";

export interface VerseRef {
  sura: number;
  aya: number;
}

export interface RangeDurations {
  /** Per-verse durations in seconds, aligned to the input queue order (index → seconds). */
  perVerseSec: number[];
  /** Total range duration in seconds (sum of per-verse durations). */
  totalSec: number;
}

/**
 * Overrides for reciters whose chapter-reciter id differs from their ayah-recitation id.
 * Key = stored reciter id (ayah recitation id), value = chapter-reciter id for timestamps.
 * Empty today because the app's reciters share the same id in both id spaces.
 */
const AUDIO_RECITER_ID_MAP: Record<string, string> = {};

function chapterReciterId(reciterId: string): string {
  return AUDIO_RECITER_ID_MAP[reciterId] ?? reciterId;
}

// ─── IDB cache (meta store) ─────────────────────────────────────────────────────
// One record per (reciter, verse) holding the verse's duration in ms.

interface DurationRecord {
  key: string;
  ms: number;
}

function cacheKey(reciterId: string, sura: number, aya: number): string {
  return `dur:${reciterId}:${sura}:${aya}`;
}

async function getCachedMs(
  reciterId: string,
  sura: number,
  aya: number,
): Promise<number | null> {
  try {
    const rec = await idb.get<DurationRecord>(
      "meta",
      cacheKey(reciterId, sura, aya),
    );
    return rec && rec.ms > 0 ? rec.ms : null;
  } catch {
    return null;
  }
}

function putCachedMs(
  reciterId: string,
  sura: number,
  aya: number,
  ms: number,
): void {
  if (ms <= 0) return;
  idb
    .put("meta", { key: cacheKey(reciterId, sura, aya), ms })
    .catch(() => {});
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Resolve the duration of a single verse (seconds), using the IDB cache first and the
 * timestamp endpoint otherwise. Returns 0 if it can't be resolved.
 */
export async function getVerseDurationSec(
  reciterId: string,
  sura: number,
  aya: number,
  signal?: AbortSignal,
): Promise<number> {
  const cached = await getCachedMs(reciterId, sura, aya);
  if (cached != null) return cached / 1000;
  if (signal?.aborted) return 0;
  try {
    const r = await fetchAudioTimestamp(chapterReciterId(reciterId), {
      verseKey: `${sura}:${aya}`,
    });
    const ms = Math.max(0, r.timestampTo - r.timestampFrom);
    if (ms > 0) putCachedMs(reciterId, sura, aya, ms);
    return ms / 1000;
  } catch {
    return 0;
  }
}

/**
 * Resolve per-verse + total durations for a whole playback range.
 *
 * Fast path: when the range is one CONTIGUOUS full surah (aya 1..N with no gaps), the
 * total comes from a single chapter_number call and the per-verse splits from cached/
 * batched verse calls. For any other range we resolve each verse (cache-first, in
 * parallel) and sum.
 *
 * Always returns an array aligned to `queue`; unresolved verses are 0 (callers fall back
 * to the live ExoPlayer-reported duration for those).
 */
export async function getRangeDurations(
  reciterId: string,
  queue: VerseRef[],
  signal?: AbortSignal,
): Promise<RangeDurations> {
  const perVerseSec = new Array<number>(queue.length).fill(0);
  if (queue.length === 0) return { perVerseSec, totalSec: 0 };

  // Resolve every verse's duration cache-first, in parallel.
  await Promise.all(
    queue.map(async (v, i) => {
      if (signal?.aborted) return;
      perVerseSec[i] = await getVerseDurationSec(
        reciterId,
        v.sura,
        v.aya,
        signal,
      );
    }),
  );

  // Total is ALWAYS the sum of the selected verses' durations — i.e. range-relative. A
  // partial range (page / hizb / rub) shows only its own length, and the bar starts at
  // 0:00, never the whole-surah duration. The per-verse timestamps tile the surah exactly
  // (a verse's [from,to) abuts the next), so summing is accurate for both full surahs and
  // arbitrary sub-ranges, and needs no separate chapter call.
  const totalSec = perVerseSec.reduce((a, b) => a + b, 0);

  return { perVerseSec, totalSec };
}
