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
  NetworkError,
  SessionExpiredError,
} from "../auth/oauth.service";

const USER_API_BASE =
  process.env.REACT_APP_USER_API_BASE ??
  "https://apis.quran.foundation/auth";

const TOKEN_BROKER_URL = process.env.REACT_APP_TOKEN_BROKER_URL ?? "";
const CLIENT_ID_HEADER = process.env.REACT_APP_QF_CLIENT_ID ?? "";

// ─── Token cache ─────────────────────────────────────────────────────────────

interface TokenState {
  accessToken: string;
  expiresAt: number;
}

let tokenState: TokenState | null = null;
let tokenInflight: Promise<string> | null = null;
// Deduplicates concurrent user-token refresh calls — prevents race condition
// where parallel API calls each try to refresh with the same refresh token,
// causing the second call to arrive with an already-rotated (invalid) token.
let userRefreshInflight: Promise<string> | null = null;

async function getAccessToken(forceRefresh = false): Promise<string> {
  // 1. Try user token
  const userToken = await getStoredAccessToken();
  const refreshToken = await getStoredRefreshToken();

  console.log(`[getAccessToken] userToken=${!!userToken} refreshToken=${!!refreshToken} forceRefresh=${forceRefresh}`);

  if (userToken && !forceRefresh) {
    return userToken;
  }

  // 2. Silent refresh of user token — if signed in, never fall back to broker
  if (refreshToken) {
    console.log("[getAccessToken] refreshing user token…");
    if (!userRefreshInflight) {
      userRefreshInflight = refreshAccessToken().finally(() => { userRefreshInflight = null; });
    }
    const newToken = await userRefreshInflight;
    console.log("[getAccessToken] refresh succeeded");
    return newToken;
  }

  // 3. Fallback to machine‑to‑machine broker token (unauthenticated users only)
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

function isNetworkFailure(err: unknown): boolean {
  if (err instanceof NetworkError) return true;
  if (err instanceof TypeError) return true; // fetch() throws TypeError when offline
  if (err instanceof Error && err.message === "network_unavailable") return true;
  return false;
}

async function userApiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = USER_API_BASE + path;

  // Step 1: get a valid token, refreshing if needed
  let token: string;
  try {
    token = await getAccessToken(false);
  } catch (err) {
    if (isNetworkFailure(err)) throw new NetworkError();
    throw err;
  }

  // Step 2: if the stored token is expired the server will 401 — refresh first then retry once
  let refreshed = false;
  const attempt = async (): Promise<T> => {
    let res: Response;
    try {
      res = await fetch(url, {
        ...options,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-auth-token": token,
          ...(CLIENT_ID_HEADER ? { "x-client-id": CLIENT_ID_HEADER } : {}),
          ...((options.headers as Record<string, string>) ?? {}),
        },
      });
    } catch (err) {
      throw new NetworkError();
    }

    if ((res.status === 401 || res.status === 403) && !refreshed) {
      refreshed = true;
      tokenState = null;
      console.log(`[userApiFetch] ${res.status} on ${path} — attempting token refresh`);
      try {
        if (!userRefreshInflight) {
          userRefreshInflight = refreshAccessToken().finally(() => { userRefreshInflight = null; });
        }
        token = await userRefreshInflight;
        console.log("[userApiFetch] token refreshed, retrying");
      } catch (err) {
        console.error("[userApiFetch] token refresh failed:", err);
        if (err instanceof SessionExpiredError) throw err; // propagate as-is
        if (isNetworkFailure(err)) throw new NetworkError();
        throw err;
      }
      return attempt();
    }

    if (res.status === 204) return {} as T;

    if (res.status >= 500 || res.status === 429) {
      throw new UserApiError(res.status, `server error ${res.status}`);
    }

    if (!res.ok) {
      const body = await res.text();
      console.error(`[userApi] ${res.status} ${options.method ?? "GET"} ${path}:`, body);
      throw new UserApiError(res.status, body);
    }

    return (await res.json()) as T;
  };

  return attempt();
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
  const data = await userApiFetch<StreaksResponse>(`/v1/streaks?first=${first}`);
  return data.data ?? [];
}

// ─── Activity Day ─────────────────────────────────────────────────────────────

interface ActivityDayPayload {
  type: "QURAN";
  seconds: number;
  ranges: string[];
  mushafId: number;
  date?: string;
}

