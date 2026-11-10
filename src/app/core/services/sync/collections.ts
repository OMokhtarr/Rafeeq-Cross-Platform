/**
 * Sync collections — one adapter per local data store.
 *
 * Each adapter reads its store into a keyed item map and writes a merged map
 * back, so the sync engine treats every store alike and the app's many
 * existing writers stay untouched. Writes mirror `restoreBackup`: the Hifz
 * stores go through strict savers that write both localStorage and the platform store.
 *
 * Absent data reads as `{}`. A store that exists but cannot be read or parsed
 * makes `read()` throw, and a failed storage write makes `write()` throw, so a
 * storage failure is never mistaken for "the user deleted everything".
 *
 * Item keys: an "object" collection is the single item `"value"`; the Hifz plan
 * is `current` plus `archive:<createdAt>` for archived plans.
 */

import { Preferences } from "@capacitor/preferences";
import {
  loadPlanStrict,
  savePlanStrict,
  clearPlanStrict,
  loadBestPlanStrict,
  saveBestPlanStrict,
  loadLatestPlanStrict,
  saveLatestPlanStrict,
  loadHifzReadingSessionStrict,
  saveHifzReadingSessionStrict,
  clearHifzReadingSessionStrict,
} from "../../../features/hifz/hifz.service";
import { PRESETS_KEY, isPreset } from "../../../features/quiz/services/quiz-presets.keys";
import { markStoreBroken } from "./broken-stores";
import type { SyncKind } from "./types";

export interface SyncCollection {
  id: string;
  kind: SyncKind;
  /** localStorage / Preferences keys this collection owns. */
  storageKeys: string[];
  /** Throws when the store exists but cannot be read. */
  read(): Promise<Record<string, unknown>>;
  /** Replace the store's contents with `items`. Throws when storage fails. */
  write(items: Record<string, unknown>): Promise<void>;
  /** Minimum shape the store's own loader accepts. `key` is the item key. */
  validate(value: unknown, key: string): boolean;
  /** Edits are stamped and go up with the next run, but do not schedule one. */
  passive?: boolean;
  /**
   * Resets a damaged part of the store that only sync writes, marking the
   * collection broken when it does. The engine runs it before `read()` with
   * the write hook suppressed, so the reset is not taken for a local edit.
   */
  repair?(): Promise<void>;
}

/** Item fields holding the item's own edit time, for collections that have one. */
export const OWN_TIME: Record<string, string> = { notes: "updatedAt", recitationHistory: "recordedAt" };

/** Item key of an "object" collection's single value. */
const VALUE = "value";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Prefix of an archived plan's item key; the sync engine creates these keys. */
export const ARCHIVE_PREFIX = "archive:";
/** Sync-owned: archived Hifz plans, createdAt -> HifzPlan. */
const PLAN_ARCHIVE_KEY = "rafiq_hifz_plan_archive_v1";
const FREEZE_POOL_KEY = "rafiq_hifz_freeze_tokens_v1";

// ─── Shape checks ─────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isDay = (k: string): boolean => DAY_RE.test(k);
const isStringArray = (v: unknown): boolean => Array.isArray(v) && v.every(isString);
const isArray = (v: unknown): boolean => Array.isArray(v);
const isDayString = (v: unknown): boolean => isString(v) && DAY_RE.test(v);
const isPageNumber = (v: unknown): boolean =>
  (typeof v === "number" && Number.isFinite(v)) || (isString(v) && /^\d+$/.test(v));

const isNote = (v: unknown): boolean =>
  isRecord(v) && isString(v.id) && isString(v.body) && Array.isArray(v.ranges) && isString(v.updatedAt);

const isSession = (v: unknown): boolean => isRecord(v) && isString(v.id);

const isPlanLike = (v: unknown): boolean =>
  isRecord(v) && isString(v.createdAt) && Array.isArray(v.sessions);

const isFreezePool = (v: unknown): boolean =>
  isRecord(v) &&
  typeof v.count === "number" &&
  Number.isFinite(v.count) &&
  isRecord(v.earnedOn) &&
  Array.isArray(v.spentOn);

// ─── Raw storage (errors propagate) ───────────────────────────────────────────

const readRaw = (key: string): string | null => localStorage.getItem(key);
const writeRaw = (key: string, value: string): void => localStorage.setItem(key, value);

/** Parsed value, `undefined` when absent; throws on corrupt JSON. */
function readJson(key: string): unknown {
  const raw = readRaw(key);
  return raw === null ? undefined : JSON.parse(raw);
}

