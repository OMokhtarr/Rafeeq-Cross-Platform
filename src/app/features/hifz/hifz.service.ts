import { Capacitor } from "@capacitor/core";
import { idb } from "../../core/services/storage/idb.service";

const STORAGE_KEY = "rafiq_hifz_v2";
const BEST_PLAN_KEY = "rafiq_hifz_best_v1";
const HIFZ_READING_KEY = "rafiq_hifz_reading_v1";

// Hifz data store name in IndexedDB (created on demand)
const HIFZ_STORE = "hifz";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemorizedUnit =
  | { type: "juz"; juz: number }
  | { type: "surah"; surah: number }
  | { type: "pages"; from: number; to: number };

export type SessionUnit = "pages" | "rub" | "hizb" | "juz";

// How many Quran pages each unit represents (approximate standard mushaf)
const UNIT_TO_PAGES: Record<SessionUnit, number> = {
  pages: 1,
  rub: 2,   // 1 rub' = ~2 pages
  hizb: 4,  // 1 hizb = 2 rub' = ~4 pages
  juz: 20,  // 1 juz = ~20 pages (604 / 30 ≈ 20)
};

export function unitToPageCount(quantity: number, unit: SessionUnit): number {
  return Math.max(1, Math.round(quantity * UNIT_TO_PAGES[unit]));
}

export interface HifzGoal {
  quantity: number;
  unit: SessionUnit;
  /** @deprecated kept for backward-compat with saved plans — derived on load */
  pagesPerSession?: number;
}

export interface PageRange {
  from: number;
  to: number;
}

export interface PlanSession {
  id: string;
  label: string;
  fromPage: number;
  toPage: number;
  /** Actual memorized page segments that make up this session (may be non-contiguous). */
  ranges?: PageRange[];
  /** Original units selected for this session (to display only what user picked, not extra surahs). */
  selectedUnits?: MemorizedUnit[];
  done: boolean;
  doneDate?: string;
}

export interface HifzPlan {
  memorized: MemorizedUnit[];
  goal: HifzGoal;
  sessions: PlanSession[];
  createdAt: string;
}

export interface BestPlanRecord {
  completedAt: string;
  daysToFinish: number;
  totalPages: number;
  totalSessions: number;
}

// ─── Persistence ──────────────────────────────────────────────────────────────
// Platform-aware storage:
// - Android: Capacitor Filesystem (quran-audio/ directory, same pattern as audio cache)
// - Web/iOS: IndexedDB (hifz store)
// - Fallback: localStorage for backward compat and synchronous reads

const HIFZ_DIR = "hifz-data";

async function ensureHifzDir(): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== "android") return;
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    await Filesystem.mkdir({
      path: HIFZ_DIR,
      directory: Directory.Data,
      recursive: true,
    });
  } catch {
    // Already exists
  }
}

async function readHifzFile(fileName: string): Promise<string | null> {
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { data } = await Filesystem.readFile({
      path: `${HIFZ_DIR}/${fileName}`,
      directory: Directory.Data,
    });
    // Data comes back as base64 string; decode it
    if (typeof data === "string") {
      return atob(data);
    }
    return new TextDecoder().decode(data as any);
  } catch {
    return null;
  }
}

async function writeHifzFile(fileName: string, content: string): Promise<void> {
  try {
    await ensureHifzDir();
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    // Encode JSON as base64 (same pattern as audio cache)
    const base64 = btoa(content);
    await Filesystem.writeFile({
      path: `${HIFZ_DIR}/${fileName}`,
      directory: Directory.Data,
      data: base64,
    });
  } catch (error) {
    console.error(`Failed to write hifz file ${fileName}:`, error);
  }
}

// Synchronous fallback (localStorage only, for backward compat and sync reads)
export function loadPlan(): HifzPlan | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as HifzPlan;
  } catch {
    return null;
  }
}

// Async load from proper storage (filesystem on Android, IndexedDB on web/iOS)
// Falls back to old localStorage key if data isn't found, then migrates it
export async function loadPlanAsync(): Promise<HifzPlan | null> {
  try {
    let plan: HifzPlan | null = null;

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const json = await readHifzFile("plan.json");
      plan = json ? (JSON.parse(json) as HifzPlan) : null;
    } else {
      // Web/iOS: IndexedDB
      const rec = await idb.get<{ data: string }>(HIFZ_STORE, "plan");
      plan = rec ? (JSON.parse(rec.data) as HifzPlan) : null;
    }

    // Fallback: check old localStorage key if nothing found
    if (!plan) {
      const oldJson = localStorage.getItem(STORAGE_KEY);
      if (oldJson) {
        plan = JSON.parse(oldJson) as HifzPlan;
        // Migrate to new storage immediately (fire and forget)
        if (plan) savePlanAsync(plan).catch(() => {});
      }
    }

    return plan;
  } catch {
    return null;
  }
}

