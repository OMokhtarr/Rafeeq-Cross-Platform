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

const TOKEN_BROKER_URL =
  process.env.REACT_APP_TOKEN_BROKER_URL ?? "";
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
  if (
    !forceRefresh &&
    tokenState &&
    tokenState.expiresAt - 60 > nowSec
  ) {
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
  constructor(
    public status: number,
    message: string,
  ) {
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
          // Some Foundation deployments require these; harmless if ignored.
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
      // 404 here means "this resource isn't served by the current
      // credentials" (prelive only ships pages 1–49). Surface as a
      // typed signal so callers can skip gracefully.
      if (res.status === 404) {
        throw new QuranApiNotFound(await res.text());
      }
      if (!res.ok) {
        throw new QuranApiError(res.status, await res.text());
      }
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      // 404 + 4xx errors don't benefit from retry; let the caller decide.
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

interface ApiVerse {
  id: number;
  verse_number: number;
  verse_key: string;
  text_uthmani?: string;
  page_number: number;
  juz_number: number;
  words: ApiWord[];
}

interface ApiWord {
  position: number;
  char_type_name: "word" | "end";
  text_uthmani?: string;
  code_v1?: string;
  line_number?: number;
  page_number?: number;
}

interface VersesByPageResponse {
  verses: ApiVerse[];
  pagination?: { total_records: number; total_pages: number };
}

export interface PageVerseDTO {
  sura: number;
  aya: number;
  textUthmani: string;
  page: number;
  juz: number;
  words: VerseWord[];
}

/**
 * Fetch every verse on a Madani Mushaf page.
 * `wordFields` comes from MUSHAFS[kind].wordFields.
 */
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
    return {
      sura: parseInt(suraStr, 10),
      aya: parseInt(ayaStr, 10),
      textUthmani: v.text_uthmani ?? joinWordsUthmani(v.words),
      page: v.page_number,
      juz: v.juz_number,
      words: v.words.map((w) => ({
        position: w.position,
        charType: w.char_type_name,
        textUthmani: w.text_uthmani ?? "",
        codeV1: w.code_v1 ?? "",
        lineNumber: w.line_number ?? 0,
        pageNumber: w.page_number ?? page,
      })),
    };
  });
}

function joinWordsUthmani(words: ApiWord[]): string {
  return words
    .filter((w) => w.char_type_name === "word")
    .map((w) => w.text_uthmani ?? "")
    .join(" ");
}

// ─── Search ───────────────────────────────────────────────────────────────────

interface ApiSearchVerse {
  verse_id?: number;
  verse_key: string;
  text: string;
  highlighted?: string;
  words?: Array<{ text?: string; text_uthmani?: string }>;
}

interface SearchApiResponse {
  search?: {
    query?: string;
    total_results?: number;
    current_page?: number;
    total_pages?: number;
    results?: ApiSearchVerse[];
  };
  // Some deployments return results at the top level.
  results?: ApiSearchVerse[];
}

export interface SearchResult {
  /** "sura:aya" key, e.g. "2:255" */
  verseKey: string;
  sura: number;
  aya: number;
  /** Arabic text snippet returned by the API (may include <em> tags). */
  text: string;
  /** Page number — derived from pageData when not supplied by the API. */
  page: number;
}

/**
 * Server-side search via the Foundation API.
 * Replaces the client-side worker index.
 */
export async function searchQuran(
  query: string,
  opts: { language?: string; page?: number; perPage?: number } = {},
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];
  const data = await apiFetch<SearchApiResponse>("/search", {
    q,
    language: opts.language ?? "ar",
    page: opts.page ?? 1,
    size: opts.perPage ?? 20,
  });
  const rows = data.search?.results ?? data.results ?? [];
  return rows.map((r) => {
    const [suraStr, ayaStr] = (r.verse_key ?? "").split(":");
    const sura = parseInt(suraStr, 10);
    const aya = parseInt(ayaStr, 10);
    const text =
      r.text ??
      (r.words ?? [])
        .map((w) => w.text_uthmani ?? w.text ?? "")
        .join(" ")
        .trim();
    return {
      verseKey: r.verse_key,
      sura,
      aya,
      text: stripHighlight(text),
      page: 0, // resolved by caller via pageData if needed
    };
  });
}

