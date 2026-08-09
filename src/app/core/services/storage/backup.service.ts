/**
 * Backup & restore — moves a user's data to a new device without an account.
 *
 * Rafeeq has no sign-in and no server, so a plain JSON file is the migration
 * path: export on the old device, import on the new one. Everything the user
 * created (notes, bookmarks, Hifz plan and streaks, quiz streaks, recitation
 * history) travels; re-downloadable content caches (tafsir, audio, fonts,
 * Quran text) deliberately do not, since they would bloat the file for data
 * the new device can simply fetch again.
 */

import { Capacitor } from "@capacitor/core";
import {
  loadPlanAsync,
  savePlan,
  savePlanAsync,
  loadBestPlanAsync,
  saveBestPlan,
  saveBestPlanAsync,
  loadLatestPlanAsync,
  saveLatestPlan,
  saveLatestPlanAsync,
  loadHifzReadingSessionAsync,
  saveHifzReadingSession,
  saveHifzReadingSessionAsync,
} from "../../../features/hifz/hifz.service";

/** Bump only on a breaking change to the file layout. */
const BACKUP_VERSION = 1;

const FILE_PREFIX = "rafeeq-backup";

/**
 * localStorage keys carried by a backup. Content caches are intentionally
 * absent — see the module comment.
 */
const BACKED_UP_KEYS = [
  // User-created content
  "rafiq_notes_v1",
  "rafiq_bookmarks_v1",
  "rafiq_hidden_verses_v1",
  "rafiq_recitation_history_v1",
  // Hifz plan + streak
  "rafiq_hifz_v2",
  "rafiq_hifz_best_v1",
  "rafiq_hifz_latest_v1",
  "rafiq_hifz_reading_v1",
  "rafiq_hifz_streak_dates_v1",
  "rafiq_hifz_streak_freeze_v1",
  // Quiz streak
  "rafiq_quiz_streak_dates_v1",
  "rafiq_quiz_streak_counts_v1",
  "rafiq_quiz_streak_freeze_v1",
  // Preferences — small, and a restored device should feel identical
  "rafiq_settings_v1",
  "rafiq_theme_v1",
  "rafiq_lang_v1",
  "rafiq_last_page_v1",
  "rafiq_search_recents_v1",
  "rafiq_tafsir_resources_v1",
] as const;

export interface BackupFile {
  version: number;
  exportedAt: string;
  platform: string;
  /** Raw localStorage values, keyed exactly as stored. */
  data: Record<string, string>;
}

export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BackupError";
  }
}

/** Human-readable summary of what a backup holds, for the confirm dialog. */
export interface BackupSummary {
  notes: number;
  bookmarks: number;
  hifzStreakDays: number;
  quizStreakDays: number;
  hasHifzPlan: boolean;
  exportedAt: string;
}

function countJsonEntries(raw: string | undefined): number {
  if (!raw) return 0;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
  } catch {}
  return 0;
}