export async function recordActivityDay(
  ranges: string[],
  seconds: number,
  mushafId: number,
): Promise<void> {
  const token = await getStoredAccessToken();
  if (!token) return; // not logged in — skip silently

  const payload: ActivityDayPayload = {
    type: "QURAN",
    seconds,
    ranges,
    mushafId,
  };

  await userApiFetch<unknown>("/v1/activity-days", {
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

// ─── Notes API ───────────────────────────────────────────────────────────────

export interface Note {
  id: string;
  body: string;
  ranges: string[];       // e.g. ["2:255-2:257"] or ["2:255"]
  createdAt: string;
  updatedAt: string;
}

interface NotesResponse {
  data: Note[];
  pagination?: {
    startCursor: string;
    endCursor: string;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

interface SingleNoteResponse {
  data: Note;
}

/** Fetch all notes for the signed-in user. */
export async function fetchAllNotes(): Promise<Note[]> {
  const res = await userApiFetch<NotesResponse>(`/v1/notes?limit=50`);
  return res.data ?? [];
}

/** Fetch notes for a specific verse key ("sura:aya"). */
export async function fetchNotesForVerse(verseKey: string): Promise<Note[]> {
  const res = await userApiFetch<NotesResponse>(`/v1/notes/by-verse/${verseKey}`);
  return res.data ?? [];
}

/** Add a new note for a verse. */
export async function addNote(verseKey: string, body: string): Promise<Note> {
  if (body.trim().length < 6) throw new UserApiError(422, "Note must be at least 6 characters");
  // API requires range format "sura:aya-sura:aya"; expand single verse to a range
  const range = verseKey.includes("-") ? verseKey : `${verseKey}-${verseKey}`;
  const res = await userApiFetch<SingleNoteResponse>("/v1/notes", {
    method: "POST",
    body: JSON.stringify({ ranges: [range], body, saveToQR: false }),
  });
  return res.data;
}

/** Update an existing note by ID. */
export async function updateNote(noteId: string, body: string): Promise<Note> {
  const res = await userApiFetch<SingleNoteResponse>(`/v1/notes/${noteId}`, {
    method: "PATCH",
    body: JSON.stringify({ body }),
  });
  return res.data;
}

/** Delete a note by ID. */
export async function deleteNote(noteId: string): Promise<void> {
  await userApiFetch<unknown>(`/v1/notes/${noteId}`, { method: "DELETE" });
}

// ─── Goals API ───────────────────────────────────────────────────────────────

export type GoalType = "QURAN_TIME" | "QURAN_PAGES" | "QURAN_RANGE" | "COURSE" | "QURAN_READING_PROGRAM" | "RAMADAN_CHALLENGE";
export type GoalCategory = "QURAN" | "COURSE" | "QURAN_READING_PROGRAM" | "RAMADAN_CHALLENGE";

// duration is number of days (1=daily, 7=weekly, 30=monthly); omit for open-ended daily goal
export interface Goal {
  id: string;
  type: GoalType;
  amount: number | string;
  duration?: number;
  category: GoalCategory;
  startDate?: string;
  endDate?: string;
}

export interface TodayGoalPlan {
  hasGoal: boolean;
  goalId: string | null;
  id: string | null;
  // flat goal fields (present when hasGoal is true)
  type?: GoalCategory;
  date?: string;
  ranges?: string[];
  mushafId?: number;
  progress?: number;
  pagesRead?: number;
  versesRead?: number;
  secondsRead?: number;
  dailyTargetPages?: number;
  dailyTargetRanges?: string[];
  dailyTargetSeconds?: number | null;
  manuallyAddedSeconds?: number;
}

interface TodayGoalPlanResponse {
  data: TodayGoalPlan;
}

interface GoalResponse {
  data: Goal;
}

export interface GoalTimeline {
  date: string;
  minimumAmount: number;
}

interface GoalTimelineResponse {
  data: GoalTimeline[];
}


export async function fetchTodayGoalPlan(type: GoalType = "QURAN_PAGES", mushafId = 2): Promise<TodayGoalPlan | null> {
  const res = await userApiFetch<TodayGoalPlanResponse>(
    `/v1/goals/get-todays-plan?type=${type}&mushafId=${mushafId}`,
  );
  return res.data ?? null;
}

export async function createGoal(
  type: GoalType,
  amount: number,
  category: GoalCategory = "QURAN",
  duration?: number,
  mushafId = 2,
): Promise<Goal> {
  const body: Record<string, unknown> = { type, amount, category };
  if (duration !== undefined) body.duration = duration;
  const res = await userApiFetch<GoalResponse>(`/v1/goals?mushafId=${mushafId}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function updateGoal(
  goalId: string,
  amount: number,
  duration?: number,
  mushafId = 2,
): Promise<Goal> {
  const body: Record<string, unknown> = { amount };
  if (duration !== undefined) body.duration = duration;
  const res = await userApiFetch<GoalResponse>(`/v1/goals/${goalId}?mushafId=${mushafId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function deleteGoal(goalId: string, category: GoalCategory = "QURAN"): Promise<void> {
  await userApiFetch<unknown>(`/v1/goals/${goalId}?category=${category}`, { method: "DELETE" });
}

export async function fetchGoalTimeline(
  amount: number,
  duration: number,
  type: GoalType = "QURAN_PAGES",
  mushafId = 2,
): Promise<GoalTimeline[]> {
  const params = `type=${type}&amount=${amount}&duration=${duration}&mushafId=${mushafId}`;
  const res = await userApiFetch<GoalTimelineResponse>(
    `/v1/goals/estimate?${params}`,
  );
  return res.data ?? [];
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