function stripHighlight(s: string): string {
  return s.replace(/<\/?em>/g, "");
}

// ─── Audio ────────────────────────────────────────────────────────────────────

interface AudioApiResponse {
  audio_file?: { audio_url?: string; url?: string };
  audio_files?: Array<{ audio_url?: string; url?: string }>;
  url?: string;
  audio_url?: string;
}

/**
 * Slug → Foundation reciter id. The Settings page stores reciter as a
 * stable slug ("husary", "afasy", …); the API addresses recitations by
 * numeric id. Keep this map narrow — it only needs to cover what the UI
 * exposes today. Anything not in the map is passed through verbatim, so
 * callers can also pass numeric ids directly.
 */
const RECITER_ID_BY_SLUG: Record<string, string> = {
  husary: "2",
  minshawi: "4",
  // Minshawy murattal (the calmer rendition shown in the playback screen).
  // The Foundation API does not expose a separate id for it on every
  // deployment, so reuse the regular Minshawi recording — the slug remains
  // distinct so the UI can label it correctly.
  "minshawi-murattal": "4",
  sudais: "9",
  afasy: "7",
  ghamdi: "10",
};

function resolveReciterId(reciter: string): string {
  return RECITER_ID_BY_SLUG[reciter] ?? reciter;
}

/**
 * Resolve a playable audio URL for a single ayah from a given reciter.
 * The Foundation API exposes a few shapes across versions, so we try
 * the canonical `/recitations/{reciterId}/by_ayah/{sura}:{aya}` endpoint
 * and fall back to the older `/ayah/{sura}:{aya}/audio/{reciterId}`.
 */
export async function fetchAudioForAyah(
  sura: number,
  aya: number,
  reciter: string,
): Promise<string> {
  const verseKey = `${sura}:${aya}`;
  const reciterId = resolveReciterId(reciter);

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
  const direct = d.audio_url ?? d.url ?? d.audio_file?.audio_url ?? d.audio_file?.url;
  if (direct) return absoluteAudioUrl(direct);
  const first = d.audio_files?.[0];
  if (first?.audio_url) return absoluteAudioUrl(first.audio_url);
  if (first?.url) return absoluteAudioUrl(first.url);
  return null;
}

function absoluteAudioUrl(u: string): string {
  if (/^https?:\/\//i.test(u)) return u;
  // Foundation CDN host for relative audio paths.
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
  /** Stable id used in subsequent API calls (string for identifier, fall back to numeric id). */
  identifier: string;
  /** Numeric id when available — Foundation `translations` param expects numbers. */
  numericId?: number;
  name: string;
  authorName?: string;
  languageName?: string;
}

export async function fetchTranslationEditions(
  language = "en",
): Promise<TranslationEdition[]> {
  // Try the editions endpoint first (per spec), then fall back to the
  // /resources/translations shape used by older deployments.
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
  const identifier = e.identifier ?? e.slug ?? (e.id != null ? String(e.id) : "");
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
  /** "sura:aya" */
  verseKey: string;
  text: string;
}

/**
 * Fetch translations for every verse on a Madani Mushaf page.
 * `translationId` accepts either the numeric id (preferred by the API)
 * or a slug like "en.asad" — we pass it through verbatim.
 */
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
// Stubbed for now — the user is choosing a tafsir source/API later. The shape
// mirrors translations: pass a verseKey + tafsirId, get back plain text.
// To wire this up, replace the body with an apiFetch to the chosen endpoint
// and map its response into { text } the same way translations does.

export interface TafsirText {
  verseKey: string;
  text: string;
}

/**
 * Fetch the tafsir for a single ayah.
 * @param sura 1-based surah number
 * @param aya 1-based ayah number
 * @param tafsirId Stable id/slug for the chosen tafsir source. Ignored by the
 *                 stub but kept in the signature so callers don't change once
 *                 the real API is plugged in.
 */
export async function fetchTafsirForAyah(
  sura: number,
  aya: number,
  _tafsirId?: string,
): Promise<TafsirText> {
  // No real endpoint yet. Returning empty text lets the UI show its
  // "not available" empty state without throwing.
  return Promise.resolve({ verseKey: `${sura}:${aya}`, text: "" });
}
