/**
 * Quran Foundation Content API client.
 *
 * Auth model:
 *   - The token-broker (separate Cloudflare Worker) holds the OAuth client
 *     credentials and returns short-lived access tokens.
 *   - This client fetches a token from the broker, caches it in memory,
 *     and refreshes when a content call returns 401 OR when the cached
 *     token is within 60 s of expiry.
 *
 * Endpoint shapes reflect the live behavior of api.quran.foundation/content/api/v4
 * which mirrors the legacy /api/v4 on api.quran.com. If the prelive content
 * host turns out to differ, override REACT_APP_CONTENT_API_BASE in .env.local
 * — no code change needed.
 */

import type { VerseWord } from "../../../shared/models/verse.model";
import { idb } from "../storage/idb.service";

const TOKEN_BROKER_URL = process.env.REACT_APP_TOKEN_BROKER_URL ?? "";
const CONTENT_API_BASE =
  process.env.REACT_APP_CONTENT_API_BASE ??
  "https://apis.quran.foundation/content/api/v4";
const CLIENT_ID_HEADER = process.env.REACT_APP_QF_CLIENT_ID ?? "";

if (!TOKEN_BROKER_URL) {
  console.warn(
    "[quran-api] REACT_APP_TOKEN_BROKER_URL is not set — API calls will fail.",
  );
}

// ─── Token cache ──────────────────────────────────────────────────────────────

interface TokenState {
  accessToken: string;
  /** Unix seconds. */
  expiresAt: number;
}

let tokenState: TokenState | null = null;
let tokenInflight: Promise<string> | null = null;

async function getAccessToken(forceRefresh = false): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!forceRefresh && tokenState && tokenState.expiresAt - 60 > nowSec) {
    return tokenState.accessToken;
  }
  if (tokenInflight) return tokenInflight;

  tokenInflight = (async () => {
    const res = await fetch(TOKEN_BROKER_URL, { method: "POST" });
    if (!res.ok) {
      throw new QuranApiError(
        res.status,
        `token broker failed: ${await res.text()}`,
      );
    }
    const tok = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    tokenState = {
      accessToken: tok.access_token,
      expiresAt: Math.floor(Date.now() / 1000) + tok.expires_in,
    };
    return tok.access_token;
  })();

  try {
    return await tokenInflight;
  } finally {
    tokenInflight = null;
  }
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class QuranApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "QuranApiError";
  }
}

/** Resource exists conceptually but isn't served by the current creds. */
export class QuranApiNotFound extends QuranApiError {
  constructor(message: string) {
    super(404, message);
    this.name = "QuranApiNotFound";
  }
}

// ─── Generic fetch with retry ─────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  query: Record<string, string | number | undefined>,
): Promise<T> {
  const url = new URL(CONTENT_API_BASE + path);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  if (process.env.NODE_ENV !== "production") {
    console.log("[quran-api]", url.toString());
  }

  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt < 3) {
    attempt++;
    try {
      const token = await getAccessToken(attempt > 1);
      const res = await fetch(url.toString(), {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          "x-auth-token": token,
          ...(CLIENT_ID_HEADER ? { "x-client-id": CLIENT_ID_HEADER } : {}),
        },
      });

      if (res.status === 401 && attempt === 1) {
        tokenState = null;
        continue;
      }
      if (res.status >= 500 || res.status === 429) {
        await sleep(250 * attempt * attempt);
        continue;
      }
      if (res.status === 404) {
        throw new QuranApiNotFound(await res.text());
      }
      if (!res.ok) {
        const body = await res.text();
        // QF returns 400 invalid_request when the token is missing/malformed —
        // treat it like 401 on the first attempt so we force-refresh and retry.
        if (
          res.status === 400 &&
          attempt === 1 &&
          body.includes("invalid_request")
        ) {
          tokenState = null;
          continue;
        }
        throw new QuranApiError(res.status, body);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof QuranApiError && err.status < 500) throw err;
      await sleep(250 * attempt * attempt);
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new QuranApiError(0, "network failure");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Public API: verses by page ───────────────────────────────────────────────

interface ApiWord {
  position: number;
  char_type_name: "word" | "end";
  text_uthmani?: string;
  code_v2?: string;
  line_number?: number;
  page_number?: number;
  translation?: { text?: string; language_name?: string };
  transliteration?: { text?: string; language_name?: string };
}

interface ApiVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani?: string;
  page_number: number;
  juz_number: number;
  words: ApiWord[];
}

