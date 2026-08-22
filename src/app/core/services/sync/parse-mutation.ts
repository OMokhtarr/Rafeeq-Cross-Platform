/**
 * THE WIRE BOUNDARY.
 *
 * Every snake_case field name from the Content Sync API appears here and
 * nowhere else. The documentation ships no example response bodies, so these
 * names were verified against the live API on 2026-08-21 — see
 * docs/superpowers/specs/2026-08-21-content-sync-wire-format.md.
 *
 * ROW-level mutations were never observed in that session, so recordType,
 * recordKey and data are the one part still inferred. If a row shape surprise
 * appears, it is fixable here alone.
 */

import {
  MutationType,
  SYNC_GROUPS,
  SyncGroup,
  SyncMutation,
  SyncPage,
} from "./content-sync.types";

const KNOWN_TYPES: MutationType[] = [
  "RESOURCE_CREATE",
  "RESOURCE_INVALIDATE",
  "RESOURCE_DELETE",
  "RESOURCE_UPDATE",
  "ROW_CREATE",
  "ROW_UPDATE",
  "ROW_DELETE",
];

function isSyncGroup(v: unknown): v is SyncGroup {
  return typeof v === "string" && (SYNC_GROUPS as string[]).includes(v);
}

/**
 * Unwrap the `sync` envelope and map one page to the internal shape.
 * Mutations from groups this app does not handle are dropped: they would
 * become rows no adapter could ever read.
 */
export function parseSyncPage(body: unknown): SyncPage {
  const root = (body ?? {}) as Record<string, any>;
  const sync = (root.sync ?? root) as Record<string, any>;
  const raw = Array.isArray(sync.mutations) ? sync.mutations : [];

  const mutations: SyncMutation[] = [];
  for (const m of raw) {
    if (!isSyncGroup(m?.resource_group)) continue;
    if (!KNOWN_TYPES.includes(m?.type)) continue;
    mutations.push({
      sequence: Number(m.sequence ?? 0),
      type: m.type as MutationType,
      resourceGroup: m.resource_group,
      resourceId: Number(m.resource_id),
      recordType: m.record_type ?? null,
      recordKey: m.record_key ?? null,
      data: m.data ?? null,
      snapshotUrl: m.snapshot_url ?? null,
    });
  }

  return {
    mutations,
    hasMore: Boolean(sync.has_more),
    nextSyncToken: sync.next_sync_token ?? null,
    syncUntilSequence: Number(sync.sync_until_sequence ?? 0),
  };
}

/**
 * snapshot_url comes back as `/api/v4/resources/snapshots/...` while our base
 * path is `/content/api/v4`. Joining it to the base naively produces
 * `/content/api/v4/api/v4/...`, which 404s.
 */
export function resolveSnapshotUrl(raw: string, apiBase: string): string {
  if (/^https?:\/\//i.test(raw)) return raw;
  const origin = new URL(apiBase).origin;
  const basePath = new URL(apiBase).pathname.replace(/\/$/, "");
  return origin + raw.replace(/^\/api\/v4/, basePath);
}

/** The composite key the API's ROW mutations address a record by. */
export function rowId(
  group: SyncGroup,
  resourceId: number,
  recordType: string,
  recordKey: string,
): string {
  return `${group}:${resourceId}:${recordType}:${recordKey}`;
}
