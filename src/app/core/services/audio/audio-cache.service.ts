/**
 * AUDIO CACHE SERVICE
 *
 * Stores per-ayah recitation audio in the `audio` IndexedDB store keyed by
 * `${reciter}:${sura}:${aya}`. The Playback screen calls `getOrFetch` to
 * resolve a playable URL — when a blob is cached, we return an
 * object URL so `<audio>` plays instantly even offline; otherwise we fall
 * back to the streaming URL from `fetchAudioForAyah`.
 */

import { idb } from "../storage/idb.service";
import { fetchAudioForAyah } from "../data/quran.service";

const STORE = "audio";

interface AudioRecord {
  id: string;
  blob: Blob;
  mime: string;
}

function key(reciter: string, sura: number, aya: number): string {
  return `${reciter}:${sura}:${aya}`;
}

export async function hasCached(
  reciter: string,
  sura: number,
  aya: number,
): Promise<boolean> {
  const rec = await idb.get<AudioRecord>(STORE, key(reciter, sura, aya));
  return !!rec;
}

export async function getCachedBlob(
  reciter: string,
  sura: number,
  aya: number,
): Promise<Blob | null> {
  const rec = await idb.get<AudioRecord>(STORE, key(reciter, sura, aya));
  return rec ? rec.blob : null;
}

/**
 * Returns a playable URL for the verse. Cached blobs become `blob:` URLs;
 * otherwise we return the streaming URL from the API. Callers should
 * `URL.revokeObjectURL` returned blob URLs when done — the queue does this
 * after each verse to avoid leaks.
 */
export async function getPlayableUrl(
  reciter: string,
  sura: number,
  aya: number,
): Promise<{ url: string; cached: boolean }> {
  const blob = await getCachedBlob(reciter, sura, aya);
  if (blob) {
    return { url: URL.createObjectURL(blob), cached: true };
  }
  const url = await fetchAudioForAyah(sura, aya, reciter);
  return { url, cached: false };
}

/**
 * Download a verse's audio and persist it. Returns true on success.
 * If a blob is already cached, returns true without refetching.
 */
export async function downloadAndCache(
  reciter: string,
  sura: number,
  aya: number,
  signal?: AbortSignal,
): Promise<boolean> {
  if (await hasCached(reciter, sura, aya)) return true;
  const url = await fetchAudioForAyah(sura, aya, reciter);
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`audio download failed (${res.status})`);
  const blob = await res.blob();
  const rec: AudioRecord = {
    id: key(reciter, sura, aya),
    blob,
    mime: blob.type || "audio/mpeg",
  };
  await idb.put(STORE, rec);
  return true;
}

export async function clearAllCachedAudio(): Promise<void> {
  await idb.clear(STORE);
}

export async function countCachedAudio(): Promise<number> {
  return idb.count(STORE);
}

/**
 * Returns a map of sura → number of cached verses for the given reciter.
 * Scans only key strings (no blob data) so it's fast even with many entries.
 */
export async function getCachedCountsPerSurah(
  reciter: string,
): Promise<Record<number, number>> {
  const keys = await idb.getAllKeys(STORE);
  const prefix = `${reciter}:`;
  const counts: Record<number, number> = {};
  for (const k of keys) {
    if (!k.startsWith(prefix)) continue;
    const parts = k.split(":");
    if (parts.length !== 3) continue;
    const sura = parseInt(parts[1], 10);
    if (!isNaN(sura)) counts[sura] = (counts[sura] ?? 0) + 1;
  }
  return counts;
}

export async function deleteCached(
  reciter: string,
  sura: number,
  aya: number,
): Promise<void> {
  await idb.delete(STORE, key(reciter, sura, aya));
}

/**
 * Returns a blob URL for the verse. If it’s already cached, returns instantly;
 * otherwise downloads it first, caches it, then returns the blob URL.
 * Use this in the playback queue so that uncached verses are downloaded before
 * playback begins.
 */
export async function getCachedOrDownload(
  reciter: string,
  sura: number,
  aya: number,
  signal?: AbortSignal,
): Promise<string> {
  const blob = await getCachedBlob(reciter, sura, aya);
  if (blob) {
    return URL.createObjectURL(blob);
  }
  // Not cached → download, then cache
  const success = await downloadAndCache(reciter, sura, aya, signal);
  if (!success) {
    // Fallback: fetch the streaming URL directly if downloadAndCache fails
    const url = await fetchAudioForAyah(sura, aya, reciter);
    return url;
  }
  const newBlob = await getCachedBlob(reciter, sura, aya);
  if (newBlob) return URL.createObjectURL(newBlob);
  // Absolute last resort
  return fetchAudioForAyah(sura, aya, reciter);
}