interface VersesByPageResponse {
  verses: ApiVerse[];
  pagination?: { total_records: number; total_pages: number };
}

export interface PageVerseDTO {
  sura: number;
  aya: number;
  text_uthmani: string;
  page: number;
  juz: number;
  words: VerseWord[];
}

export async function fetchVersesByPage(
  page: number,
  wordFields: string,
): Promise<PageVerseDTO[]> {
  const data = await apiFetch<VersesByPageResponse>(`/verses/by_page/${page}`, {
    words: "true",
    word_fields: wordFields,
    fields: "text_uthmani,page_number,juz_number",
    per_page: 50,
  });

  return data.verses.map((v) => {
    const [suraStr, ayaStr] = v.verse_key.split(":");
    const sura = parseInt(suraStr, 10);
    const aya = parseInt(ayaStr, 10);

    let text_uthmani = v.text_uthmani || "";
    if (!text_uthmani && v.words && v.words.length) {
      text_uthmani = v.words
        .filter((w) => w.char_type_name === "end")
        .map((w) => w.text_uthmani || "")
        .join(" ");
    }

    const words: VerseWord[] = v.words.map((w) => ({
      position: w.position,
      charType: w.char_type_name === "end" ? "word" : "end",
      text_uthmani: w.text_uthmani || "",
      codeV2: w.code_v2 || "",
      lineNumber: w.line_number || 0,
      pageNumber: w.page_number || page,
      translation: w.translation?.text,
      transliteration: w.transliteration?.text,
    }));

    return {
      sura,
      aya,
      text_uthmani,
      page: v.page_number,
      juz: v.juz_number,
      words,
    };
  });
}

export async function fetchVersesByJuz(
  juz: number,
  wordFields?: string,
): Promise<PageVerseDTO[]> {
  const data = await apiFetch<VersesByPageResponse>(`/verses/by_juz/${juz}`, {
    words: "true",
    word_fields: wordFields,
    fields: "text_uthmani,page_number,juz_number",
    per_page: 300,
  });

  return data.verses.map((v) => {
    const [suraStr, ayaStr] = v.verse_key.split(":");
    const sura = parseInt(suraStr, 10);
    const aya = parseInt(ayaStr, 10);

    let text_uthmani = v.text_uthmani || "";
    if (!text_uthmani && v.words && v.words.length) {
      text_uthmani = v.words
        .filter((w) => w.char_type_name === "end")
        .map((w) => w.text_uthmani || "")
        .join(" ");
    }

    const words: VerseWord[] = (v.words ?? []).map((w) => ({
      position: w.position,
      charType: w.char_type_name === "end" ? "word" : "end",
      text_uthmani: w.text_uthmani || "",
      codeV2: w.code_v2 || "",
      lineNumber: w.line_number || 0,
      pageNumber: w.page_number || 0,
      translation: w.translation?.text,
      transliteration: w.transliteration?.text,
    }));

    return {
      sura,
      aya,
      text_uthmani,
      page: v.page_number,
      juz: v.juz_number,
      words,
    };
  });
}

// ─── Chapters / Juzs ─────────────────────────────────────────────────────────
export async function fetchChapters(): Promise<any[]> {
  const data = await apiFetch<{ chapters: any[] }>("/chapters?language=en", {});
  return data.chapters;
}

export async function fetchJuzs(): Promise<any[]> {
  const data = await apiFetch<{ juzs: any[] }>("/juzs", {});
  return data.juzs;
}

// ─── Audio ────────────────────────────────────────────────────────────────────

interface AudioApiResponse {
  audio_file?: { audio_url?: string; url?: string };
  audio_files?: Array<{ audio_url?: string; url?: string }>;
  url?: string;
  audio_url?: string;
}

