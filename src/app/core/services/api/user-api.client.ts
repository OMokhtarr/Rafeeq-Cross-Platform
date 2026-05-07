/**
 * Quran Foundation User API client.
 *
 * Bookmarks are stored locally in localStorage only — the QF User API
 * requires user-level OAuth (separate from the content token broker) which
 * is not yet wired up. All bookmark operations are instant and offline-first.
 *
 * Streaks come from the User API (GET /v1/streaks) and require a valid
 * user session; unauthenticated requests return 403 which the caller handles.
 */

const USER_API_BASE =
  process.env.REACT_APP_USER_API_BASE ??
  "https://apis.quran.foundation/api/qf/v1";

const TOKEN_BROKER_URL = process.env.REACT_APP_TOKEN_BROKER_URL ?? "";
const CLIENT_ID_HEADER = process.env.REACT_APP_QF_CLIENT_ID ?? "";

// ─── Token cache ──────────────────────────────────────────────────────────────

interface TokenState {
  accessToken: string;
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
    if (!res.ok) throw new UserApiError(res.status, `token broker failed: ${await res.text()}`);
    const tok = (await res.json()) as { access_token: string; expires_in: number };
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

// ─── Error types ──────────────────────────────────────────────────────────────

export class UserApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "UserApiError";
  }
}

// ─── Generic fetch helper ─────────────────────────────────────────────────────

async function userApiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = USER_API_BASE + path;

  let attempt = 0;
  let lastErr: unknown = null;

  while (attempt < 3) {
    attempt++;
    try {
      const token = await getAccessToken(attempt > 1);
      const res = await fetch(url, {
        ...options,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-auth-token": token,
          ...(CLIENT_ID_HEADER ? { "x-client-id": CLIENT_ID_HEADER } : {}),
          ...((options.headers as Record<string, string>) ?? {}),
        },
      });

      if (res.status === 401 && attempt === 1) {
        tokenState = null;
        continue;
      }
      if (res.status === 204) return {} as T;
      if (res.status >= 500 || res.status === 429) {
        await new Promise((r) => setTimeout(r, 250 * attempt * attempt));
        continue;
      }
      if (!res.ok) throw new UserApiError(res.status, await res.text());
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (err instanceof UserApiError && err.status < 500) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt * attempt));
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new UserApiError(0, "network failure");
}

// ─── Streak types & API ───────────────────────────────────────────────────────

export interface Streak {
  id: string;
  startDate: string;
  endDate: string;
  type: string;
  status: "ACTIVE" | "BROKEN" | string;
  days: number;
}

interface StreaksResponse {
  success: boolean;
  data: Streak[];
  pagination?: {
    startCursor: string;
    endCursor: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export async function fetchStreaks(first = 10): Promise<Streak[]> {
  const data = await userApiFetch<StreaksResponse>(`/streaks?first=${first}`);
  return data.data ?? [];
}

// ─── Bookmarks — local-only (localStorage) ────────────────────────────────────
//
// The QF User API requires user-level OAuth that is not yet implemented.
// All bookmark data lives in localStorage under BM_STORAGE_KEY.
// The stored value is a Record<verseKey, addedAt> where addedAt is an ISO
// timestamp (used to preserve insertion order for display).

const BM_STORAGE_KEY = "rafiq_bookmarks_v1";

interface LocalBookmarkMap {
  [verseKey: string]: string; // value = ISO timestamp of when it was added
}

function loadLocalBookmarks(): LocalBookmarkMap {
  try {
    return JSON.parse(localStorage.getItem(BM_STORAGE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveLocalBookmarks(map: LocalBookmarkMap): void {
  try {
    localStorage.setItem(BM_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function isPageBookmarked(verseKey: string): boolean {
  return verseKey in loadLocalBookmarks();
}

/**
 * Return all bookmarked verse keys, newest first.
 */
export function getLocalBookmarkedVerseKeys(): string[] {
  const map = loadLocalBookmarks();
  return Object.entries(map)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([key]) => key);
}

/**
 * Toggle a bookmark. Adds if absent, removes if present.
 * Returns true if now bookmarked, false if removed.
 */
export function toggleBookmark(verseKey: string): boolean {
  const map = loadLocalBookmarks();
  if (verseKey in map) {
    delete map[verseKey];
    saveLocalBookmarks(map);
    return false;
  }
  map[verseKey] = new Date().toISOString();
  saveLocalBookmarks(map);
  return true;
}

/** Remove a bookmark by verse key. */
export function removeLocalBookmark(verseKey: string): void {
  const map = loadLocalBookmarks();
  delete map[verseKey];
  saveLocalBookmarks(map);
}
