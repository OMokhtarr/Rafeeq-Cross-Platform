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
