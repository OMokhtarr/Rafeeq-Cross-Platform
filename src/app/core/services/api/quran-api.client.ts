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
if (!CLIENT_ID_HEADER) {
  console.warn(
    "[quran-api] REACT_APP_QF_CLIENT_ID is not set — x-client-id header will be " +
      "omitted, which the QF API rejects with 403 (access denied).",
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

// ─── Timeouts & offline circuit breaker ──────────────────────────────────────

/**
 * Max wait for any single request. Without this a dead connection hangs on the
 * OS-level TCP timeout (30 s+ on Android), which is what made offline cold
 * start feel frozen. Long enough for a slow-but-real 3G handshake.
 */
const REQUEST_TIMEOUT_MS = 4000;

/**
 * Once a request fails for want of a network, every later call would rediscover
 * the same timeout one at a time. Latch that state so subsequent calls fail
 * instantly, and clear it when the browser reports connectivity is back.
 */
let offlineUntilOnline = false;

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    offlineUntilOnline = false;
  });
}

/** True when the failure means "no usable connection", not "server said no". */
function isNetworkFailure(err: unknown): boolean {
  return (
    err instanceof TypeError || // fetch's own "Failed to fetch"
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof QuranApiError && err.status === 0)
  );
}

/** Marks the client offline so later calls short-circuit instead of hanging. */
function markOffline(): void {
  offlineUntilOnline = true;
}

/** Cheap pre-flight: skip the request entirely when we know it cannot succeed. */
function assertMaybeOnline(): void {
  // navigator.onLine is only trustworthy in the negative: false definitely
  // means no connection, while true merely means an interface exists (WiFi
  // with no internet, captive portal, dead mobile data all report true).
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new QuranApiOffline();
  }
  if (offlineUntilOnline) throw new QuranApiOffline();
}

