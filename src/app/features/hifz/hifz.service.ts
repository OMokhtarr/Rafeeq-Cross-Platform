import { Capacitor } from "@capacitor/core";
import { idb } from "../../core/services/storage/idb.service";
import {
  getRubBoundaries,
  getHizbBoundaries,
  getRubStartPages,
  getHizbStartPages,
  type UnitBoundary,
} from "../../core/services/data/metadata.service";
// Streak dates are the user's local calendar day — see local-date.util.
import {
  localDateStr,
  daysAgoStr,
  daysBetween,
} from "../../core/utils/local-date.util";
import {
  settleFreezes,
  earnFreezes,
  wasFrozen,
} from "../../core/services/storage/streak-freeze.service";

const STORAGE_KEY = "rafiq_hifz_v2";
const BEST_PLAN_KEY = "rafiq_hifz_best_v1";
// The most recently completed plan (not necessarily the fastest). Shown next to
// the best-plan duration so the user can compare their latest run to their best.
const LATEST_PLAN_KEY = "rafiq_hifz_latest_v1";
const HIFZ_READING_KEY = "rafiq_hifz_reading_v1";
// Dates (YYYY-MM-DD) on which a session was completed. Accumulates over the
// lifetime of the app and is NEVER cleared by plan reset / new round / delete,
// so the streak survives those actions.
const HIFZ_STREAK_KEY = "rafiq_hifz_streak_dates_v1";
// Missed days the user has "bought back" by completing extra sessions the next
// day. Stored separately from real active-days so recovery is auditable and,
// like the streak store, is never cleared by plan reset / new round / delete.
//
// NOTE: despite the key name this holds *repaired* days, not streak freezes.
// Freezes are the separate consumable in streak-freeze.service.ts. The key is
// kept as-is because renaming it would strand data on existing installs; a day
// covered by a spent freeze is also written here so streak maths needs no
// special case.
const HIFZ_STREAK_FREEZE_KEY = "rafiq_hifz_streak_freeze_v1";
// How many sessions must be completed on a recovery day to bridge one missed day.
export const STREAK_RECOVERY_THRESHOLD = 2;

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
  /**
   * Exact verse the session begins at (for rub'/hizb sessions whose boundary
   * falls mid-page). Navigation opens the viewer precisely here rather than at
   * the page start. Absent for page/juz sessions that begin at a page start.
   */
  startVerse?: { sura: number; aya: number };
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

// Latest plan functions — same shape/storage as best plan, but always overwritten
// with the most recent completion (best plan only updates when faster).
export function loadLatestPlan(): BestPlanRecord | null {
  try {
    const raw = localStorage.getItem(LATEST_PLAN_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BestPlanRecord;
  } catch {
    return null;
  }
}

export async function loadLatestPlanAsync(): Promise<BestPlanRecord | null> {
  try {
    let record: BestPlanRecord | null = null;

    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      const json = await readHifzFile("latest-plan.json");
      record = json ? (JSON.parse(json) as BestPlanRecord) : null;
    } else {
      const rec = await idb.get<{ data: string }>(HIFZ_STORE, "latest-plan");
      record = rec ? (JSON.parse(rec.data) as BestPlanRecord) : null;
    }

    // Fallback: check localStorage key if nothing found in the platform store.
    if (!record) {
      const oldJson = localStorage.getItem(LATEST_PLAN_KEY);
      if (oldJson) {
        record = JSON.parse(oldJson) as BestPlanRecord;
        if (record) saveLatestPlanAsync(record).catch(() => {});
      }
    }

    return record;
  } catch {
    return null;
  }
}

export function saveLatestPlan(record: BestPlanRecord): void {
  try {
    localStorage.setItem(LATEST_PLAN_KEY, JSON.stringify(record));
  } catch {}
}

export async function saveLatestPlanAsync(record: BestPlanRecord): Promise<void> {
  try {
    const json = JSON.stringify(record);
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android") {
      await writeHifzFile("latest-plan.json", json);
    } else {
      await idb.put(HIFZ_STORE, { id: "latest-plan", data: json });
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
 *
 * Uses the async plan loader: on Android (and after a cold start) the plan lives
 * in the native filesystem, NOT localStorage, so the sync loadPlan() would miss it.
 */
export async function markPageRead(page: number): Promise<number[] | null> {
  const plan = (await loadPlanAsync()) ?? loadPlan();
  if (!plan || !pageInPlan(plan, page)) return null;

  const existing = (await loadHifzReadingSessionAsync()) ?? loadHifzReadingSession();
  const readPages = existing?.readPages ?? [];
  if (readPages.includes(page)) return readPages;

  const updated: HifzReadingSession = {
    ranges: planSessionRanges(plan),
    readPages: [...readPages, page],
    sessionIds: plan.sessions.map((s) => s.id),
  };
  saveHifzReadingSession(updated);
  saveHifzReadingSessionAsync(updated).catch(() => {});
  // Notify any mounted Hifz view so its progress bars refresh immediately,
  // independent of Ionic view-lifecycle timing.
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("hifz-read-pages-changed", { detail: updated.readPages }),
    );
  }
  return updated.readPages;
}

