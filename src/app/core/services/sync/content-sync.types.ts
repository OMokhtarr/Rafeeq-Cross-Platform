/**
 * Shared Content Sync types.
 *
 * Field names here are the app's internal camelCase shape. The snake_case wire
 * shape is confined to parse-mutation.ts — see
 * docs/superpowers/specs/2026-08-21-content-sync-wire-format.md.
 */

/** Resource groups Rafeeq syncs. The API also serves translations,
 *  word_by_word_translations and articles; none are used by this app. */
export type SyncGroup = "tafsirs" | "recitations";

export const SYNC_GROUPS: SyncGroup[] = ["tafsirs", "recitations"];

export type MutationType =
  | "RESOURCE_CREATE"
  | "RESOURCE_INVALIDATE"
  | "RESOURCE_DELETE"
  | "RESOURCE_UPDATE"
  | "ROW_CREATE"
  | "ROW_UPDATE"
  | "ROW_DELETE";

export interface SyncMutation {
  sequence: number;
  type: MutationType;
  resourceGroup: SyncGroup;
  resourceId: number;
  /** Null on RESOURCE-level mutations. */
  recordType: string | null;
  /** Null on RESOURCE-level mutations. */
  recordKey: string | null;
  /** Row payload on ROW-level mutations; null otherwise. */
  data: unknown;
  /** Relative path; pass through resolveSnapshotUrl() before fetching. */
  snapshotUrl: string | null;
}

export interface SyncPage {
  mutations: SyncMutation[];
  hasMore: boolean;
  nextSyncToken: string | null;
  syncUntilSequence: number;
}

/** One stored record. `id` is the composite key from rowId(). */
export interface SyncRow {
  id: string;
  resourceGroup: SyncGroup;
  resourceId: number;
  recordType: string;
  recordKey: string;
  data: unknown;
  sequence: number;
}

export interface TrackedResource {
  group: SyncGroup;
  resourceId: number;
  /** Epoch ms of the last successful snapshot load; null if never completed. */
  bootstrappedAt: number | null;
}

export interface SyncState {
  /** next_sync_token from the last COMPLETED run. Never advanced mid-run. */
  syncToken: string | null;
  lastSyncedAt: number | null;
  lastAttemptAt: number | null;
  lastError: string | null;
  trackedResources: TrackedResource[];
}

export const EMPTY_SYNC_STATE: SyncState = {
  syncToken: null,
  lastSyncedAt: null,
  lastAttemptAt: null,
  lastError: null,
  trackedResources: [],
};
