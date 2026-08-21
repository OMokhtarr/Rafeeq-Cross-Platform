/**
 * Content Sync state, persisted in IndexedDB.
 *
 * IDB rather than localStorage: this describes the rows in `content_sync` and
 * must live and die with them. A half-written state here is a correctness bug,
 * not a lost preference.
 */

import { idb } from "../storage/idb.service";
import {
  EMPTY_SYNC_STATE,
  SyncGroup,
  SyncState,
  TrackedResource,
} from "./content-sync.types";

const META_KEY = "state";

interface StateRecord extends SyncState {
  key: string;
}

let writeQueue: Promise<unknown> = Promise.resolve();

/**
 * Serializes read-modify-write cycles. idb.get and idb.put each open their own
 * transaction, so concurrent mutators would otherwise interleave and lose a
 * write — bootstrapResource() has no in-flight guard and reciter tracking is
 * fire-and-forget, so overlap is reachable in normal use.
 */
function enqueue<T>(op: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(op, op);
  writeQueue = next.catch(() => {});
  return next;
}

export async function readSyncState(): Promise<SyncState> {
  const rec = await idb.get<StateRecord>("sync_meta", META_KEY);
  if (!rec) return { ...EMPTY_SYNC_STATE };
  return {
    syncToken: rec.syncToken ?? null,
    lastSyncedAt: rec.lastSyncedAt ?? null,
    lastAttemptAt: rec.lastAttemptAt ?? null,
    lastError: rec.lastError ?? null,
    trackedResources: rec.trackedResources ?? [],
  };
}

export async function writeSyncState(next: SyncState): Promise<void> {
  await idb.put<StateRecord>("sync_meta", { key: META_KEY, ...next });
}

/**
 * Add a resource to the sync scope. Tracking is tied to data, not to the
 * user's current selection: a resource stays tracked while its rows are on
 * disk, so corrections keep arriving for content the user can still open.
 */
export async function trackResource(
  group: SyncGroup,
  resourceId: number,
): Promise<void> {
  return enqueue(async () => {
    const state = await readSyncState();
    if (state.trackedResources.some((r) => r.group === group && r.resourceId === resourceId)) {
      return;
    }
    await writeSyncState({
      ...state,
      trackedResources: [
        ...state.trackedResources,
        { group, resourceId, bootstrappedAt: null },
      ],
    });
  });
}

/** Drop a resource from the sync scope. Call only after deleting its rows. */
export async function untrackResource(
  group: SyncGroup,
  resourceId: number,
): Promise<void> {
  return enqueue(async () => {
    const state = await readSyncState();
    await writeSyncState({
      ...state,
      trackedResources: state.trackedResources.filter(
        (r) => !(r.group === group && r.resourceId === resourceId),
      ),
    });
  });
}

/** Mark a resource's snapshot as fully loaded. */
export async function markBootstrapped(
  group: SyncGroup,
  resourceId: number,
): Promise<void> {
  return enqueue(async () => {
    const state = await readSyncState();
    await writeSyncState({
      ...state,
      trackedResources: state.trackedResources.map((r) =>
        r.group === group && r.resourceId === resourceId
          ? { ...r, bootstrappedAt: Date.now() }
          : r,
      ),
    });
  });
}

export async function isTracked(
  group: SyncGroup,
  resourceId: number,
): Promise<boolean> {
  const state = await readSyncState();
  return state.trackedResources.some(
    (r) => r.group === group && r.resourceId === resourceId,
  );
}

/**
 * The API's `resources` parameter, e.g. "tafsirs:169;recitations:7".
 * Required by the endpoint — it returns 422 without it. An empty string means
 * the caller must skip the run, never "sync everything".
 */
export function resourcesFilter(tracked: TrackedResource[]): string {
  return tracked.map((r) => `${r.group}:${r.resourceId}`).join(";");
}
