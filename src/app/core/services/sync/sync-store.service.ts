/**
 * The Content Sync row store.
 *
 * One uniform shape for every resource group, mirroring the composite key the
 * API's ROW mutations address records by. The engine writes here knowing
 * nothing about tafsirs vs recitations; adapters read in their own shape.
 */

import { idb } from "../storage/idb.service";
import { SyncGroup, SyncRow } from "./content-sync.types";
import { rowId } from "./parse-mutation";

/** Chunked internally by idb.bulkPut — a tafsir runs to 6,236 rows. */
export async function putRows(rows: SyncRow[]): Promise<void> {
  if (rows.length === 0) return;
  await idb.bulkPut("content_sync", rows);
}

export async function deleteRow(
  group: SyncGroup,
  resourceId: number,
  recordType: string,
  recordKey: string,
): Promise<void> {
  await idb.delete("content_sync", rowId(group, resourceId, recordType, recordKey));
}

export async function readResourceRows(
  group: SyncGroup,
  resourceId: number,
): Promise<SyncRow[]> {
  return idb.getAllByIndex<SyncRow>("content_sync", "by_resource", [
    group,
    resourceId,
  ]);
}

export async function countResourceRows(
  group: SyncGroup,
  resourceId: number,
): Promise<number> {
  return (await readResourceRows(group, resourceId)).length;
}

/**
 * "Replace all local rows" — the semantics of RESOURCE_CREATE and
 * RESOURCE_INVALIDATE. Deletes first so a resource that shrank does not leave
 * orphaned rows behind.
 */
export async function replaceResourceRows(
  group: SyncGroup,
  resourceId: number,
  rows: SyncRow[],
): Promise<void> {
  await purgeResource(group, resourceId);
  await putRows(rows);
}

export async function purgeResource(
  group: SyncGroup,
  resourceId: number,
): Promise<void> {
  const existing = await readResourceRows(group, resourceId);
  for (const r of existing) {
    await idb.delete("content_sync", r.id);
  }
}
