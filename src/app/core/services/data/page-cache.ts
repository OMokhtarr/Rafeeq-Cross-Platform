/**
 * Invalidating the derived page cache.
 *
 * getPage() stores verses in the IDB `pages` store ALREADY MERGED with the
 * layout that was current when they were fetched, and reads that store before
 * it consults the layout row. So when Content Sync replaces mushafs:19, those
 * entries must be dropped or the old layout is served forever.
 *
 * This lives outside quran.service.ts so the mushafs adapter can call it
 * without importing the data layer (which would pull the search corpus and the
 * recite matcher into the sync module, and create an import cycle).
 */

import { idb } from "../storage/idb.service";

type CacheListener = () => void;

const listeners = new Set<CacheListener>();

/**
 * Register a hook run whenever the derived cache is dropped. quran.service
 * uses this to clear its in-memory LRU, which IDB knows nothing about.
 */
export function onDerivedPageCacheCleared(fn: CacheListener): void {
  listeners.add(fn);
}

/**
 * Drop every cached page. Never throws: this runs inside a sync, and failing
 * to clear must not abort the run and leave the checkpoint unadvanced — the
 * next sync would then replay the same mutations.
 */
export async function clearDerivedPageCache(): Promise<void> {
  try {
    await idb.clear("pages");
  } catch {
    // Best effort. A surviving stale page is corrected on the next repair or
    // cache-version bump; an aborted sync is worse.
  }
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // A misbehaving listener must not stop the others.
    }
  }
}
