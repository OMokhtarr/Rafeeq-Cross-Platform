/**
 * Local change tracking.
 *
 * The app has many existing writers, so sync notices edits by wrapping
 * `Storage.prototype.setItem/removeItem` once. A write to a key owned by a sync
 * collection records the collection's last edit time and pings the listener
 * (the sync engine debounces on it). Times persist in localStorage, so an edit
 * made offline keeps its time across restarts.
 *
 * `localStorage.clear()` is deliberately not hooked: the app never calls it
 * on synced data, and a wipe is not an edit the user wants pushed to the cloud.
 * Preferences-backed stores (quiz presets) are outside localStorage; their
 * writer calls `markDirty(key)` directly.
 */

import { stableStringify } from "./merge";

export { stableStringify };

const DIRTY_KEY = "rafiq_sync_dirty_v1";

type DirtyTimes = Record<string, string>;

const listeners = new Set<() => void>();
let suppressDepth = 0;
let installed = false;
let rawSetItem: Storage["setItem"] | null = null;

/** Lazy: `collections` imports the quiz presets module, which calls `markDirty` from here. */
function collectionIdFor(key: string): string | undefined {
  const mod = require("./collections") as typeof import("./collections");
  return mod.collectionForStorageKey(key)?.id;
}

function readDirty(): DirtyTimes {
  try {
    const parsed = JSON.parse(localStorage.getItem(DIRTY_KEY) ?? "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeDirty(times: DirtyTimes): void {
  const json = JSON.stringify(times);
  try {
    // Bypass the hook: this key must never record itself.
    (rawSetItem ?? Storage.prototype.setItem).call(localStorage, DIRTY_KEY, json);
  } catch {
    // Best effort: losing a dirty time only delays a push, it never loses data.
  }
}

function record(key: string): void {
  try {
    if (suppressDepth > 0 || key === DIRTY_KEY) return;
    const id = collectionIdFor(key);
    if (!id) return;
    const times = readDirty();
    times[id] = new Date().toISOString();
    writeDirty(times);
    listeners.forEach((cb) => {
      try {
        cb();
      } catch {
        // A faulty listener must not break the caller's write.
      }
    });
  } catch {
    // Recording must never throw into the app's own write.
  }
}

/** Idempotent. Wraps the prototype, which is what jsdom's and browsers' localStorage use. */
export function installWriteHook(): void {
  if (installed) return;
  installed = true;
  const proto = Storage.prototype;
  const origSet = proto.setItem;
  const origRemove = proto.removeItem;
  rawSetItem = origSet;
  proto.setItem = function (this: Storage, key: string, value: string): void {
    origSet.call(this, key, value);
    if (this === localStorage) record(key);
  };
  proto.removeItem = function (this: Storage, key: string): void {
    origRemove.call(this, key);
    if (this === localStorage) record(key);
  };
}

/** For stores outside localStorage (e.g. Preferences-backed quiz presets). */
export function markDirty(storageKey: string): void {
  record(storageKey);
}

export function onLocalChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/**
 * Writes made while `fn` runs are not recorded (sync applies remote data inside it).
 * Trade-off: suppression is global and `fn` is async, so an unrelated write made
 * during the await window is also skipped.
 */
export async function suppressHook<T>(fn: () => Promise<T>): Promise<T> {
  suppressDepth++;
  try {
    return await fn();
  } finally {
    suppressDepth--;
  }
}

/** ISO time of the collection's last local edit, or null when clean. */
export function dirtyTime(collectionId: string): string | null {
  return readDirty()[collectionId] ?? null;
}

/** Clears only if no write happened after `upTo` (compared as instants). */
export function clearDirty(collectionId: string, upTo: string): void {
  const times = readDirty();
  const recorded = times[collectionId];
  if (!recorded) return;
  if (Date.parse(recorded) > Date.parse(upTo)) return;
  delete times[collectionId];
  writeDirty(times);
}

/** Keys whose stable JSON differs from the snapshot (or are new), and snapshot keys now absent. */
export function diffAgainstSnapshot(
  current: Record<string, unknown>,
  snapshot: Record<string, string>,
): { changed: string[]; removed: string[] } {
  const changed = Object.keys(current).filter(
    (k) => snapshot[k] === undefined || stableStringify(current[k]) !== snapshot[k],
  );
  const removed = Object.keys(snapshot).filter((k) => !(k in current));
  return { changed, removed };
}
