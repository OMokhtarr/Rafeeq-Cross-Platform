/**
 * Quiz session — the one quiz in progress, kept across tab switches.
 *
 * Tab navigation replaces the current page, so a quiz page is unmounted the
 * moment the user taps another tab and its React state is gone. Each quiz
 * page saves its questions and progress here as it goes; the Quiz tab sends
 * the user back to that page while a session exists, and the page restores
 * itself from it. Only an explicit end clears it: quitting through the exit
 * dialog, finishing the quiz, or starting a new quiz from a setup page.
 *
 * Stored in localStorage (survives the app being closed) under two keys: the
 * question list, written once when it changes, and a small meta record with
 * the progress, rewritten on every answer/keystroke.
 */

import { useSyncExternalStore } from "react";

export type QuizKind = "akmel-alayah" | "akmel-alnehayat" | "mutashabihat";

/** Route of each quiz's test page. */
export const QUIZ_ROUTES: Record<QuizKind, string> = {
  "akmel-alayah": "/akmel-alayah",
  "akmel-alnehayat": "/akmel-alnehayat",
  mutashabihat: "/mutashabihat-test",
};

/** Progress every quiz page saves; pages add their own fields on top. */
export interface QuizProgressBase {
  idx: number;
}

interface StoredMeta<P> {
  kind: QuizKind;
  total: number;
  progress: P;
}

export interface QuizSessionSummary {
  kind: QuizKind;
  route: string;
  /** Zero-based index of the current question. */
  idx: number;
  total: number;
}

const META_KEY = "rafeeq_quiz_session_v1";
const QUESTIONS_KEY = "rafeeq_quiz_session_questions_v1";

const listeners = new Set<() => void>();
// The question array last written, so progress saves skip re-serialising it.
let lastQuestions: unknown[] | null = null;
// Cached kind of the active session (undefined = not read from storage yet).
let activeKind: QuizKind | null | undefined;

function isKind(v: unknown): v is QuizKind {
  return typeof v === "string" && v in QUIZ_ROUTES;
}

function readMeta(): StoredMeta<QuizProgressBase> | null {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return null;
    const meta = JSON.parse(raw);
    if (
      !meta ||
      !isKind(meta.kind) ||
      typeof meta.total !== "number" ||
      typeof meta.progress?.idx !== "number" ||
      meta.progress.idx < 0 ||
      meta.progress.idx >= meta.total
    ) {
      return null;
    }
    return meta;
  } catch {
    return null;
  }
}

function setActiveKind(kind: QuizKind | null) {
  if (activeKind === kind) return;
  activeKind = kind;
  listeners.forEach((l) => l());
}

function getActiveKind(): QuizKind | null {
  if (activeKind === undefined) activeKind = readMeta()?.kind ?? null;
  return activeKind;
}

/**
 * Save the quiz in progress. Starts the session on the first call; later
 * calls update it. An empty question list saves nothing.
 */
export function saveQuizSession<Q, P extends QuizProgressBase>(
  kind: QuizKind,
  questions: Q[],
  progress: P,
): void {
  if (questions.length === 0) return;
  try {
    if (questions !== lastQuestions) {
      localStorage.setItem(QUESTIONS_KEY, JSON.stringify(questions));
      lastQuestions = questions;
    }
    const meta: StoredMeta<P> = { kind, total: questions.length, progress };
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    setActiveKind(kind);
  } catch {
    // Storage full or unavailable: the quiz still runs, it just won't resume.
  }
}

/**
 * The saved session for this quiz, or null when there is none, it belongs to
 * another quiz, or what's stored doesn't hold together.
 */
export function loadQuizSession<Q, P extends QuizProgressBase>(
  kind: QuizKind,
): { questions: Q[]; progress: P } | null {
  const meta = readMeta();
  if (!meta || meta.kind !== kind) return null;
  try {
    const raw = localStorage.getItem(QUESTIONS_KEY);
    const questions = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(questions) || questions.length !== meta.total) return null;
    lastQuestions = questions;
    return { questions, progress: meta.progress as P };
  } catch {
    return null;
  }
}

/** End the session in progress (quit, finished, or replaced by a new quiz). */
export function clearQuizSession(): void {
  try {
    localStorage.removeItem(META_KEY);
    localStorage.removeItem(QUESTIONS_KEY);
  } catch {}
  lastQuestions = null;
  setActiveKind(null);
}

/** Where the session in progress is and how far along, or null. */
export function peekQuizSession(): QuizSessionSummary | null {
  const meta = readMeta();
  if (!meta) return null;
  return {
    kind: meta.kind,
    route: QUIZ_ROUTES[meta.kind],
    idx: meta.progress.idx,
    total: meta.total,
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The kind of the quiz in progress (null if none); re-renders on start/end. */
export function useActiveQuizKind(): QuizKind | null {
  return useSyncExternalStore(subscribe, getActiveKind, getActiveKind);
}

/** Test hook: forget the in-memory caches so storage is re-read. */
export function resetQuizSessionCacheForTests(): void {
  lastQuestions = null;
  activeKind = undefined;
}