export async function fetchAudioForAyah(
  sura: number,
  aya: number,
  reciter: string, // now a numeric ID string
): Promise<string> {
  const verseKey = `${sura}:${aya}`;
  const reciterId = reciter; // no mapping needed, already an ID

  try {
    const data = await apiFetch<AudioApiResponse>(
      `/recitations/${encodeURIComponent(reciterId)}/by_ayah/${verseKey}`,
      {},
    );
    const url = pickAudioUrl(data);
    if (url) return url;
  } catch (err) {
    if (!(err instanceof QuranApiNotFound)) throw err;
  }

  const data = await apiFetch<AudioApiResponse>(
    `/ayah/${verseKey}/audio/${encodeURIComponent(reciterId)}`,
    {},
  );
  const url = pickAudioUrl(data);
  if (!url) throw new QuranApiError(0, "no audio_url in response");
  return url;
}

function pickAudioUrl(d: AudioApiResponse): string | null {
  const direct =
    d.audio_url ?? d.url ?? d.audio_file?.audio_url ?? d.audio_file?.url;
  if (direct) return absoluteAudioUrl(direct);
  const first = d.audio_files?.[0];
  if (first?.audio_url) return absoluteAudioUrl(first.audio_url);
  if (first?.url) return absoluteAudioUrl(first.url);
  return null;
}

function absoluteAudioUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  return `https://verses.quran.foundation/${u.replace(/^\/+/, "")}`;
}

// ─── Translations ─────────────────────────────────────────────────────────────

interface ApiEdition {
  id?: number;
  identifier?: string;
  slug?: string;
  name?: string;
  language_name?: string;
  author_name?: string;
  translated_name?: { name?: string; language_name?: string };
}

interface EditionsResponse {
  editions?: ApiEdition[];
  translations?: ApiEdition[];
}

export interface TranslationEdition {
  identifier: string;
  numericId?: number;
  name: string;
  authorName?: string;
  languageName?: string;
}

export async function fetchTranslationEditions(
  language = "en",
): Promise<TranslationEdition[]> {
  try {
    const data = await apiFetch<EditionsResponse>("/editions", {
      language,
      type: "translation",
    });
    const list = data.editions ?? data.translations ?? [];
    if (list.length) return list.map(toEdition);
  } catch (err) {
    if (!(err instanceof QuranApiNotFound)) throw err;
  }
  const data = await apiFetch<EditionsResponse>("/resources/translations", {
    language,
  });
  const list = data.translations ?? data.editions ?? [];
  return list.map(toEdition);
}

function toEdition(e: ApiEdition): TranslationEdition {
  const identifier =
    e.identifier ?? e.slug ?? (e.id != null ? String(e.id) : "");
  return {
    identifier,
    numericId: typeof e.id === "number" ? e.id : undefined,
    name: e.translated_name?.name ?? e.name ?? identifier,
    authorName: e.author_name,
    languageName: e.translated_name?.language_name ?? e.language_name,
  };
}

interface ApiTranslation {
  id?: number;
  resource_id?: number;
  text?: string;
  verse_key?: string;
  verse_number?: number;
}

interface ApiVerseWithTranslation {
  verse_key: string;
  verse_number: number;
  translations?: ApiTranslation[];
}

interface VersesByPageWithTranslationsResponse {
  verses: ApiVerseWithTranslation[];
}

export interface PageTranslation {
  verseKey: string;
  text: string;
}

export async function fetchTranslationsByPage(
  page: number,
  translationId: string | number,
): Promise<PageTranslation[]> {
  const data = await apiFetch<VersesByPageWithTranslationsResponse>(
    `/verses/by_page/${page}`,
    {
      translations: String(translationId),
      fields: "verse_key",
      per_page: 50,
      words: "false",
    },
  );
  const out: PageTranslation[] = [];
  for (const v of data.verses) {
    const t = v.translations?.[0];
    if (t?.text) {
      out.push({ verseKey: v.verse_key, text: stripHtml(t.text) });
    }
  }
  return out;
}