// Sync save (localStorage, for quick UI updates)
export function savePlan(plan: HifzPlan): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
  } catch {}
}

// Async save (filesystem on Android, IndexedDB on web/iOS)
export async function savePlanAsync(plan: HifzPlan): Promise<void> {
  try {
    const json = JSON.stringify(plan);
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      await writeHifzFile("plan.json", json);
    } else {
      // Web/iOS: IndexedDB
      await idb.put(HIFZ_STORE, { id: "plan", data: json });
    }
  } catch {}
}

export function clearPlan(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export async function clearPlanAsync(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      await Filesystem.deleteFile({
        path: `${HIFZ_DIR}/plan.json`,
        directory: Directory.Data,
      });
    } else {
      await idb.delete(HIFZ_STORE, "plan");
    }
  } catch {}
}

// Best plan functions
export function loadBestPlan(): BestPlanRecord | null {
  try {
    const raw = localStorage.getItem(BEST_PLAN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BestPlanRecord;
  } catch {
    return null;
  }
}

export async function loadBestPlanAsync(): Promise<BestPlanRecord | null> {
  try {
    let record: BestPlanRecord | null = null;

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const json = await readHifzFile("best-plan.json");
      record = json ? (JSON.parse(json) as BestPlanRecord) : null;
    } else {
      const rec = await idb.get<{ data: string }>(HIFZ_STORE, "best-plan");
      record = rec ? (JSON.parse(rec.data) as BestPlanRecord) : null;
    }

    // Fallback: check old localStorage key if nothing found
    if (!record) {
      const oldJson = localStorage.getItem(BEST_PLAN_KEY);
      if (oldJson) {
        record = JSON.parse(oldJson) as BestPlanRecord;
        if (record) saveBestPlanAsync(record).catch(() => {});
      }
    }

    return record;
  } catch {
    return null;
  }
}

export function saveBestPlan(record: BestPlanRecord): void {
  try {
    localStorage.setItem(BEST_PLAN_KEY, JSON.stringify(record));
  } catch {}
}

export async function saveBestPlanAsync(record: BestPlanRecord): Promise<void> {
  try {
    const json = JSON.stringify(record);
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      await writeHifzFile("best-plan.json", json);
    } else {
      await idb.put(HIFZ_STORE, { id: "best-plan", data: json });
    }
  } catch {}
}

// ─── Hifz Reading Session ─────────────────────────────────────────────────────
// Tracks which pages the user has actively read (≥30 s each) when navigating
// from a Hifz session open button. Written by the viewer; read back by Hifz.

export interface HifzReadingSession {
  /** Flat list of all page ranges covered by the open session(s). */
  ranges: PageRange[];
  /** Pages the user has spent ≥30 s on (within ranges or contiguous next sessions). */
  readPages: number[];
  /** Session IDs whose pages are included in ranges (for progress updates). */
  sessionIds: string[];
}

export function saveHifzReadingSession(s: HifzReadingSession): void {
  try {
    localStorage.setItem(HIFZ_READING_KEY, JSON.stringify(s));
  } catch {}
}

export async function saveHifzReadingSessionAsync(s: HifzReadingSession): Promise<void> {
  try {
    const json = JSON.stringify(s);
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      await writeHifzFile("reading-session.json", json);
    } else {
      await idb.put(HIFZ_STORE, { id: "reading-session", data: json });
    }
  } catch {}
}

export function loadHifzReadingSession(): HifzReadingSession | null {
  try {
    const raw = localStorage.getItem(HIFZ_READING_KEY);
    return raw ? (JSON.parse(raw) as HifzReadingSession) : null;
  } catch {
    return null;
  }
}

export async function loadHifzReadingSessionAsync(): Promise<HifzReadingSession | null> {
  try {
    let session: HifzReadingSession | null = null;

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const json = await readHifzFile("reading-session.json");
      session = json ? (JSON.parse(json) as HifzReadingSession) : null;
    } else {
      const rec = await idb.get<{ data: string }>(HIFZ_STORE, "reading-session");
      session = rec ? (JSON.parse(rec.data) as HifzReadingSession) : null;
    }

    // Fallback: check old localStorage key if nothing found
    if (!session) {
      const oldJson = localStorage.getItem(HIFZ_READING_KEY);
      if (oldJson) {
        session = JSON.parse(oldJson) as HifzReadingSession;
        if (session) saveHifzReadingSessionAsync(session).catch(() => {});
      }
    }

    return session;
  } catch {
    return null;
  }
}

