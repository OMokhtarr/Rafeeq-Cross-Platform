import type { TafsirResource } from "../api/quran-api.client";
import { fetchTafsirResources } from "../api/quran-api.client";
import { hasCachedTafsir } from "../sync/adapters/tafsirs.adapter";

const DOWNLOADED_KEY = "rafiq_downloaded_tafsirs_v1";
const RESOURCES_CACHE_KEY = "rafiq_tafsir_resources_v1";

export function getDownloadedTafsirIds(): string[] {
  try {
    const raw = localStorage.getItem(DOWNLOADED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setDownloadedTafsirIds(ids: string[]): void {
  try {
    localStorage.setItem(DOWNLOADED_KEY, JSON.stringify(ids));
    window.dispatchEvent(new CustomEvent("rafiq-tafsir-downloads-changed"));
  } catch {}
}

export function addDownloadedTafsir(id: string): void {
  const ids = getDownloadedTafsirIds();
  if (!ids.includes(id)) setDownloadedTafsirIds([...ids, id]);
}

export function removeDownloadedTafsir(id: string): void {
  setDownloadedTafsirIds(getDownloadedTafsirIds().filter((i) => i !== id));
}

export function isTafsirDownloaded(id: string): boolean {
  return getDownloadedTafsirIds().includes(id);
}

/**
 * The localStorage list records the user's INTENT to have a tafsir offline.
 * This asks whether the text is actually present — the two diverge when a
 * bootstrap is interrupted, and the UI should say "incomplete" rather than
 * claim a download that never finished.
 */
export async function isTafsirAvailableOffline(id: string): Promise<boolean> {
  if (!isTafsirDownloaded(id)) return false;
  return hasCachedTafsir(Number(id));
}

/** Cached resource list so the TafsirSettings page loads instantly offline. */
export function getCachedTafsirResources(): TafsirResource[] | null {
  try {
    const raw = localStorage.getItem(RESOURCES_CACHE_KEY);
    return raw ? (JSON.parse(raw) as TafsirResource[]) : null;
  } catch {
    return null;
  }
}

export async function fetchAndCacheTafsirResources(): Promise<TafsirResource[]> {
  const list = await fetchTafsirResources();
  try {
    localStorage.setItem(RESOURCES_CACHE_KEY, JSON.stringify(list));
  } catch {}
  return list;
}
