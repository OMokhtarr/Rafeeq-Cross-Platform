const STORAGE_KEY = "rafiq_hifz_v2";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemorizedUnit =
  | { type: "juz"; juz: number }
  | { type: "surah"; surah: number }
  | { type: "pages"; from: number; to: number };

export interface HifzGoal {
  pagesPerSession: number;
}

export interface PlanSession {
  id: string;
  label: string;
  fromPage: number;
  toPage: number;
  done: boolean;
  doneDate?: string;
}

export interface HifzPlan {
  memorized: MemorizedUnit[];
  goal: HifzGoal;
  sessions: PlanSession[];
  createdAt: string;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export function loadPlan(): HifzPlan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HifzPlan;
  } catch {
    return null;
  }
}

export function savePlan(plan: HifzPlan): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {}
}

export function clearPlan(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

// ─── Quran page ranges ────────────────────────────────────────────────────────

// Each juz starts at these pages (1-indexed, 30 juz total)
const JUZ_START_PAGES = [
  1, 22, 42, 62, 82, 102, 122, 142, 162, 182,
  201, 222, 242, 262, 282, 302, 322, 342, 362, 382,
  402, 422, 442, 462, 482, 502, 522, 542, 562, 582,
];

export function juzToPages(juz: number): { from: number; to: number } {
  const idx = juz - 1;
  const from = JUZ_START_PAGES[idx] ?? 1;
  const to = JUZ_START_PAGES[idx + 1] ? JUZ_START_PAGES[idx + 1] - 1 : 604;
  return { from, to };
}

// Surah → page range must come from metadata service at call site; we just keep
// a minimal static fallback here for the rare offline case where metadata is
// unavailable. The planner page uses the live metadata service when possible.
export function surahToPages(
  surahId: number,
  chaptersCache: any[],
): { from: number; to: number } {
  const ch = chaptersCache.find((c: any) => c.id === surahId);
  if (ch?.pages) return { from: ch.pages[0], to: ch.pages[1] };
  // crude fallback: treat as one page
  return { from: 1, to: 1 };
}

// ─── Plan generation ──────────────────────────────────────────────────────────

function flattenMemorized(
  memorized: MemorizedUnit[],
  chaptersCache: any[],
): Array<{ from: number; to: number }> {
  const ranges: Array<{ from: number; to: number }> = [];
  for (const u of memorized) {
    if (u.type === "juz") ranges.push(juzToPages(u.juz));
    else if (u.type === "surah") ranges.push(surahToPages(u.surah, chaptersCache));
    else ranges.push({ from: u.from, to: u.to });
  }
  // merge & sort
  ranges.sort((a, b) => a.from - b.from);
  const merged: Array<{ from: number; to: number }> = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r.from <= last.to + 1) last.to = Math.max(last.to, r.to);
    else merged.push({ ...r });
  }
  return merged;
}


function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function generateSessions(
  memorized: MemorizedUnit[],
  goal: HifzGoal,
  chaptersCache: any[],
): PlanSession[] {
  const ranges = flattenMemorized(memorized, chaptersCache);
  if (ranges.length === 0) return [];

  const pagesPerSession = Math.max(1, goal.pagesPerSession);

  const allPages: number[] = [];
  for (const r of ranges) {
    for (let p = r.from; p <= r.to; p++) allPages.push(p);
  }

  const sessions: PlanSession[] = [];
  let sessionIndex = 0;
  let cursor = 0;

  while (cursor < allPages.length) {
    const chunk = allPages.slice(cursor, cursor + pagesPerSession);
    cursor += pagesPerSession;
    sessions.push({
      id: `session-${sessionIndex}`,
      label: `${sessionIndex + 1}`,
      fromPage: chunk[0],
      toPage: chunk[chunk.length - 1],
      done: false,
    });
    sessionIndex++;
  }

  return sessions;
}

// ─── Dashboard helpers ────────────────────────────────────────────────────────

export function countMemorizedPages(
  memorized: MemorizedUnit[],
  chaptersCache: any[],
): number {
  const ranges = flattenMemorized(memorized, chaptersCache);
  return ranges.reduce((s, r) => s + (r.to - r.from + 1), 0);
}

export function computeStreak(sessions: PlanSession[]): number {
  const doneDates = new Set(
    sessions.filter((s) => s.done && s.doneDate).map((s) => s.doneDate!),
  );
  let streak = 0;
  const d = new Date();
  while (true) {
    const ds = d.toISOString().slice(0, 10);
    if (doneDates.has(ds)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