export function clearHifzReadingSession(): void {
  try {
    localStorage.removeItem(HIFZ_READING_KEY);
  } catch {}
}

export async function clearHifzReadingSessionAsync(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      await Filesystem.deleteFile({
        path: `${HIFZ_DIR}/reading-session.json`,
        directory: Directory.Data,
      });
    } else {
      await idb.delete(HIFZ_STORE, "reading-session");
    }
  } catch {}
}

/** All page ranges covered by every session in the plan. */
function planSessionRanges(plan: HifzPlan): PageRange[] {
  const ranges: PageRange[] = [];
  for (const s of plan.sessions) {
    const rs = s.ranges ?? [{ from: s.fromPage, to: s.toPage }];
    for (const r of rs) ranges.push(r);
  }
  return ranges;
}

/** True when `page` falls inside any session of the plan. */
export function pageInPlan(plan: HifzPlan, page: number): boolean {
  return planSessionRanges(plan).some((r) => page >= r.from && page <= r.to);
}

/**
 * Fast check of the saved cache: has `page` already been recorded as read?
 * Lets the viewer skip the 30 s dwell timer entirely for pages already marked.
 */
export function isPageMarkedRead(page: number): boolean {
  const existing = loadHifzReadingSession();
  return existing ? existing.readPages.includes(page) : false;
}

/**
 * Record that the user has read `page`. Checks the saved plan to confirm the
 * page belongs to a session, then appends it to the reading session's readPages
 * (creating/normalising that store against the full plan). Works regardless of
 * how the viewer was opened. Returns the updated readPages, or null if the page
 * isn't part of any session.
 */
export function markPageRead(page: number): number[] | null {
  const plan = loadPlan();
  if (!plan || !pageInPlan(plan, page)) return null;

  const existing = loadHifzReadingSession();
  const readPages = existing?.readPages ?? [];
  if (readPages.includes(page)) return readPages;

  const updated: HifzReadingSession = {
    ranges: planSessionRanges(plan),
    readPages: [...readPages, page],
    sessionIds: plan.sessions.map((s) => s.id),
  };
  saveHifzReadingSession(updated);
  saveHifzReadingSessionAsync(updated).catch(() => {});
  return updated.readPages;
}