const writeJson = (key: string, value: unknown): void => writeRaw(key, JSON.stringify(value));

function readArray(key: string): unknown[] {
  const parsed = readJson(key);
  if (parsed === undefined) return [];
  if (!Array.isArray(parsed)) throw new Error(`${key}: expected an array`);
  return parsed;
}

function readMap(key: string): Record<string, unknown> {
  const parsed = readJson(key);
  if (parsed === undefined) return {};
  if (!isRecord(parsed)) throw new Error(`${key}: expected an object`);
  return parsed;
}

/** Keys of `items` that are not in `existing`, in key order. */
const newKeys = (existing: Set<string>, items: Record<string, unknown>): string[] =>
  Object.keys(items)
    .filter((k) => !existing.has(k))
    .sort();

// ─── Adapter builders ─────────────────────────────────────────────────────────

/**
 * An array of objects keyed by string `id`. Entries without a string id are
 * invalid for sync: ignored on read and dropped on write. Duplicate ids keep
 * the first occurrence. With `newestFirst`, the written array is sorted by that
 * date field descending (ties by id), as the app stores and displays it;
 * otherwise local order is kept and new items are appended in key order.
 */
function objectArray(
  id: string,
  storageKey: string,
  load: () => Promise<unknown[]>,
  save: (next: unknown[]) => Promise<void>,
  validate: (value: unknown) => boolean,
  newestFirst?: string,
): SyncCollection {
  return {
    id,
    kind: "items",
    storageKeys: [storageKey],
    async read() {
      const out: Record<string, unknown> = {};
      for (const item of await load()) {
        if (isRecord(item) && isString(item.id) && !(item.id in out)) out[item.id] = item;
      }
      return out;
    },
    async write(items) {
      const seen = new Set<string>();
      const next: unknown[] = [];
      for (const item of await load()) {
        if (!isRecord(item) || !isString(item.id) || seen.has(item.id) || !(item.id in items)) continue;
        seen.add(item.id);
        next.push(items[item.id]);
      }
      for (const k of newKeys(seen, items)) next.push(items[k]);
      if (newestFirst) {
        const at = (v: unknown) => (isRecord(v) && isString(v[newestFirst]) ? (v[newestFirst] as string) : "");
        const key = (v: unknown) => (isRecord(v) && isString(v.id) ? v.id : "");
        next.sort((a, b) => {
          const d = at(b).localeCompare(at(a));
          return d !== 0 ? d : key(a).localeCompare(key(b));
        });
      }
      await save(next);
    },
    validate,
  };
}

const localObjectArray = (
  id: string,
  key: string,
  validate: (v: unknown) => boolean,
  newestFirst?: string,
) =>
  objectArray(
    id,
    key,
    async () => readArray(key),
    async (next) => writeJson(key, next),
    validate,
    newestFirst,
  );

/** localStorage array of strings, each present item mapping to `true`. */
function stringSet(
  id: string,
  kind: "items" | "days",
  key: string,
  validateKey: (k: string) => boolean,
): SyncCollection {
  const load = (): string[] => readArray(key).filter(isString);
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
      const kept = Array.from(new Set(load())).filter((k) => items[k] === true);
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
  validate: (value: unknown, key: string) => boolean,
): SyncCollection {
  return {
    id,
    kind,
    storageKeys: [key],
    async read() {
      return readMap(key);
    },
    async write(items) {
      const next: Record<string, unknown> = {};
      for (const k of Object.keys(readMap(key))) if (k in items) next[k] = items[k];
      for (const k of newKeys(new Set(Object.keys(next)), items)) next[k] = items[k];
      writeJson(key, next);
    },
    validate,
  };
}

/**
 * A single-value store at one localStorage key, stored either as JSON or as a
 * bare string (theme, language, last page, tracker since-date). An absent
 * `value` leaves the store untouched: no app path removes these keys.
 */
function singleValue(
  id: string,
  kind: SyncKind,
  key: string,
  format: "json" | "string",
  validate: (value: unknown) => boolean,
): SyncCollection {
  return {
    id,
    kind,
    storageKeys: [key],
    async read() {
      const raw = readRaw(key);
      if (raw === null) return {};
      return { [VALUE]: format === "json" ? JSON.parse(raw) : raw };
    },
    async write(items) {
      if (!(VALUE in items)) return;
      const v = items[VALUE];
      writeRaw(key, format === "json" ? JSON.stringify(v) : String(v));
    },
    validate: (value) => validate(value),
  };
}

