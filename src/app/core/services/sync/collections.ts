/**
 * Sync collections — one adapter per local data store.
 *
 * Each adapter reads its store into a keyed item map and writes a merged map
 * back, so the sync engine treats every store alike and the app's many
 * existing writers stay untouched. Writes mirror `restoreBackup`: the Hifz
 * stores go through both their sync and async savers.
 *
 * Item keys: an "object" collection is the single item `"value"`; the Hifz plan
 * is `current` plus `archive:<createdAt>` for archived plans.
 */

import { Preferences } from "@capacitor/preferences";
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
import { PRESETS_KEY } from "../../../features/quiz/services/quiz-presets.service";
import type { SyncKind } from "./types";

export interface SyncCollection {
  id: string;
  kind: SyncKind;
  /** localStorage / Preferences keys this collection owns. */
  storageKeys: string[];
  read(): Promise<Record<string, unknown>>;
  /** Replace the store's contents with `items`, keeping local order. */
  write(items: Record<string, unknown>): Promise<void>;
  /** Minimum shape the store's own loader accepts. `key` is the item key. */
  validate(value: unknown, key?: string): boolean;
}

/** Item key of an "object" collection's single value. */
const VALUE = "value";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ARCHIVE_PREFIX = "archive:";
/** Sync-owned: archived Hifz plans, createdAt -> HifzPlan. */
const PLAN_ARCHIVE_KEY = "rafiq_hifz_plan_archive_v1";
const FREEZE_POOL_KEY = "rafiq_hifz_freeze_tokens_v1";

// ─── Shape checks ─────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isDay = (k?: string): boolean => k !== undefined && DAY_RE.test(k);
const isStringArray = (v: unknown): boolean => Array.isArray(v) && v.every(isString);
const nonNull = (v: unknown): boolean => v !== null && v !== undefined;

const isNote = (v: unknown): boolean =>
  isRecord(v) && isString(v.id) && isString(v.body) && Array.isArray(v.ranges) && isString(v.updatedAt);

const isPlanLike = (v: unknown): boolean =>
  isRecord(v) && isString(v.createdAt) && Array.isArray(v.sessions);

const isFreezePool = (v: unknown): boolean =>
  isRecord(v) &&
  typeof v.count === "number" &&
  Number.isFinite(v.count) &&
  isRecord(v.earnedOn) &&
  Array.isArray(v.spentOn);

const isPreset = (v: unknown): boolean =>
  isRecord(v) &&
  isString(v.id) &&
  isString(v.name) &&
  Array.isArray(v.ranges) &&
  typeof v.createdAt === "number" &&
  typeof v.updatedAt === "number";