/** Compute read-page progress (0–100) for a single session. */
export function sessionReadProgress(
  session: PlanSession,
  readPages: number[],
): number {
  if (session.done) return 100;
  const readSet = new Set(readPages);
  const total = session.toPage - session.fromPage + 1;
  if (total <= 0) return 0;
  let count = 0;
  for (let p = session.fromPage; p <= session.toPage; p++) {
    if (readSet.has(p)) count++;
  }
  return Math.round((count / total) * 100);
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
  const contiguousRanges = flattenMemorized(memorized, chaptersCache);
  if (contiguousRanges.length === 0) return [];

  const pagesPerSession = unitToPageCount(goal.quantity ?? goal.pagesPerSession ?? 5, goal.unit ?? "pages");

  const sessions: PlanSession[] = [];
  let sessionIndex = 0;

  const pushSession = (segs: PageRange[]) => {
    sessions.push({
      id: `session-${sessionIndex}`,
      label: `${sessionIndex + 1}`,
      fromPage: segs[0].from,
      toPage: segs[segs.length - 1].to,
      ranges: segs.length === 1 ? undefined : segs,
      selectedUnits: memorized,
      done: false,
    });
    sessionIndex++;
  };

  for (const range of contiguousRanges) {
    // Each contiguous memorized block is sliced into sessions independently —
    // sessions never cross the gap between two non-contiguous blocks.
    let pos = range.from;
    while (pos <= range.to) {
      const end = Math.min(pos + pagesPerSession - 1, range.to);
      pushSession([{ from: pos, to: end }]);
      pos = end + 1;
    }
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
  // If nothing done today, start checking from yesterday so a past streak
  // doesn't show as 0 just because today hasn't been reviewed yet.
  const todayIso = d.toISOString().slice(0, 10);
  if (!doneDates.has(todayIso)) {
    d.setDate(d.getDate() - 1);
  }
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

export function countSessionsToday(sessions: PlanSession[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return sessions.filter((s) => s.done && s.doneDate === today).length;
}

export function computeMaxSessionsPerDay(sessions: PlanSession[]): number {
  const counts = new Map<string, number>();
  for (const s of sessions) {
    if (s.done && s.doneDate) {
      counts.set(s.doneDate, (counts.get(s.doneDate) ?? 0) + 1);
    }
  }
  let max = 0;
  counts.forEach((v) => { if (v > max) max = v; });
  return max;
}

export function countActiveDays(plan: HifzPlan): number {
  const start = new Date(plan.createdAt);
  const now = new Date();
  const ms = now.getTime() - start.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function getSurahsForPageRange(
  fromPage: number,
  toPage: number,
  chaptersCache: any[],
): Array<{ id: number; nameAr: string; nameEn: string; from: number; to: number }> {
  const result: Array<{ id: number; nameAr: string; nameEn: string; from: number; to: number }> = [];
  for (const ch of chaptersCache) {
    const sf: number = ch.pages?.[0] ?? 0;
    const se: number = ch.pages?.[1] ?? 0;
    if (sf > toPage || se < fromPage) continue;
    result.push({
      id: ch.id,
      nameAr: ch.name_arabic ?? `سورة ${ch.id}`,
      nameEn: ch.name_simple ?? ch.translated_name?.name ?? `Surah ${ch.id}`,
      from: Math.max(sf, fromPage),
      to: Math.min(se, toPage),
    });
  }
  result.sort((a, b) => a.from - b.from);
  return result;
}

export type SurahSegment = {
  id: number;
  nameAr: string;
  nameEn: string;
  from: number;
  to: number;
  rangeFrom: number;
};

export function getSurahsForRanges(
  ranges: PageRange[],
  chaptersCache: any[],
): SurahSegment[] {
  const result: SurahSegment[] = [];
  for (const r of ranges) {
    for (const ch of chaptersCache) {
      const sf: number = ch.pages?.[0] ?? 0;
      const se: number = ch.pages?.[1] ?? 0;
      if (sf > r.to || se < r.from) continue;
      result.push({
        id: ch.id,
        nameAr: ch.name_arabic ?? `سورة ${ch.id}`,
        nameEn: ch.name_simple ?? ch.translated_name?.name ?? `Surah ${ch.id}`,
        from: Math.max(sf, r.from),
        to: Math.min(se, r.to),
        rangeFrom: r.from,
      });
    }
  }
  result.sort((a, b) => a.from - b.from);
  return result;
}

export function getSurahsForUnits(
  memorized: MemorizedUnit[],
  chaptersCache: any[],
): SurahSegment[] {
  const result: SurahSegment[] = [];
  for (const unit of memorized) {
    if (unit.type === "juz") {
      // Show all surahs that are fully or partially in this juz
      const { from, to } = juzToPages(unit.juz);
      for (const ch of chaptersCache) {
        const sf: number = ch.pages?.[0] ?? 0;
        const se: number = ch.pages?.[1] ?? 0;
        if (sf > to || se < from) continue;
        result.push({
          id: ch.id,
          nameAr: ch.name_arabic ?? `سورة ${ch.id}`,
          nameEn: ch.name_simple ?? ch.translated_name?.name ?? `Surah ${ch.id}`,
          from: Math.max(sf, from),
          to: Math.min(se, to),
          rangeFrom: from,
        });
      }
    } else if (unit.type === "surah") {
      // Show only this surah
      const ch = chaptersCache.find((c: any) => c.id === unit.surah);
      if (ch) {
        const sf: number = ch.pages?.[0] ?? 0;
        const se: number = ch.pages?.[1] ?? 0;
        result.push({
          id: ch.id,
          nameAr: ch.name_arabic ?? `سورة ${ch.id}`,
          nameEn: ch.name_simple ?? ch.translated_name?.name ?? `Surah ${ch.id}`,
          from: sf,
          to: se,
          rangeFrom: sf,
        });
      }
    } else if (unit.type === "pages") {
      // For page ranges, show surahs that intersect
      for (const ch of chaptersCache) {
        const sf: number = ch.pages?.[0] ?? 0;
        const se: number = ch.pages?.[1] ?? 0;
        if (sf > unit.to || se < unit.from) continue;
        result.push({
          id: ch.id,
          nameAr: ch.name_arabic ?? `سورة ${ch.id}`,
          nameEn: ch.name_simple ?? ch.translated_name?.name ?? `Surah ${ch.id}`,
          from: Math.max(sf, unit.from),
          to: Math.min(se, unit.to),
          rangeFrom: unit.from,
        });
      }
    }
  }
  // Deduplicate and sort
  const seen = new Set<number>();
  const filtered = result.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return true;
  });
  filtered.sort((a, b) => a.from - b.from);
  return filtered;
}
