import { getSupabase } from "../auth/supabase.client";
import type { SyncRow } from "./types";

/** The network is unreachable; the caller should retry later. */
export class SyncOfflineError extends Error {}
/** The server (or configuration) rejected the request. */
export class SyncError extends Error {}

const PULL_PAGE_SIZE = 500;
/** The server rejects >500 items and caps returned rows; never raise this. */
const PUSH_CHUNK_SIZE = 200;
/** Matches the server's CHECK on pg_column_size(value). */
const MAX_VALUE_BYTES = 262144;
/** >= the `authenticated` statement_timeout (8 s), so late-committed rows are re-read. */
const CURSOR_OVERLAP_MS = 10_000;

interface RemoteError {
  message?: string;
  code?: string;
}

const NETWORK_MESSAGE = /failed to fetch|fetch failed|networkerror|network request failed|load failed/i;

/** supabase-js returns fetch failures as `{ error }` with status 0, not as a throw. */
function toSyncError(err: unknown, status?: number): Error {
  if (err instanceof SyncError || err instanceof SyncOfflineError) return err;
  if (err instanceof TypeError) return new SyncOfflineError(err.message);
  const e = (err ?? {}) as RemoteError;
  const message = e.message ?? String(err);
  if (status === 0 || NETWORK_MESSAGE.test(message)) {
    return new SyncOfflineError(message);
  }
  return new SyncError(e.code ? `${message} (${e.code})` : message);
}

function requireClient() {
  const client = getSupabase();
  if (!client) throw new SyncError("Supabase is not configured");
  return client;
}

function toSyncRow(r: SyncRow & { user_id?: string }): SyncRow {
  return {
    collection: r.collection,
    item_key: r.item_key,
    value: r.value,
    edited_at: r.edited_at,
    deleted: r.deleted,
    server_at: r.server_at,
  };
}

/** Pulls every row changed after `cursor` (null = everything). */
export async function pullSince(
  cursor: string | null
): Promise<{ rows: SyncRow[]; cursor: string | null }> {
  const client = requireClient();
  const rows: SyncRow[] = [];
  let after = cursor;
  try {
    for (;;) {
      let query = client.from("sync_items").select("*");
      if (after !== null) query = query.gt("server_at", after);
      const { data, error, status } = await query
        .order("server_at")
        .limit(PULL_PAGE_SIZE);
      if (error) throw toSyncError(error, status);
      const page = (data ?? []) as SyncRow[];
      rows.push(...page.map(toSyncRow));
      if (page.length < PULL_PAGE_SIZE) break;
      // Exact PostgREST string: a JS Date round-trip would drop microseconds.
      after = page[page.length - 1].server_at as string;
    }
  } catch (err) {
    throw toSyncError(err);
  }
  if (rows.length === 0) return { rows, cursor };
  const maxMs = Math.max(...rows.map((r) => Date.parse(r.server_at as string)));
  return { rows, cursor: new Date(maxMs - CURSOR_OVERLAP_MS).toISOString() };
}

function withinSizeLimit(row: SyncRow): boolean {
  const bytes = new TextEncoder().encode(JSON.stringify(row.value)).length;
  if (bytes <= MAX_VALUE_BYTES) return true;
  console.warn(
    `[sync] skipping oversized item ${row.collection}/${row.item_key} (${bytes} bytes)`
  );
  return false;
}

/** Pushes local rows through `sync_push`; returns the rows the server stored. */
export async function push(rows: SyncRow[]): Promise<SyncRow[]> {
  const client = requireClient();
  const sendable = rows.filter(withinSizeLimit);
  const stored: SyncRow[] = [];
  try {
    for (let i = 0; i < sendable.length; i += PUSH_CHUNK_SIZE) {
      const { data, error, status } = await client.rpc("sync_push", {
        items: sendable.slice(i, i + PUSH_CHUNK_SIZE),
      });
      if (error) throw toSyncError(error, status);
      stored.push(...((data ?? []) as SyncRow[]).map(toSyncRow));
    }
  } catch (err) {
    throw toSyncError(err);
  }
  return stored;
}