// ─── Raw storage ──────────────────────────────────────────────────────────────

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function readJson(key: string): unknown {
  const raw = readRaw(key);
  if (raw === null) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

const writeJson = (key: string, value: unknown): void => writeRaw(key, JSON.stringify(value));

/** Keys of `items` that are not in `existing`, in key order. */
const newKeys = (existing: Set<string>, items: Record<string, unknown>): string[] =>
  Object.keys(items)
    .filter((k) => !existing.has(k))
    .sort();

/** Existing entries still in `items` (local order, new value), then new ones. */
function mergeInOrder(
  existing: Array<[string, unknown]>,
  items: Record<string, unknown>,
): unknown[] {
  const seen = new Set<string>();
  const next: unknown[] = [];
  for (const [k] of existing) {
    if (k in items) {
      next.push(items[k]);
      seen.add(k);
    }
  }
  for (const k of newKeys(seen, items)) next.push(items[k]);
  return next;
}

// ─── Adapter builders ─────────────────────────────────────────────────────────

/** An array of objects, keyed by `idOf`. */
function objectArray(
  id: string,
  load: () => Promise<Record<string, unknown>[]>,
  save: (next: unknown[]) => Promise<void>,
  storageKey: string,
  validate: (value: unknown) => boolean,
): SyncCollection {
  return {
    id,
    kind: "items",
    storageKeys: [storageKey],
    async read() {
      const out: Record<string, unknown> = {};
      for (const item of await load()) if (isString(item.id)) out[item.id] = item;
      return out;
    },
    async write(items) {
      const existing = (await load()).filter((i) => isString(i.id)).map((i): [string, unknown] => [i.id as string, i]);
      await save(mergeInOrder(existing, items));
    },
    validate,
  };
}

const localObjectArray = (id: string, key: string, validate: (v: unknown) => boolean) =>
  objectArray(
    id,
    async () => {
      const parsed = readJson(key);
      return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
    },
    async (next) => writeJson(key, next),
    key,
    validate,
  );

/** localStorage array of strings, each present item mapping to `true`. */
function stringSet(
  id: string,
  kind: "items" | "days",
  key: string,
  validateKey: (k?: string) => boolean,
): SyncCollection {
  const load = (): string[] => {
    const parsed = readJson(key);
    return Array.isArray(parsed) ? parsed.filter(isString) : [];
  };
  return {
    id,
    kind,
    storageKeys: [key],
    async read() {
      const out: Record<string, unknown> = {};
      for (const k of load()) out[k] = true;
      return out;
    },
    async write(items) {
      const kept = load().filter((k) => items[k] === true);
      const added = newKeys(new Set(kept), items).filter((k) => items[k] === true);
      writeJson(key, [...kept, ...added]);
    },
    validate: (value, k) => value === true && validateKey(k),
  };
}

/** localStorage map; each entry is an item. */
function recordMap(
  id: string,
  kind: "items" | "days",
  key: string,
  validate: (value: unknown, key?: string) => boolean,
): SyncCollection {
  const load = (): Record<string, unknown> => {
    const parsed = readJson(key);
    return isRecord(parsed) ? parsed : {};
  };
  return {
    id,
    kind,
    storageKeys: [key],
    async read() {
      return load();
    },
    async write(items) {
      const next: Record<string, unknown> = {};
      for (const k of Object.keys(load())) if (k in items) next[k] = items[k];
      for (const k of newKeys(new Set(Object.keys(next)), items)) next[k] = items[k];
      writeJson(key, next);
    },
    validate,
  };
}

/**
 * A single-value store at one localStorage key. Stores written as bare strings
 * (theme, language, tracker since-date) are read and written unquoted; anything
 * else is JSON. An absent value leaves the store untouched.
 */
function singleValue(
  id: string,
  kind: SyncKind,
  key: string,
  validate: (value: unknown) => boolean = nonNull,
): SyncCollection {
  return {
    id,
    kind,
    storageKeys: [key],
    async read() {
      const raw = readRaw(key);
      if (raw === null) return {};
      try {
        const parsed = JSON.parse(raw);
        return { [VALUE]: isString(parsed) ? raw : parsed };
      } catch {
        return { [VALUE]: raw };
      }
    },
    async write(items) {
      if (!(VALUE in items)) return;
      const v = items[VALUE];
      writeRaw(key, isString(v) ? v : JSON.stringify(v));
    },
    validate,
  };
}

/** A Hifz store reached through an async loader and a sync + async saver pair. */
function hifzObject<T>(
  id: string,
  key: string,
  load: () => Promise<T | null>,
  save: (value: T) => void,
  saveAsync: (value: T) => Promise<void>,
): SyncCollection {
  return {
    id,
    kind: "object",
    storageKeys: [key],
    async read() {
      const value = await load();
      return value ? { [VALUE]: value } : {};
    },
    async write(items) {
      const value = items[VALUE];
      if (!isRecord(value)) return;
      save(value as T);
      await saveAsync(value as T);
    },
    validate: isRecord,
  };
}

// ─── Specific collections ─────────────────────────────────────────────────────

/** Quiz presets live in Capacitor Preferences, not localStorage. */
const quizPresets = objectArray(
  "quizPresets",
  async () => {
    try {
      const { value } = await Preferences.get({ key: PRESETS_KEY });
      const parsed = value ? JSON.parse(value) : [];
      return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
    } catch {
      return [];
    }
  },
  (next) => Preferences.set({ key: PRESETS_KEY, value: JSON.stringify(next) }),
  PRESETS_KEY,
  isPreset,
);

const loadArchive = (): Record<string, unknown> => {
  const parsed = readJson(PLAN_ARCHIVE_KEY);
  return isRecord(parsed) ? parsed : {};
};

/**
 * `current` is the active plan (async loader, as backup does); archived plans
 * are `archive:<createdAt>` in a sync-owned localStorage map. An absent
 * `current` leaves the active plan alone.
 */
const hifzPlan: SyncCollection = {
  id: "hifzPlan",
  kind: "hifzPlan",
  storageKeys: ["rafiq_hifz_v2", PLAN_ARCHIVE_KEY],
  async read() {
    const out: Record<string, unknown> = {};
    const plan = await loadPlanAsync();
    if (plan) out.current = plan;
    for (const [createdAt, p] of Object.entries(loadArchive())) out[ARCHIVE_PREFIX + createdAt] = p;
    return out;
  },
  async write(items) {
    const current = items.current;
    if (isPlanLike(current)) {
      const plan = current as Parameters<typeof savePlan>[0];
      savePlan(plan);
      await savePlanAsync(plan);
    }
    const wanted: Record<string, unknown> = {};
    for (const k of Object.keys(items)) {
      if (k.startsWith(ARCHIVE_PREFIX)) wanted[k.slice(ARCHIVE_PREFIX.length)] = items[k];
    }
    const archive: Record<string, unknown> = {};
    for (const k of Object.keys(loadArchive())) if (k in wanted) archive[k] = wanted[k];
    for (const k of newKeys(new Set(Object.keys(archive)), wanted)) archive[k] = wanted[k];
    writeJson(PLAN_ARCHIVE_KEY, archive);
  },
  validate: isPlanLike,
};

export const SYNC_COLLECTIONS: SyncCollection[] = [
  localObjectArray("notes", "rafiq_notes_v1", isNote),
  recordMap("bookmarks", "items", "rafiq_bookmarks_v1", isString),
  stringSet("hiddenVerses", "items", "rafiq_hidden_verses_v1", (k) => !!k),
  localObjectArray("recitationHistory", "rafiq_recitation_history_v1", (v) => isRecord(v) && isString(v.id)),
  stringSet("azkarFavorites", "items", "azkar:favorites", (k) => !!k),
  quizPresets,
  recordMap("trackerDays", "items", "rafeeq.tracker.days", (v, k) => isDay(k) && isStringArray(v)),
  stringSet("hifzStreakDates", "days", "rafiq_hifz_streak_dates_v1", isDay),
  stringSet("hifzBridgedDates", "days", "rafiq_hifz_streak_freeze_v1", isDay),
  recordMap("hifzSessionCounts", "days", "rafiq_hifz_session_counts_v1", (v, k) => isDay(k) && isStringArray(v)),
  hifzPlan,
  singleValue("hifzFreezePool", "freezePool", FREEZE_POOL_KEY, isFreezePool),
  hifzObject("hifzBest", "rafiq_hifz_best_v1", loadBestPlanAsync, saveBestPlan, saveBestPlanAsync),
  hifzObject("hifzLatest", "rafiq_hifz_latest_v1", loadLatestPlanAsync, saveLatestPlan, saveLatestPlanAsync),
  hifzObject(
    "hifzReading",
    "rafiq_hifz_reading_v1",
    loadHifzReadingSessionAsync,
    saveHifzReadingSession,
    saveHifzReadingSessionAsync,
  ),
  singleValue("settings", "object", "rafiq_settings_v1"),
  singleValue("theme", "object", "rafiq_theme_v1"),
  singleValue("lang", "object", "rafiq_lang_v1"),
  singleValue("lastPage", "object", "rafiq_last_page_v1"),
  singleValue("searchRecents", "object", "rafiq_search_recents_v1"),
  singleValue("tafsirResources", "object", "rafiq_tafsir_resources_v1"),
  singleValue("trackerSettings", "object", "rafeeq.tracker.settings"),
  // The engine keeps the earliest date on merge (Task 6).
  singleValue("trackerSince", "object", "rafeeq.tracker.since", (v) => isString(v) && DAY_RE.test(v)),
  singleValue("trackerWeights", "object", "rafeeq.tracker.weights"),
];

export function collectionForStorageKey(key: string): SyncCollection | undefined {
  return SYNC_COLLECTIONS.find((c) => c.storageKeys.includes(key));
}
