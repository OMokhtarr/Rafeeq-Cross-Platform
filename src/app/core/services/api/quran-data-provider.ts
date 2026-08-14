import * as fallback from "./quran-api.client";
import type {
  PageTranslation,
  TafsirText,
  TafsirResource,
  AudioTimestampResult,
  PagesLookupResult,
  PagesLookupScope,
} from "./quran-api.client";

export type { AudioTimestampResult } from "./quran-api.client";

/**
 * Dispatches to the custom client in quran-api.client.ts, which authenticates
 * through our token broker.
 *
 * This used to try the @quranjs/api SDK first. That path required
 * REACT_APP_QF_CLIENT_SECRET in the browser bundle — where CRA inlines it,
 * making the OAuth client secret extractable from any installed APK. The SDK
 * path was already dead in practice: it calls oauth2.quran.foundation directly,
 * which CORS blocks from a browser, so every call fell through to here anyway.
 * The name is kept so the 15 exports below stay untouched.
 */
async function trySdkOrFallback<Args extends any[], Return>(
  methodName: string,
  ...args: Args
): Promise<Return> {
  const fallbackFn = (fallback as any)[methodName];
  if (typeof fallbackFn !== "function") {
    throw new Error(`No implementation for "${methodName}".`);
  }
  return await fallbackFn(...args);
}

export async function fetchVersesByPage(
  page: number,
  wordFields: string,
  mushafId?: number,
) {
  return trySdkOrFallback("fetchVersesByPage", page, wordFields, mushafId);
}

export async function fetchVersesByJuz(
  juz: number,
  wordFields?: string,
  mushafId?: number,
) {
  return trySdkOrFallback("fetchVersesByJuz", juz, wordFields, mushafId);
}

export async function fetchPagesLookup(
  scope: PagesLookupScope,
  mushafId?: number,
): Promise<PagesLookupResult> {
  return trySdkOrFallback<[PagesLookupScope, number | undefined], PagesLookupResult>(
    "fetchPagesLookup",
    scope,
    mushafId,
  );
}

export async function fetchAudioForAyah(
  sura: number,
  aya: number,
  reciter: string,
) {
  return trySdkOrFallback("fetchAudioForAyah", sura, aya, reciter);
}

export async function fetchAudioTimestamp(
  reciterId: string | number,
  scope: {
    chapterNumber?: number;
    verseKey?: string;
    verseId?: number;
    word?: number;
    wordFrom?: number;
    wordTo?: number;
  },
): Promise<AudioTimestampResult> {
  return trySdkOrFallback<
    [string | number, typeof scope],
    AudioTimestampResult
  >("fetchAudioTimestamp", reciterId, scope);
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
  mushafId?: number,
): Promise<PageTranslation[]> {
  return trySdkOrFallback<
    [number, string | number, number | undefined],
    PageTranslation[]
  >("fetchTranslationsByPage", page, translationId, mushafId);
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
