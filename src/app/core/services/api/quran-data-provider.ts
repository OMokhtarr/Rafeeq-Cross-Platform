import { quranClient, isSdkAvailable } from "./quran-sdk-client";
import * as fallback from "./quran-api.client";

// ─── Internal helper ─────────────────────────────────────────────────────────
async function trySdkOrFallback<Args extends any[], Return>(
  methodName: string,
  ...args: Args
): Promise<Return> {
  // Try SDK first
  if (isSdkAvailable()) {
    try {
      const fn = (quranClient as any)[methodName];
      if (typeof fn === "function") {
        return await fn(...args);
      }
    } catch (err) {
      console.warn(
        `SDK call "${methodName}" failed, falling back to custom client.`,
        err,
      );
    }
  }

  // Fallback to custom client
  const fallbackFn = (fallback as any)[methodName];
  if (typeof fallbackFn !== "function") {
    throw new Error(`No implementation for "${methodName}".`);
  }
  return await fallbackFn(...args);
}

// ─── Public API – mirror the custom client’s exports ───────────────────────

export async function fetchVersesByPage(page: number, wordFields: string) {
  return trySdkOrFallback("fetchVersesByPage", page, wordFields);
}

export async function fetchVersesByJuz(juz: number) {
  return trySdkOrFallback("fetchVersesByJuz", juz);
}

export async function searchQuran(query: string) {
  return trySdkOrFallback("searchQuran", query);
}

export async function fetchAudioForAyah(
  sura: number,
  aya: number,
  reciter: string,
) {
  return trySdkOrFallback("fetchAudioForAyah", sura, aya, reciter);
}

export async function fetchChapters() {
  return trySdkOrFallback("fetchChapters");
}

export async function fetchJuzs() {
  return trySdkOrFallback("fetchJuzs");
}