/**
 * A Hifz store reached through the strict loader / saver (localStorage plus the
 * platform store, throwing on failure). An absent `value` clears the store when
 * a clearer exists; best and latest have none, so a remote delete of those is
 * ignored locally.
 */
function hifzObject<T>(
  id: string,
  key: string,
  load: () => Promise<T | null>,
  save: (value: T) => Promise<void>,
  clear?: () => Promise<void>,
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
      if (isRecord(value)) {
        await save(value as T);
      } else if (!(VALUE in items) && clear) {
        await clear();
      }
    },
    validate: isRecord,
  };
}

// ─── Specific collections ─────────────────────────────────────────────────────

/**
 * Settings that mirror this phone's native reminder state (Settings reconciles
 * them with native on every open). Each phone keeps its own: synced, two
 * phones with different reminders would overwrite each other on every open.
 */
const DEVICE_SETTINGS = ["prayerReminders", "azkarReminders"];

const withoutDeviceSettings = (v: unknown): unknown => {
  if (!isRecord(v)) return v;
  const out = { ...v };
  for (const k of DEVICE_SETTINGS) delete out[k];
  return out;
};

const settingsStore = singleValue("settings", "object", "rafiq_settings_v1", "json", isRecord);

/** The settings object without this phone's own settings; writes keep the local ones. */
const settings: SyncCollection = {
  ...settingsStore,
  async read() {
    const items = await settingsStore.read();
    return VALUE in items ? { [VALUE]: withoutDeviceSettings(items[VALUE]) } : items;
  },
  async write(items) {
    const next = items[VALUE];
    if (!isRecord(next)) return settingsStore.write(items);
    let local: unknown;
    try {
      local = readJson("rafiq_settings_v1");
    } catch {
      local = undefined;
    }
    const own: Record<string, unknown> = {};
    if (isRecord(local)) for (const k of DEVICE_SETTINGS) if (k in local) own[k] = local[k];
    await settingsStore.write({ [VALUE]: { ...(withoutDeviceSettings(next) as object), ...own } });
  },
};

/** Quiz presets live in Capacitor Preferences, not localStorage. */
const quizPresets = objectArray(
  "quizPresets",
  PRESETS_KEY,
  async () => {
    const { value } = await Preferences.get({ key: PRESETS_KEY });
    if (!value) return [];
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error(`${PRESETS_KEY}: expected an array`);
    return parsed;
  },
  (next) => Preferences.set({ key: PRESETS_KEY, value: JSON.stringify(next) }),
  isPreset,
);

/**
 * `current` is the active plan (async loader, as backup does); archived plans
 * are `archive:<createdAt>` in a sync-owned localStorage map. An absent
 * `current` clears the active plan, in both stores.
 */
const hifzPlan: SyncCollection = {
  id: "hifzPlan",
  kind: "hifzPlan",
  storageKeys: ["rafiq_hifz_v2", PLAN_ARCHIVE_KEY],
  async read() {
    const out: Record<string, unknown> = {};
    const plan = await loadPlanStrict();
    if (plan) out.current = plan;
    for (const [createdAt, p] of Object.entries(readMap(PLAN_ARCHIVE_KEY))) {
      out[ARCHIVE_PREFIX + createdAt] = p;
    }
    return out;
  },
  async write(items) {
    // The archive first: if the current plan then fails to save, the next run
    // still holds the old plan locally and archives it, instead of losing it.
    const wanted: Record<string, unknown> = {};
    for (const k of Object.keys(items)) {
      if (k.startsWith(ARCHIVE_PREFIX)) wanted[k.slice(ARCHIVE_PREFIX.length)] = items[k];
    }
    const existing = readMap(PLAN_ARCHIVE_KEY);
    if (Object.keys(wanted).length > 0 || Object.keys(existing).length > 0) {
      const archive: Record<string, unknown> = {};
      for (const k of Object.keys(existing)) if (k in wanted) archive[k] = wanted[k];
      for (const k of newKeys(new Set(Object.keys(archive)), wanted)) archive[k] = wanted[k];
      writeJson(PLAN_ARCHIVE_KEY, archive);
    }
    const current = items.current;
    if (isPlanLike(current)) {
      await savePlanStrict(current as Parameters<typeof savePlanStrict>[0]);
    } else if (!("current" in items)) {
      await clearPlanStrict();
    }
  },
  validate: isPlanLike,
  // The archive map is sync's own and the cloud holds every archive: a corrupt
  // map is dropped and comes back from the cloud in the first merge that follows.
  async repair() {
    if (!isBrokenRaw(PLAN_ARCHIVE_KEY, readRaw(PLAN_ARCHIVE_KEY))) return;
    markStoreBroken("hifzPlan");
    localStorage.removeItem(PLAN_ARCHIVE_KEY);
  },
};

