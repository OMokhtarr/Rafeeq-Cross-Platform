/**
 * Quran Foundation User API client.
 *
 * Handles both authenticated (OAuth2 user) and unauthenticated requests.
 * When a user is signed in, their access token is sent as x-auth-token.
 * Falls back to the machine‑to‑machine token broker only for unauthenticated calls.
 *
 * User profile is decoded from the stored ID token (no CORS-affected API call).
 * Bookmarks remain local‑only.
 */

import {
  getStoredAccessToken,
  refreshAccessToken,
  getStoredRefreshToken,
  getUserProfileFromIdTokenAsync,
} from "../auth/oauth.service";

// ✅ Correct User API base (per official docs)
const USER_API_BASE =
  process.env.REACT_APP_USER_API_BASE ??
  "https://apis.quran.foundation/auth/v1";

const TOKEN_BROKER_URL = process.env.REACT_APP_TOKEN_BROKER_URL ?? "";
const CLIENT_ID_HEADER = process.env.REACT_APP_QF_CLIENT_ID ?? "";

// ─── Token cache (machine broker) ────────────────────────────────────────────

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

let tokenState: TokenState | null = null;
let tokenInflight: Promise<string> | null = null;

async function getAccessToken(forceRefresh = false): Promise<string> {
  // 1. Try user token
  const userToken = await getStoredAccessToken();
  if (userToken && !forceRefresh) {
    return userToken;
  }

  // 2. Silent refresh of user token
  const refreshToken = await getStoredRefreshToken();
  if (refreshToken) {
    try {
      const newToken = await refreshAccessToken();
      return newToken;
    } catch {
      // refresh failed, fall through
    }
  }

  // 3. Fallback to machine‑to‑machine broker token
  const nowSec = Math.floor(Date.now() / 1000);
  if (!forceRefresh && tokenState && tokenState.expiresAt - 60 > nowSec) {
    return tokenState.accessToken;
  }
  if (tokenInflight) return tokenInflight;

  tokenInflight = (async () => {
    const res = await fetch(TOKEN_BROKER_URL, { method: "POST" });
    if (!res.ok)
      throw new UserApiError(
        res.status,
        `token broker failed: ${await res.text()}`,
      );
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
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
        "x-auth-token": token,
        ...(CLIENT_ID_HEADER ? { "x-client-id": CLIENT_ID_HEADER } : {}),
        ...((options.headers as Record<string, string>) ?? {}),
      };

      const res = await fetch(url, {
        ...options,
        headers,
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

// ─── Activity Day ─────────────────────────────────────────────────────────────

interface ActivityDayPayload {
  type: "QURAN";
  seconds: number;
  ranges: string[];
  mushafId: string;
  date?: string;
}

/**
 * Records a reading activity day, which increments the QF streak counter.
 * Silently ignored if the user is not logged in.
 * `ranges` format: "sura:aya-sura:aya" e.g. "2:1-2:7"
 */
export async function recordActivityDay(
  ranges: string[],
  seconds: number,
  mushafId: string,
): Promise<void> {
  const token = await getStoredAccessToken();
  if (!token) return; // not logged in — skip silently

  const payload: ActivityDayPayload = {
    type: "QURAN",
    seconds,
    ranges,
    mushafId,
  };

  await userApiFetch<unknown>("/activity-days", {
    method: "POST",
    body: JSON.stringify(payload),
  }).catch((err) => {
    console.warn("[activity] failed to record activity day:", err);
  });
}

// ─── User Profile (from ID token, no network call) ────────────────────────────

export interface UserProfile {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export async function fetchUserProfile(): Promise<UserProfile | null> {
  // ✅ Decode from locally stored ID token – no CORS, no network
  const profile = await getUserProfileFromIdTokenAsync();
  if (!profile) return null;
  return {
    id: profile.sub,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: profile.email,
  };
}

// ─── Bookmarks — local-only (unchanged) ───────────────────────────────────────

const BM_STORAGE_KEY = "rafiq_bookmarks_v1";

interface LocalBookmarkMap {
  [verseKey: string]: string;
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

export function getLocalBookmarkedVerseKeys(): string[] {
  const map = loadLocalBookmarks();
  return Object.entries(map)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([key]) => key);
}

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

export function removeLocalBookmark(verseKey: string): void {
  const map = loadLocalBookmarks();
  delete map[verseKey];
  saveLocalBookmarks(map);
}
