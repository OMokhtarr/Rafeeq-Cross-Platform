/**
 * AUDIO FILE CACHE (Android native)
 *
 * On Android, verse audio is stored ONCE on the device filesystem under
 * `quran-audio/{reciter}_{sura}_{aya}.mp3` (Directory.Data). Both playback engines
 * read this single copy:
 *   - The native ExoPlayer reads the `file://` path directly.
 *   - The in-app JS <audio> element reads it via Capacitor.convertFileSrc(), which
 *     yields a `capacitor://localhost/_capacitor_file_...` URL the WebView can play
 *     without copying bytes into a blob.
 *
 * This avoids the duplicate-file problem: there is exactly one MP3 per verse on disk,
 * shared by the phone player and the car (ExoPlayer). Web and iOS continue to use the
 * IndexedDB blob cache in audio-cache.service.ts.
 */

import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { fetchAudioForAyah } from "../data/quran.service";

const DIR = "quran-audio";

/** True only on Android, where the shared file cache is used. */
export function usesFileCache(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}

function fileName(reciter: string, sura: number, aya: number): string {
  // Reciter ids can contain characters that are awkward in filenames; keep it simple
  // and deterministic by replacing anything non-alphanumeric.
  const safeReciter = reciter.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${DIR}/${safeReciter}_${sura}_${aya}.mp3`;
}

async function ensureDir(): Promise<void> {
  try {
    await Filesystem.mkdir({
      path: DIR,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    // Already exists — Filesystem.mkdir rejects if the directory is present.
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await Filesystem.stat({ path, directory: Directory.Data });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the absolute device path (`file:///...`) for a verse, downloading and caching
 * it first if needed. This is what the native ExoPlayer plays.
 */
export async function getNativeFileUri(
  reciter: string,
  sura: number,
  aya: number,
  signal?: AbortSignal,
): Promise<string> {
  await ensureDir();
  const path = fileName(reciter, sura, aya);

  if (!(await fileExists(path))) {
    const remoteUrl = await fetchAudioForAyah(sura, aya, reciter);
    const res = await fetch(remoteUrl, { signal });
    if (!res.ok) throw new Error(`audio download failed (${res.status})`);
    const blob = await res.blob();
    const base64 = await blobToBase64(blob);
    await Filesystem.writeFile({
      path,
      directory: Directory.Data,
      data: base64,
    });
  }

  const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
  return uri; // file:///data/user/0/.../quran-audio/..._..._...mp3
}

/**
 * A WebView-playable URL for the same cached file, for the in-app <audio> element.
 * Converts the file:// path to capacitor://localhost/_capacitor_file_... so the
 * WebView can stream it directly (no base64 blob in memory).
 */
export async function getWebPlayableUri(
  reciter: string,
  sura: number,
  aya: number,
  signal?: AbortSignal,
): Promise<string> {
  const fileUri = await getNativeFileUri(reciter, sura, aya, signal);
  return Capacitor.convertFileSrc(fileUri);
}

/** Download + cache without returning a URL (for background prefetch). */
export async function ensureCachedFile(
  reciter: string,
  sura: number,
  aya: number,
  signal?: AbortSignal,
): Promise<void> {
  await getNativeFileUri(reciter, sura, aya, signal);
}

export async function hasCachedFile(
  reciter: string,
  sura: number,
  aya: number,
): Promise<boolean> {
  return fileExists(fileName(reciter, sura, aya));
}

/**
 * Resolve a source ExoPlayer can play for the cold-start persisted queue, WITHOUT
 * forcing a download. Prefers an already-cached local file (offline, instant); falls
 * back to the remote https:// URL (always available). ExoPlayer streams https directly.
 *
 * This is used to persist the whole queue up front: the live path downloads verses as
 * they play, so most aren't cached yet when the queue is first pushed — we must NOT
 * drop those, or the persisted cold-start list would be nearly empty.
 */
export async function getColdStartUri(
  reciter: string,
  sura: number,
  aya: number,
): Promise<string> {
  const path = fileName(reciter, sura, aya);
  if (await fileExists(path)) {
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Data });
    return uri;
  }
  return fetchAudioForAyah(sura, aya, reciter);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip the "data:audio/mpeg;base64," prefix — Filesystem wants raw base64.
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
