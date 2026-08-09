/**
 * Local notes & bookmarks store.
 *
 * Replaces the former Quran Foundation user API: notes now live only on this
 * device, so they work offline and need no account. Function names and the
 * `Note` shape match the old API client so callers were a straight import swap.
 *
 * Notes are kept in localStorage as a single JSON array, newest first — the
 * data is small (a few KB of text) and every read is a whole-list read, so a
 * keyed store would buy nothing.
 */

const NOTES_STORAGE_KEY = "rafiq_notes_v1";

export interface Note {
  id: string;
  body: string;
  /** Verse ranges, e.g. ["2:255-2:257"] or ["2:255"] — kept as a range list for
   *  compatibility with notes saved before the move to local storage. */
  ranges: string[];
  createdAt: string;
  updatedAt: string;
}

/** Minimum note length, previously enforced by the API. */
export const NOTE_MIN_LENGTH = 6;

export class NoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoteValidationError";
  }
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Note[]) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]): void {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  } catch {}
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {}
  return `note-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A note's range covers `verseKey` when the key matches either endpoint.
 *  Ranges are stored as "sura:aya" or "sura:aya-sura:aya". */
function rangeMatchesVerse(range: string, verseKey: string): boolean {
  if (range === verseKey) return true;
  const [start, end] = range.split("-");
  return start === verseKey || end === verseKey;
}

// ─── Notes API (local) ────────────────────────────────────────────────────────

/** All notes, newest first. */
export async function fetchAllNotes(): Promise<Note[]> {
  return loadNotes();
}

/** Notes attached to a specific verse key ("sura:aya"). */
export async function fetchNotesForVerse(verseKey: string): Promise<Note[]> {
  return loadNotes().filter((n) =>
    n.ranges.some((r) => rangeMatchesVerse(r, verseKey)),
  );
}

/** Add a note for a verse. Newest notes are stored first. */
export async function addNote(verseKey: string, body: string): Promise<Note> {
  const text = body.trim();
  if (text.length < NOTE_MIN_LENGTH) {
    throw new NoteValidationError(
      `Note must be at least ${NOTE_MIN_LENGTH} characters`,
    );
  }
  const now = new Date().toISOString();
  const note: Note = {
    id: newId(),
    body: text,
    ranges: [verseKey],
    createdAt: now,
    updatedAt: now,
  };
  saveNotes([note, ...loadNotes()]);
  return note;
}

/** Update a note's body by ID. */
export async function updateNote(noteId: string, body: string): Promise<Note> {
  const text = body.trim();
  if (text.length < NOTE_MIN_LENGTH) {
    throw new NoteValidationError(
      `Note must be at least ${NOTE_MIN_LENGTH} characters`,
    );
  }
  const notes = loadNotes();
  const idx = notes.findIndex((n) => n.id === noteId);
  if (idx === -1) throw new NoteValidationError("Note not found");

  const updated: Note = {
    ...notes[idx],
    body: text,
    updatedAt: new Date().toISOString(),
  };
  notes[idx] = updated;
  saveNotes(notes);
  return updated;
}

/** Delete a note by ID. */
export async function deleteNote(noteId: string): Promise<void> {
  saveNotes(loadNotes().filter((n) => n.id !== noteId));
}

// ─── Bookmarks — local-only (moved verbatim from the old user API client) ─────

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