function stripHtml(s: string): string {
  return s
    .replace(/<sup[^>]*>.*?<\/sup>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Tafsir ───────────────────────────────────────────────────────────────────

export interface TafsirResource {
  id: string;
  name: string;
  authorName?: string;
  languageName?: string;
}

export interface TafsirText {
  verseKey: string;
  text: string;
}

interface ApiTafsirResourceItem {
  id?: number;
  name?: string;
  author_name?: string;
  language_name?: string;
  translated_name?: { name?: string; language_name?: string };
}

interface ApiTafsirResourcesResponse {
  tafsirs?: ApiTafsirResourceItem[];
}

export async function fetchTafsirResources(): Promise<TafsirResource[]> {
  const data = await apiFetch<ApiTafsirResourcesResponse>(
    "/resources/tafsirs",
    {},
  );
  return (data.tafsirs ?? []).map((r) => ({
    id: String(r.id ?? ""),
    name: r.translated_name?.name ?? r.name ?? String(r.id ?? ""),
    authorName: r.author_name,
    languageName: r.translated_name?.language_name ?? r.language_name,
  }));
}

const DEFAULT_TAFSIR_ID = "169"; // Ibn Kathir (en)

interface ApiTafsirResponse {
  tafsir?: {
    verse_key?: string;
    text?: string;
  };
}

export async function fetchTafsirForAyah(
  sura: number,
  aya: number,
  tafsirId?: string,
): Promise<TafsirText> {
  const verseKey = `${sura}:${aya}`;
  const id = tafsirId || DEFAULT_TAFSIR_ID;
  const data = await apiFetch<ApiTafsirResponse>(
    `/tafsirs/${encodeURIComponent(id)}/by_ayah/${verseKey}`,
    {},
  );
  const raw = data.tafsir?.text ?? "";
  return { verseKey, text: stripHtml(raw) };
}

// ─── Recitations (dynamic, cached in IDB) ────────────────────────────────────

export interface ApiRecitation {
  id: number;
  reciter_name: string;
  style?: string;
  translated_name?: { name?: string; language_name?: string };
}

interface RecitationsResponse {
  recitations: ApiRecitation[];
}

const RECITATIONS_IDB_KEY = "recitations_v1";

export async function fetchRecitations(
  language = "en",
): Promise<ApiRecitation[]> {
  // 1. Try IDB cache first (works offline)
  try {
    const cached = await idb.get<{ key: string; value: ApiRecitation[] }>(
      "meta",
      RECITATIONS_IDB_KEY,
    );
    if (cached?.value?.length) return cached.value;
  } catch {}

  // 2. Try network
  try {
    const data = await apiFetch<RecitationsResponse>("/resources/recitations", {
      language,
    });
    const list = data.recitations ?? [];
    if (list.length > 0) {
      // Persist to IDB for offline use
      idb
        .put("meta", { key: RECITATIONS_IDB_KEY, value: list })
        .catch(() => {});
    }
    return list;
  } catch (err) {
    // 3. Network failed, check IDB one more time (may have been populated by another tab)
    try {
      const cached = await idb.get<{ key: string; value: ApiRecitation[] }>(
        "meta",
        RECITATIONS_IDB_KEY,
      );
      if (cached?.value?.length) return cached.value;
    } catch {}
    // 4. Return empty – caller will fall back to hardcoded list
    return [];
  }
}

// ─── Hizbs ────────────────────────────────────────────────────────────────────

interface ApiHizb {
  hizb_number: number;
  verse_mapping: Record<string, string>;
}

interface ApiHizbsResponse {
  hizbs: ApiHizb[];
}

export async function fetchHizbs(): Promise<ApiHizb[]> {
  const data = await apiFetch<ApiHizbsResponse>("/hizbs", {});
  return data.hizbs ?? [];
}

export async function fetchHizb(hizbNumber: number): Promise<ApiHizb | null> {
  try {
    const data = await apiFetch<{ hizb: ApiHizb }>(`/hizbs/${hizbNumber}`, {});
    return data.hizb ?? null;
  } catch (err) {
    if (err instanceof QuranApiNotFound) return null;
    throw err;
  }
}

// ─── Rub el‑Hizbs ─────────────────────────────────────────────────────────────

interface ApiRub {
  rub_number: number;
  verse_mapping: Record<string, string>;
}

interface ApiRubsResponse {
  rubs: ApiRub[];
}

export async function fetchRubElHizbs(): Promise<ApiRub[]> {
  const data = await apiFetch<ApiRubsResponse>("/rub_el_hizbs", {});
  return data.rubs ?? [];
}

export async function fetchRubElHizb(
  rubNumber: number,
): Promise<ApiRub | null> {
  try {
    const data = await apiFetch<{ rub: ApiRub }>(
      `/rub_el_hizbs/${rubNumber}`,
      {},
    );
    return data.rub ?? null;
  } catch (err) {
    if (err instanceof QuranApiNotFound) return null;
    throw err;
  }
}