/** fetch() that gives up after `ms` instead of hanging on a dead socket. */
async function timedFetch(
  url: string,
  init: RequestInit = {},
  ms = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(forceRefresh = false): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  if (!forceRefresh && tokenState && tokenState.expiresAt - 60 > nowSec) {
    return tokenState.accessToken;
  }
  if (tokenInflight) return tokenInflight;

  assertMaybeOnline();

  tokenInflight = (async () => {
    let res: Response;
    try {
      res = await timedFetch(TOKEN_BROKER_URL, { method: "POST" });
    } catch (err) {
      // Timed out or could not reach the broker at all — treat as offline so
      // callers stop retrying and fall back to cached data straight away.
      if (isNetworkFailure(err)) {
        markOffline();
        throw new QuranApiOffline();
      }
      throw err;
    }
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

/**
 * No usable network. Thrown without touching the wire, so callers that have an
 * offline fallback (IDB cache, bundled corpus) reach it immediately.
 */
export class QuranApiOffline extends QuranApiError {
  constructor() {
    super(0, "offline: no usable network connection");
    this.name = "QuranApiOffline";
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

  assertMaybeOnline();

  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt < 3) {
    attempt++;
    try {
      const token = await getAccessToken(attempt > 1);
      const res = await timedFetch(url.toString(), {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          "x-auth-token": token,
          ...(CLIENT_ID_HEADER ? { "x-client-id": CLIENT_ID_HEADER } : {}),
        },
      });

      if (res.status === 401 && attempt === 1) {
        // Token expired/invalid → drop it and retry once with a fresh token.
        tokenState = null;
        continue;
      }
      if (res.status === 403) {
        // Access denied — almost always bad/missing client credentials. This is
        // not recoverable by retrying, so fail fast with a clear message.
        const body = await res.text();
        console.error(
          "[quran-api] 403 Forbidden — check x-client-id / token-broker client credentials.",
          body,
        );
        throw new QuranApiError(403, `access denied: ${body}`);
      }
      if (res.status >= 500 || res.status === 429) {
        // Server error / rate limit → exponential backoff, then retry.
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
      // A timeout or "failed to fetch" means there is no usable connection —
      // retrying just pays the same wait again. Latch offline and give up now.
      if (isNetworkFailure(err)) {
        markOffline();
        throw new QuranApiOffline();
      }
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
  mushafId?: number,
): Promise<PageVerseDTO[]> {
  const data = await apiFetch<VersesByPageResponse>(`/verses/by_page/${page}`, {
    words: "true",
    word_fields: wordFields,
    fields: "text_uthmani,page_number,juz_number",
    per_page: 50,
    mushaf: mushafId,
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
  mushafId?: number,
): Promise<PageVerseDTO[]> {
  const data = await apiFetch<VersesByPageResponse>(`/verses/by_juz/${juz}`, {
    words: "true",
    word_fields: wordFields,
    fields: "text_uthmani,page_number,juz_number",
    per_page: 300,
    mushaf: mushafId,
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

// ─── Pages lookup ─────────────────────────────────────────────────────────────
// GET /pages/lookup — authoritative page boundaries for a given mushaf layout.
//   - Scope with ONE of: chapter_number / juz_number / hizb_number /
//     rub_el_hizb_number / page_number, or a `from`+`to` verse-key range.
//   - `mushaf` selects the layout; boundaries differ between layouts, so it
//     should be the same id used to fetch the verses themselves.
//   - Returns `pages` keyed by page NUMBER AS A STRING, each carrying the
//     first/last verse key on that page.

export interface PageBoundary {
  page: number;
  firstVerseKey: string;
  lastVerseKey: string;
}

export interface PagesLookupResult {
  from: string;
  to: string;
  totalPages: number;
  pages: PageBoundary[];
}

export interface PagesLookupScope {
  chapterNumber?: number;
  juzNumber?: number;
  hizbNumber?: number;
  rubElHizbNumber?: number;
  pageNumber?: number;
  from?: string;
  to?: string;
}

interface ApiPagesLookupResponse {
  total_page?: number;
  lookup_range?: { from?: string; to?: string };
  pages?: Record<
    string,
    {
      first_verse_key?: string;
      last_verse_key?: string;
      from?: string;
      to?: string;
    }
  >;
}

export async function fetchPagesLookup(
  scope: PagesLookupScope,
  mushafId?: number,
): Promise<PagesLookupResult> {
  const data = await apiFetch<ApiPagesLookupResponse>("/pages/lookup", {
    chapter_number: scope.chapterNumber,
    juz_number: scope.juzNumber,
    hizb_number: scope.hizbNumber,
    rub_el_hizb_number: scope.rubElHizbNumber,
    page_number: scope.pageNumber,
    from: scope.from,
    to: scope.to,
    mushaf: mushafId,
  });

  const pages: PageBoundary[] = Object.entries(data.pages ?? {})
    .map(([pageStr, v]) => ({
      page: parseInt(pageStr, 10),
      firstVerseKey: v.first_verse_key ?? v.from ?? "",
      lastVerseKey: v.last_verse_key ?? v.to ?? "",
    }))
    .filter((p) => Number.isFinite(p.page))
    .sort((a, b) => a.page - b.page);

  return {
    from: data.lookup_range?.from ?? "",
    to: data.lookup_range?.to ?? "",
    totalPages: data.total_page ?? pages.length,
    pages,
  };
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

// ─── Audio timestamps ──────────────────────────────────────────────────────────
// GET /audio/reciters/{reciter_id}/timestamp
//   - reciter_id is a CHAPTER-reciter id (from /resources/chapter_reciters), NOT an
//     ayah-by-ayah recitation id. For the reciters this app ships, the two id spaces
//     happen to share the same numbers (AbdulBaset Murattal = 2, Minshawi = 9, Sudais
//     = 3, Husary = 6, Afasy = 7), so the stored numeric reciter id is passed straight
//     through. See AUDIO_RECITER_ID_MAP in audio-duration.service if that ever diverges.
//   - Scope with `chapter_number` (whole surah in ONE call) OR `verse_key` (one verse).
//   - Returns timestamps in MILLISECONDS on the reciter's full-surah timeline; a verse's
//     duration is `timestamp_to - timestamp_from`.
// Auth + 401/403/429/5xx handling is provided by apiFetch (the headers x-auth-token /
// authorization / x-client-id are injected on every request, token refresh on 401,
// exponential backoff on 429/5xx).

export interface AudioTimestampResult {
  timestampFrom: number;
  timestampTo: number;
}

interface AudioTimestampResponse {
  result?: { timestamp_from?: number; timestamp_to?: number };
  timestamp_from?: number;
  timestamp_to?: number;
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
  const data = await apiFetch<AudioTimestampResponse>(
    `/audio/reciters/${encodeURIComponent(String(reciterId))}/timestamp`,
    {
      chapter_number: scope.chapterNumber,
      verse_key: scope.verseKey,
      verse_id: scope.verseId,
      word: scope.word,
      word_from: scope.wordFrom,
      word_to: scope.wordTo,
    },
  );
  const r = data.result ?? data;
  const from = r.timestamp_from ?? 0;
  const to = r.timestamp_to ?? 0;
  return { timestampFrom: from, timestampTo: to };
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

/**
 * Translations for one page. `mushafId` must match the value used by
 * `fetchVersesByPage` — this is the same `/verses/by_page/` endpoint, and the
 * `mushaf` layout decides which verses fall on the page. Passing a different
 * id (or omitting it on one call but not the other) can leave the translation
 * list describing a different set of verses than the page actually renders.
 */
export async function fetchTranslationsByPage(
  page: number,
  translationId: string | number,
  mushafId?: number,
): Promise<PageTranslation[]> {
  const data = await apiFetch<VersesByPageWithTranslationsResponse>(
    `/verses/by_page/${page}`,
    {
      translations: String(translationId),
      fields: "verse_key",
      per_page: 50,
      words: "false",
      mushaf: mushafId,
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
    languageName: r.language_name ?? r.translated_name?.language_name,
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

// The cache key is per-language: the API returns localized reciter names, so caching under a
// single key made the first-fetched language (usually English) stick for every later call,
// leaving the dropdown in English even in Arabic mode.
function recitationsIdbKey(language: string): string {
  return `recitations_v1_${language}`;
}

export async function fetchRecitations(
  language = "en",
): Promise<ApiRecitation[]> {
  const cacheKey = recitationsIdbKey(language);
  // 1. Try IDB cache first (works offline), scoped to THIS language.
  try {
    const cached = await idb.get<{ key: string; value: ApiRecitation[] }>(
      "meta",
      cacheKey,
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
      // Persist to IDB (per-language) for offline use
      idb.put("meta", { key: cacheKey, value: list }).catch(() => {});
    }
    return list;
  } catch (err) {
    // 3. Network failed, check IDB one more time (may have been populated by another tab)
    try {
      const cached = await idb.get<{ key: string; value: ApiRecitation[] }>(
        "meta",
        cacheKey,
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

export async function fetchHizbs(): Promise<ApiHizb[]> {
  // QF v4 has returned this list under different keys across versions
  // ("hizbs" / "chapters_hizbs" / etc.); accept whichever array is present.
  const data = await apiFetch<Record<string, unknown>>("/hizbs", {});
  const arr =
    (data.hizbs as ApiHizb[]) ??
    (data.chapters_hizbs as ApiHizb[]) ??
    (Object.values(data).find((v) => Array.isArray(v)) as ApiHizb[]) ??
    [];
  return arr;
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

/** Optional query parameters accepted by the rub' el-hizb endpoints. */
export interface RubElHizbParams {
  /** ISO language code for localized fields, e.g. "en", "ar". */
  language?: string;
  [key: string]: string | number | undefined;
}

/**
 * GET /rub_el_hizbs — list all rub' el-hizb.
 * Auth headers (x-auth-token, x-client-id) and 401/403/429 handling are applied
 * by the shared apiFetch. Accepts optional query parameters (e.g. language).
 */
export async function fetchRubElHizbs(
  params: RubElHizbParams = {},
): Promise<ApiRub[]> {
  // The QF v4 payload key for this list is "rub_el_hizbs" (not "rubs"); accept
  // any of the known key names, falling back to the first array in the object.
  const data = await apiFetch<Record<string, unknown>>("/rub_el_hizbs", params);
  const arr =
    (data.rub_el_hizbs as ApiRub[]) ??
    (data.rubs as ApiRub[]) ??
    (Object.values(data).find((v) => Array.isArray(v)) as ApiRub[]) ??
    [];
  return arr;
}

/**
 * GET /rub_el_hizbs/{id} — one rub' el-hizb by number (1..240).
 * Returns null on 404. Auth headers and 401/403/429 handling come from apiFetch.
 * Accepts optional query parameters (e.g. language).
 */
export async function fetchRubElHizb(
  rubNumber: number,
  params: RubElHizbParams = {},
): Promise<ApiRub | null> {
  try {
    const data = await apiFetch<Record<string, unknown>>(
      `/rub_el_hizbs/${rubNumber}`,
      params,
    );
    // Accept either the wrapped ("rub_el_hizb"/"rub") shape or a bare object.
    return (
      (data.rub_el_hizb as ApiRub) ??
      (data.rub as ApiRub) ??
      ((data as any).rub_number !== undefined ? (data as unknown as ApiRub) : null)
    );
  } catch (err) {
    if (err instanceof QuranApiNotFound) return null;
    throw err;
  }
}