export function summarizeBackup(backup: BackupFile): BackupSummary {
  const d = backup.data ?? {};
  return {
    notes: countJsonEntries(d["rafiq_notes_v1"]),
    bookmarks: countJsonEntries(d["rafiq_bookmarks_v1"]),
    hifzStreakDays: countJsonEntries(d["rafiq_hifz_streak_dates_v1"]),
    quizStreakDays: countJsonEntries(d["rafiq_quiz_streak_dates_v1"]),
    hasHifzPlan: !!d["rafiq_hifz_v2"],
    exportedAt: backup.exportedAt,
  };
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * Collect everything worth restoring into a backup object.
 *
 * The Hifz stores are read through their async loaders: on Android they live in
 * the native filesystem (and in IndexedDB on web/iOS), so the localStorage copy
 * can be stale or missing after a cold start.
 */
export async function createBackup(): Promise<BackupFile> {
  const data: Record<string, string> = {};

  for (const key of BACKED_UP_KEYS) {
    const value = localStorage.getItem(key);
    if (value !== null) data[key] = value;
  }

  // Authoritative Hifz state overrides whatever localStorage held.
  try {
    const [plan, best, latest, reading] = await Promise.all([
      loadPlanAsync(),
      loadBestPlanAsync(),
      loadLatestPlanAsync(),
      loadHifzReadingSessionAsync(),
    ]);
    if (plan) data["rafiq_hifz_v2"] = JSON.stringify(plan);
    if (best) data["rafiq_hifz_best_v1"] = JSON.stringify(best);
    if (latest) data["rafiq_hifz_latest_v1"] = JSON.stringify(latest);
    if (reading) data["rafiq_hifz_reading_v1"] = JSON.stringify(reading);
  } catch (err) {
    console.warn("[backup] async Hifz read failed, using localStorage copy:", err);
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    platform: Capacitor.getPlatform(),
    data,
  };
}

/** File name carrying the export date, e.g. rafeeq-backup-2026-08-09.json */
export function backupFileName(date = new Date()): string {
  return `${FILE_PREFIX}-${date.toISOString().slice(0, 10)}.json`;
}

/**
 * Write the backup somewhere the user can reach it.
 *
 * Android/iOS: Documents, so it shows up in Files and can be shared onward.
 * Web: a normal download.
 * Returns a description of where it landed, for display.
 */
export async function exportBackupToFile(): Promise<string> {
  const backup = await createBackup();
  const json = JSON.stringify(backup, null, 2);
  const fileName = backupFileName();

  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import("@capacitor/filesystem");
    await Filesystem.writeFile({
      path: fileName,
      directory: Directory.Documents,
      data: json,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return fileName;
  }

  // Web: trigger a download via an object URL.
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return fileName;
}

// ─── Import ───────────────────────────────────────────────────────────────────

/** Parse and validate backup JSON. Throws BackupError on anything unusable. */
export function parseBackup(json: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new BackupError("not_json");
  }

  if (!parsed || typeof parsed !== "object") throw new BackupError("not_a_backup");
  const candidate = parsed as Partial<BackupFile>;

  if (typeof candidate.version !== "number" || !candidate.data || typeof candidate.data !== "object") {
    throw new BackupError("not_a_backup");
  }
  // A newer major version may store things this build cannot understand.
  if (candidate.version > BACKUP_VERSION) throw new BackupError("version_too_new");

  return {
    version: candidate.version,
    exportedAt: typeof candidate.exportedAt === "string" ? candidate.exportedAt : "",
    platform: typeof candidate.platform === "string" ? candidate.platform : "unknown",
    data: candidate.data as Record<string, string>,
  };
}

/**
 * Restore a backup, replacing this device's data.
 *
 * Replace rather than merge: the intended use is a fresh device, where the two
 * are equivalent, and a straight replace stays predictable — re-importing the
 * same file always yields the same result. Unknown keys are ignored so a file
 * from a newer minor version still restores what this build understands.
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  const known = new Set<string>(BACKED_UP_KEYS);

  for (const [key, value] of Object.entries(backup.data)) {
    if (!known.has(key) || typeof value !== "string") continue;
    try {
      localStorage.setItem(key, value);
    } catch (err) {
      console.warn(`[backup] could not restore ${key}:`, err);
    }
  }

  // Hifz stores are dual-written, so push the restored copies through the async
  // writers too — otherwise Android/iOS would keep reading the old plan.
  await restoreHifzStores(backup.data);
}

async function restoreHifzStores(data: Record<string, string>): Promise<void> {
  const parse = <T,>(raw: string | undefined): T | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  };

  try {
    const plan = parse<Parameters<typeof savePlan>[0]>(data["rafiq_hifz_v2"]);
    if (plan) {
      savePlan(plan);
      await savePlanAsync(plan);
    }

    const best = parse<Parameters<typeof saveBestPlan>[0]>(data["rafiq_hifz_best_v1"]);
    if (best) {
      saveBestPlan(best);
      await saveBestPlanAsync(best);
    }

    const latest = parse<Parameters<typeof saveLatestPlan>[0]>(data["rafiq_hifz_latest_v1"]);
    if (latest) {
      saveLatestPlan(latest);
      await saveLatestPlanAsync(latest);
    }

    const reading = parse<Parameters<typeof saveHifzReadingSession>[0]>(
      data["rafiq_hifz_reading_v1"],
    );
    if (reading) {
      saveHifzReadingSession(reading);
      await saveHifzReadingSessionAsync(reading);
    }
  } catch (err) {
    console.warn("[backup] Hifz async restore failed:", err);
  }
}

/** Read a user-picked file as text. */
export function readBackupFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new BackupError("read_failed"));
    reader.readAsText(file);
  });
}
