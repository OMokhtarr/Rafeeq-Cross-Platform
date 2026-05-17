import { quranClient, isSdkAvailable } from "./quran-sdk-client";
import * as fallback from "./quran-api.client";
import type {
  PageTranslation,
  TafsirText,
  TafsirResource,
} from "./quran-api.client";

async function trySdkOrFallback<Args extends any[], Return>(
  methodName: string,
  ...args: Args
): Promise<Return> {
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

  const fallbackFn = (fallback as any)[methodName];
  if (typeof fallbackFn !== "function") {
    throw new Error(`No implementation for "${methodName}".`);
  }
  return await fallbackFn(...args);
}

export async function fetchVersesByPage(page: number, wordFields: string) {
  return trySdkOrFallback("fetchVersesByPage", page, wordFields);
}

export async function fetchVersesByJuz(juz: number, wordFields?: string) {
  return trySdkOrFallback("fetchVersesByJuz", juz, wordFields);
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

export async function fetchTranslationsByPage(
  page: number,
  translationId: string | number,
): Promise<PageTranslation[]> {
  return trySdkOrFallback<[number, string | number], PageTranslation[]>(
    "fetchTranslationsByPage",
    page,
    translationId,
  );
}

export async function fetchTafsirForAyah(
  sura: number,
  aya: number,
  tafsirId?: string,
): Promise<TafsirText> {
  return trySdkOrFallback<[number, number, string | undefined], TafsirText>(
    "fetchTafsirForAyah",
    sura,
    aya,
    tafsirId,
  );
}

export async function fetchTafsirResources(): Promise<TafsirResource[]> {
  return trySdkOrFallback<[], TafsirResource[]>("fetchTafsirResources");
}

export async function fetchRecitations(language?: string) {
  return trySdkOrFallback("fetchRecitations", language);
}

export async function fetchHizbs() {
  return trySdkOrFallback("fetchHizbs");
}

export async function fetchHizb(hizbNumber: number) {
  return trySdkOrFallback("fetchHizb", hizbNumber);
}

export async function fetchRubElHizbs() {
  return trySdkOrFallback("fetchRubElHizbs");
}

export async function fetchRubElHizb(rubNumber: number) {
  return trySdkOrFallback("fetchRubElHizb", rubNumber);
}