export const SYNC_COLLECTIONS: SyncCollection[] = [
  localObjectArray("notes", "rafiq_notes_v1", isNote, "createdAt"),
  recordMap("bookmarks", "items", "rafiq_bookmarks_v1", (v) => isString(v)),
  stringSet("hiddenVerses", "items", "rafiq_hidden_verses_v1", (k) => !!k),
  localObjectArray("recitationHistory", "rafiq_recitation_history_v1", isSession, "recordedAt"),
  stringSet("azkarFavorites", "items", "azkar:favorites", (k) => !!k),
  quizPresets,
  recordMap("trackerDays", "items", "rafeeq.tracker.days", (v, k) => isDay(k) && isStringArray(v)),
  stringSet("hifzStreakDates", "days", "rafiq_hifz_streak_dates_v1", isDay),
  stringSet("hifzBridgedDates", "days", "rafiq_hifz_streak_freeze_v1", isDay),
  recordMap("hifzSessionCounts", "days", "rafiq_hifz_session_counts_v1", (v, k) => isDay(k) && isStringArray(v)),
  hifzPlan,
  singleValue("hifzFreezePool", "freezePool", FREEZE_POOL_KEY, "json", isFreezePool),
  hifzObject("hifzBest", "rafiq_hifz_best_v1", loadBestPlanStrict, saveBestPlanStrict),
  hifzObject("hifzLatest", "rafiq_hifz_latest_v1", loadLatestPlanStrict, saveLatestPlanStrict),
  hifzObject(
    "hifzReading",
    "rafiq_hifz_reading_v1",
    loadHifzReadingSessionStrict,
    saveHifzReadingSessionStrict,
    clearHifzReadingSessionStrict,
  ),
  settings,
  singleValue("theme", "object", "rafiq_theme_v1", "string", isString),
  singleValue("lang", "object", "rafiq_lang_v1", "string", isString),
  // Saved on every page turn; reading slowly must not mean a full sync per page.
  { ...singleValue("lastPage", "object", "rafiq_last_page_v1", "string", isPageNumber), passive: true },
  singleValue("searchRecents", "object", "rafiq_search_recents_v1", "json", isArray),
  singleValue("trackerSettings", "object", "rafeeq.tracker.settings", "json", isRecord),
  // The engine keeps the earliest date on merge (Task 6).
  singleValue("trackerSince", "object", "rafeeq.tracker.since", "string", isDayString),
  singleValue("trackerWeights", "object", "rafeeq.tracker.weights", "json", isRecord),
];

/** Top-level JSON shape each localStorage store keeps; the string stores (theme, language...) have none. */
const JSON_SHAPES: Record<string, "array" | "record"> = {
  rafiq_notes_v1: "array",
  rafiq_bookmarks_v1: "record",
  rafiq_hidden_verses_v1: "array",
  rafiq_recitation_history_v1: "array",
  "azkar:favorites": "array",
  "rafeeq.tracker.days": "record",
  rafiq_hifz_streak_dates_v1: "array",
  rafiq_hifz_streak_freeze_v1: "array",
  rafiq_hifz_session_counts_v1: "record",
  rafiq_hifz_v2: "record",
  [PLAN_ARCHIVE_KEY]: "record",
  [FREEZE_POOL_KEY]: "record",
  rafiq_hifz_best_v1: "record",
  rafiq_hifz_latest_v1: "record",
  rafiq_hifz_reading_v1: "record",
  rafiq_settings_v1: "record",
  rafiq_search_recents_v1: "array",
  "rafeeq.tracker.settings": "record",
  "rafeeq.tracker.weights": "record",
};

/** True when `raw`, a value stored under `key`, is not JSON of the shape its collection keeps. */
export function isBrokenRaw(key: string, raw: string | null): boolean {
  const shape = JSON_SHAPES[key];
  if (!shape || raw === null) return false;
  try {
    const parsed = JSON.parse(raw);
    return shape === "array" ? !Array.isArray(parsed) : !isRecord(parsed);
  } catch {
    return true;
  }
}

export function collectionForStorageKey(key: string): SyncCollection | undefined {
  return SYNC_COLLECTIONS.find((c) => c.storageKeys.includes(key));
}
