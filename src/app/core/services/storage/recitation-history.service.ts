/**
 * Recitation session history – localStorage, unlimited sessions.
 *
 * Stores the full playback queue so a session can be resumed exactly
 * where it was left off.
 */

const STORAGE_KEY = "rafiq_recitation_history_v1";

export interface VerseKey {
  sura: number;
  aya: number;
}

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
  /** The full queue that was active – used to resume playback. */
  queue?: VerseKey[];
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

/** Push a new session to the front. */
export function recordRecitationSession(
  verseKey: string,
  elapsedSeconds: number,
  reciter: string,
  queue?: VerseKey[],
): void {
  if (!verseKey) return;

  const session: RecitationSession = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    verseKey,
    elapsedSeconds: Math.round(elapsedSeconds),
    reciter,
    recordedAt: new Date().toISOString(),
    queue: queue ? queue.slice() : undefined,
  };

  const existing = loadSessions();

  // If a queue is provided, look for an existing session with the same queue
  if (queue && queue.length > 0) {
    const queueStr = JSON.stringify(
      queue.map((v) => `${v.sura}:${v.aya}`).sort(),
    );
    const matchIdx = existing.findIndex((s) => {
      if (!s.queue || s.queue.length !== queue.length) return false;
      const sQueueStr = JSON.stringify(
        s.queue.map((v) => `${v.sura}:${v.aya}`).sort(),
      );
      return sQueueStr === queueStr;
    });

    if (matchIdx !== -1) {
      // Update the matched session: keep its ID but update other fields
      const updated = {
        ...existing[matchIdx],
        verseKey,
        elapsedSeconds: Math.round(elapsedSeconds),
        reciter,
        recordedAt: new Date().toISOString(),
        queue: queue.slice(), // update the queue copy (might be same)
      };
      // Remove the old one, put updated at front
      const filtered = existing.filter((_, i) => i !== matchIdx);
      saveSessions([updated, ...filtered]);
      return;
    }
  }

  // No match found → prepend new session
  saveSessions([session, ...existing]);
}

/** Return all sessions, newest first. */
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