/**
 * True when every page in the session's effective ranges has been read. Matches
 * the per-page progress bar in the UI (gap pages of non-contiguous sessions are
 * excluded). Used to auto-complete a session once its bar fills.
 */
export function isSessionFullyRead(
  session: PlanSession,
  readPages: number[],
): boolean {
  const ranges = session.ranges ?? [{ from: session.fromPage, to: session.toPage }];
  const readSet = new Set(readPages);
  let total = 0;
  for (const r of ranges) {
    for (let p = r.from; p <= r.to; p++) {
      total++;
      if (!readSet.has(p)) return false;
    }
  }
  return total > 0;
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

/**
 * Overall plan completeness (0–100) by pages read: unique read plan-pages ÷
 * unique total plan-pages. A page counts as read if it's in `readPages` or lies
 * in a session marked done. Sessions may share boundary pages, so pages are
 * de-duplicated across the whole plan.
 */
export function planReadProgress(plan: HifzPlan, readPages: number[]): number {
  const readSet = new Set(readPages);
  const allPages = new Set<number>();
  const donePages = new Set<number>();
  for (const s of plan.sessions) {
    const ranges = s.ranges ?? [{ from: s.fromPage, to: s.toPage }];
    for (const r of ranges) {
      for (let p = r.from; p <= r.to; p++) {
        allPages.add(p);
        if (s.done) donePages.add(p);
      }
    }
  }
  if (allPages.size === 0) return 0;
  let read = 0;
  for (const p of allPages) {
    if (donePages.has(p) || readSet.has(p)) read++;
  }
  return Math.round((read / allPages.size) * 100);
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
  return localDateStr();
}

/** Page span covered by a single memorized unit. */
function unitPageRange(
  unit: MemorizedUnit,
  chaptersCache: any[],
): { from: number; to: number } {
  if (unit.type === "juz") return juzToPages(unit.juz);
  if (unit.type === "surah") return surahToPages(unit.surah, chaptersCache);
  return { from: unit.from, to: unit.to };
}

/** The memorized units that overlap a session's page span [from, to]. */
function unitsForSpan(
  memorized: MemorizedUnit[],
  from: number,
  to: number,
  chaptersCache: any[],
): MemorizedUnit[] {
  return memorized.filter((u) => {
    const r = unitPageRange(u, chaptersCache);
    return r.from <= to && r.to >= from;
  });
}

export function generateSessions(
  memorized: MemorizedUnit[],
  goal: HifzGoal,
  chaptersCache: any[],
): PlanSession[] {
  const contiguousRanges = flattenMemorized(memorized, chaptersCache);
  if (contiguousRanges.length === 0) return [];

  const unit = goal.unit ?? "pages";
  const quantity = Math.max(1, goal.quantity ?? goal.pagesPerSession ?? 5);

  const sessions: PlanSession[] = [];
  let sessionIndex = 0;

  const pushSession = (
    segs: PageRange[],
    startVerse?: { sura: number; aya: number },
  ) => {
    const from = segs[0].from;
    const to = segs[segs.length - 1].to;
    sessions.push({
      id: `session-${sessionIndex}`,
      label: `${sessionIndex + 1}`,
      fromPage: from,
      toPage: to,
      ranges: segs.length === 1 ? undefined : segs,
      // Only the units this session's pages actually cover — not the whole plan.
      selectedUnits: unitsForSpan(memorized, from, to, chaptersCache),
      ...(startVerse ? { startVerse } : {}),
      done: false,
    });
    sessionIndex++;
  };

  // Rub'/Hizb goals slice at the real boundary verses (not a fixed page count).
  // A rub'/hizb mark often falls mid-page, so the boundary page is SHARED: the
  // ending session includes it (the tail of the previous unit sits there) and
  // the next session also starts on it, navigating to the exact boundary verse.
  const boundaries =
    unit === "rub" ? getRubBoundaries()
    : unit === "hizb" ? getHizbBoundaries()
    : null;
  const boundaryPages =
    boundaries?.map((b) => b.page) ??
    (unit === "rub" ? getRubStartPages()
     : unit === "hizb" ? getHizbStartPages()
     : null);

  if (boundaryPages) {
    const boundarySet = new Set(boundaryPages);
    // Look up the boundary (verse+page) that begins on a given page, if any.
    const boundaryAt = (page: number): UnitBoundary | undefined =>
      boundaries?.find((b) => b.page === page);

    for (const range of contiguousRanges) {
      // Boundaries whose start-page is within the range (excluding the range's
      // own first page) become the cut points; each carries its start verse.
      const cuts: UnitBoundary[] = (boundaries ?? boundaryPages.map((p) => ({ page: p, sura: 0, aya: 0 })))
        .filter((b) => b.page > range.from && b.page <= range.to)
        .sort((a, b) => a.page - b.page);
      // Drop duplicate pages (keep the first boundary on each page).
      const uniqueCuts: UnitBoundary[] = [];
      const seenPages = new Set<number>();
      for (const c of cuts) {
        if (seenPages.has(c.page)) continue;
        seenPages.add(c.page);
        uniqueCuts.push(c);
      }

      let segStart = range.from;
      let segStartVerse = boundaryAt(range.from)
        ? { sura: boundaryAt(range.from)!.sura, aya: boundaryAt(range.from)!.aya }
        : undefined;

      // Partial head: range starts mid-unit → its own session up to the first cut.
      if (!boundarySet.has(range.from) && uniqueCuts.length > 0) {
        const first = uniqueCuts[0];
        pushSession([{ from: segStart, to: first.page }], segStartVerse); // share boundary page
        segStart = first.page;
        segStartVerse = { sura: first.sura, aya: first.aya };
        uniqueCuts.shift();
      }

      // Whole units: every `quantity` boundaries closes a session that ENDS on
      // the boundary page (shared with the next session).
      let count = 0;
      for (const cut of uniqueCuts) {
        count++;
        if (count >= quantity) {
          pushSession([{ from: segStart, to: cut.page }], segStartVerse);
          segStart = cut.page;
          segStartVerse = { sura: cut.sura, aya: cut.aya };
          count = 0;
        }
      }

      // Trailing remainder up to the range end (partial tail or final group).
      if (segStart <= range.to) {
        pushSession([{ from: segStart, to: range.to }], segStartVerse);
      }
    }
    return sessions;
  }

  // Pages/Juz goals: fixed page-count chunks.
  const pagesPerSession = unitToPageCount(quantity, unit);
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

// ─── Persistent streak dates ──────────────────────────────────────────────────
// The streak must survive plan reset / new round / delete, so completed-days are
// stored separately from the plan's session state.

export function loadStreakDates(): string[] {
  try {
    const raw = localStorage.getItem(HIFZ_STREAK_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveStreakDates(dates: string[]): void {
  try {
    localStorage.setItem(HIFZ_STREAK_KEY, JSON.stringify(dates));
  } catch {}
}

/** Record today's date as an active (session-completed) day. Idempotent. */
export function recordStreakDay(date: string): void {
  const dates = loadStreakDates();
  if (!dates.includes(date)) {
    dates.push(date);
    saveStreakDates(dates);
  }
}

// ─── Per-day session counts ───────────────────────────────────────────────────
// Freezes are earned by doing more than one session in a day, so earning needs
// a count that survives plan reset / new round / delete. countSessionsToday
// reads the current plan and cannot serve: the plan is replaced over time.
//
// Stored as the set of session ids completed per day rather than a tally, so it
// is idempotent under the two ways completion is recorded — seeding the store
// from historical sessions on load, and toggling a session done/undone/done —
// neither of which may mint extra freezes.

const HIFZ_SESSION_COUNTS_KEY = "rafiq_hifz_session_counts_v1";

function loadSessionIdsByDay(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(HIFZ_SESSION_COUNTS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : {};
  } catch {
    return {};
  }
}

/**
 * Record that `sessionId` was completed on `date`. Idempotent per id, so
 * re-marking or re-seeding the same session never inflates the count.
 */
export function recordSessionForDay(date: string, sessionId: string): void {
  const byDay = loadSessionIdsByDay();
  const ids = byDay[date] ?? [];
  if (ids.includes(sessionId)) return;
  ids.push(sessionId);
  byDay[date] = ids;
  try {
    localStorage.setItem(HIFZ_SESSION_COUNTS_KEY, JSON.stringify(byDay));
  } catch {}
}

/** Sessions recorded as completed on a date, across all plans. */
export function countSessionsOnDate(date: string): number {
  return (loadSessionIdsByDay()[date] ?? []).length;
}

/** Longest run of consecutive days ending today (or yesterday) from a date set. */
function streakFromDateSet(doneDates: Set<string>): number {
  let streak = 0;
  const d = new Date();
  // If nothing done today, start from yesterday so a past streak still shows.
  if (!doneDates.has(localDateStr(d))) {
    d.setDate(d.getDate() - 1);
  }
  while (doneDates.has(localDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ─── Streak freeze / recovery ─────────────────────────────────────────────────
// A missed day breaks the streak. The user can "buy it back" by completing
// STREAK_RECOVERY_THRESHOLD sessions the following day; the missed day is then
// added to the freeze store, which counts toward the streak just like an active
// day, reconnecting the run.

function loadFreezeDates(): string[] {
  try {
    const raw = localStorage.getItem(HIFZ_STREAK_FREEZE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveFreezeDates(dates: string[]): void {
  try {
    localStorage.setItem(HIFZ_STREAK_FREEZE_KEY, JSON.stringify(dates));
  } catch {}
}

function addFreezeDate(date: string): void {
  const dates = loadFreezeDates();
  if (!dates.includes(date)) {
    dates.push(date);
    saveFreezeDates(dates);
  }
}

const isoDaysAgo = daysAgoStr;

/** All days that count toward the streak: real active days + frozen days. */
function allStreakDates(sessions: PlanSession[]): Set<string> {
  const dates = new Set(loadStreakDates());
  for (const s of sessions) if (s.done && s.doneDate) dates.add(s.doneDate);
  for (const f of loadFreezeDates()) dates.add(f);
  return dates;
}

/**
 * Streak from the persistent active-days store, merged with the current plan's
 * completed dates and any frozen (recovered) days. This keeps the streak intact
 * across plan reset / new round / delete, and across a single recovered miss.
 */
export function computeStreakPersistent(sessions: PlanSession[]): number {
  return streakFromDateSet(allStreakDates(sessions));
}

/**
 * Longest run of consecutive days ever achieved, anywhere in the history —
 * unlike computeStreakPersistent, which only measures the run ending now.
 */
export function computeLongestStreakPersistent(
  sessions: PlanSession[],
): number {
  const dates = Array.from(allStreakDates(sessions)).sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;

  for (const ds of dates) {
    run = prev && daysBetween(prev, ds) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = ds;
  }
  return longest;
}

/** One day in the card's week strip. */
export interface StreakDay {
  /** YYYY-MM-DD, local. */
  date: string;
  /** Counted toward the streak — by real activity or by a freeze. */
  active: boolean;
  /** Covered by a spent freeze rather than real activity. */
  frozen: boolean;
  /** Still ahead — never active, and not a gap in the run either. */
  future: boolean;
}

/**
 * Seven days centred on today: three behind, today, three ahead. Oldest first.
 *
 * Deliberately a rolling window rather than a calendar week — the streak is
 * computed from consecutive days, so a rolling window shows exactly the run
 * that matters and sidesteps which weekday a week starts on, which differs
 * between the app's two locales.
 *
 * Centring it rather than ending at today puts the run in the middle of the
 * row and gives the days ahead somewhere to appear, so the strip reads as a
 * streak in progress rather than a record that stops at the right edge. The
 * days ahead carry `future` because an empty cell means two different things
 * either side of today: behind, it is a break in the run; ahead, it has simply
 * not happened yet, and drawing them alike would invent gaps that do not exist.
 */
export function streakWindow(sessions: PlanSession[]): StreakDay[] {
  const dates = allStreakDates(sessions);
  const today = todayStr();
  const days: StreakDay[] = [];

  for (let i = 3; i >= -3; i--) {
    const date = isoDaysAgo(i);
    days.push({
      date,
      active: dates.has(date),
      frozen: wasFrozen("hifz", date),
      // ISO dates sort lexicographically, so a string compare is a date compare.
      future: date > today,
    });
  }
  return days;
}

export interface StreakRecoveryInfo {
  /** True when yesterday was missed but a prior streak exists to reconnect. */
  recoverable: boolean;
  /** The streak length that would be restored if recovery completes. */
  restorableStreak: number;
  /** Sessions completed today so far. */
  sessionsToday: number;
  /** Sessions still needed today to recover the streak. */
  needed: number;
  /** Whether the recovery has already been applied (streak reconnected). */
  recovered: boolean;
}

/**
 * Describe whether the streak was broken by exactly one missed day (yesterday)
 * and can be recovered by finishing STREAK_RECOVERY_THRESHOLD sessions today.
 * Only a single-day gap is recoverable; older breaks are permanent.
 */
export function streakRecoveryInfo(sessions: PlanSession[]): StreakRecoveryInfo {
  const dates = allStreakDates(sessions);
  const yesterday = isoDaysAgo(1);
  const dayBefore = isoDaysAgo(2);
  // Prefer the persistent per-day store: the plan is replaced on reset / new
  // round, which would drop today's count to 0 and make repair unreachable.
  // Fall back to the plan for data recorded before that store existed.
  const sessionsToday = Math.max(
    countSessionsOnDate(todayStr()),
    countSessionsToday(sessions),
  );
  const none: StreakRecoveryInfo = {
    recoverable: false,
    restorableStreak: 0,
    sessionsToday,
    needed: 0,
    recovered: false,
  };

  // Already bridged yesterday → recovery has happened.
  if (dates.has(yesterday)) {
    return { ...none, recovered: loadFreezeDates().includes(yesterday) };
  }
  // Recoverable only if the run was alive the day before the miss.
  if (!dates.has(dayBefore)) return none;

  // Length of the streak that ends at dayBefore (what we'd restore, +1 bridge
  // +1 for today once the threshold is met).
  let priorStreak = 0;
  const d = new Date();
  d.setDate(d.getDate() - 2);
  while (dates.has(localDateStr(d))) {
    priorStreak++;
    d.setDate(d.getDate() - 1);
  }

  return {
    recoverable: true,
    restorableStreak: priorStreak + 1 + (sessionsToday > 0 ? 1 : 0),
    sessionsToday,
    needed: Math.max(0, STREAK_RECOVERY_THRESHOLD - sessionsToday),
    recovered: false,
  };
}

/**
 * If the streak is recoverable and enough sessions were completed today, bridge
 * yesterday into the freeze store so the streak reconnects. Idempotent; safe to
 * call whenever a session/page is completed. Returns true when it recovers.
 */
export function tryRecoverStreak(sessions: PlanSession[]): boolean {
  const info = streakRecoveryInfo(sessions);
  if (info.recoverable && info.needed === 0) {
    addFreezeDate(isoDaysAgo(1));
    return true;
  }
  return false;
}

// ─── Freezes ──────────────────────────────────────────────────────────────────

/**
 * Spend freezes on any days missed since the last session. Safe to call on app
 * open and after each completion. `asOf` is the day being settled up to,
 * exclusive — pass the date being recorded when it is not today, or a freeze
 * would be spent on the very day about to be marked active.
 */
export function settleHifzFreezes(
  sessions: PlanSession[],
  asOf: string = todayStr(),
): string[] {
  return settleFreezes("hifz", allStreakDates(sessions), asOf);
}

/**
 * Record a completed session and update freezes: settle any missed days first,
 * then mark the day active, attempt repair, and award freezes for extra
 * sessions. Returns the days a freeze covered and the freezes earned, so the
 * caller can surface both.
 */
export function recordHifzSession(
  sessions: PlanSession[],
  sessionId: string,
  date: string = todayStr(),
): { frozen: string[]; earned: number } {
  // Settle before recording, while the store still shows the gap.
  const frozen = settleHifzFreezes(sessions, date);

  // Record before repairing: streakRecoveryInfo counts today's sessions from
  // this store, so the session just completed has to be in it to count.
  recordStreakDay(date);
  recordSessionForDay(date, sessionId);

  const repaired = tryRecoverStreak(sessions);
  // A repair spends the day's extra session, so it cannot also earn a freeze.
  // A day bridged by a *freeze* is not a repair, hence wasFrozen — both write
  // the same bridged-days store.
  const repairedToday =
    repaired ||
    (loadFreezeDates().includes(isoDaysAgo(1)) &&
      !wasFrozen("hifz", isoDaysAgo(1)));

  const earned = earnFreezes(
    "hifz",
    date,
    countSessionsOnDate(date),
    repairedToday,
  );

  return { frozen, earned };
}

export function computeStreak(sessions: PlanSession[]): number {
  const doneDates = new Set(
    sessions.filter((s) => s.done && s.doneDate).map((s) => s.doneDate!),
  );
  let streak = 0;
  const d = new Date();
  // If nothing done today, start checking from yesterday so a past streak
  // doesn't show as 0 just because today hasn't been reviewed yet.
  if (!doneDates.has(localDateStr(d))) {
    d.setDate(d.getDate() - 1);
  }
  while (doneDates.has(localDateStr(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export function countSessionsToday(sessions: PlanSession[]): number {
  const today = todayStr();
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
