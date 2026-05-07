/**
 * Recitation session history — localStorage, last 5 sessions.
 *
 * A session is recorded when playback stops or pauses, capturing:
 *   - which verse was playing (sura:aya)
 *   - how many seconds had elapsed in that verse
 *   - the reciter slug
 *   - the ISO timestamp of the recording
 */

const STORAGE_KEY = "rafiq_recitation_history_v1";
const MAX_SESSIONS = 5;

export interface RecitationSession {
  id: string;
  /** "sura:aya" of the verse that was playing when the session ended. */
  verseKey: string;
  /** Elapsed seconds within that verse at stop/pause time. */
  elapsedSeconds: number;
  /** Reciter slug, e.g. "husary". */
  reciter: string;
  /** ISO timestamp of when this was recorded. */
  recordedAt: string;
}

function loadSessions(): RecitationSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as RecitationSession[];
  } catch {}
  return [];
}

function saveSessions(sessions: RecitationSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {}
}

/** Push a new session to the front, keeping at most MAX_SESSIONS. */
export function recordRecitationSession(
  verseKey: string,
  elapsedSeconds: number,
  reciter: string,
): void {
  if (!verseKey) return;
  const session: RecitationSession = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    verseKey,
    elapsedSeconds: Math.round(elapsedSeconds),
    reciter,
    recordedAt: new Date().toISOString(),
  };
  const existing = loadSessions();
  const updated = [session, ...existing].slice(0, MAX_SESSIONS);
  saveSessions(updated);
}

/** Return up to MAX_SESSIONS recent sessions, newest first. */
export function getRecitationHistory(): RecitationSession[] {
  return loadSessions();
}

/** Remove a single session by id. */
export function deleteRecitationSession(id: string): void {
  const existing = loadSessions();
  saveSessions(existing.filter((s) => s.id !== id));
}

/** Wipe all history. */
export function clearRecitationHistory(): void {
  localStorage.removeItem(STORAGE_KEY);
}
