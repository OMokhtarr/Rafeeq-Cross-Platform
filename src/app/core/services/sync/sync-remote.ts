import { getSupabase } from "../auth/supabase.client";
import type { SyncRow } from "./types";

/** The network is unreachable; the caller should retry later. */
export class SyncOfflineError extends Error {}
/** The server (or configuration) rejected the request. */
export class SyncError extends Error {}

const PULL_PAGE_SIZE = 500;
/** The server rejects >500 items and caps returned rows; never raise this. */
const PUSH_CHUNK_SIZE = 200;
/** A big request can hit the statement timeout (57014) or a 413 and then fail every run. */
const PUSH_CHUNK_MAX_BYTES = 2 * 1024 * 1024;
/**
 * Client-side cap on the JSON text of a value. The server CHECK is 1 MB of
 * jsonb, which is roughly 2x the text for number-heavy objects.
 */
const MAX_VALUE_BYTES = 524288;
const MAX_COLLECTION_LENGTH = 64;
const MAX_ITEM_KEY_LENGTH = 256;
/** >= the `authenticated` statement_timeout (8 s), so late-committed rows are re-read. */
const CURSOR_OVERLAP_MS = 10_000;
/**
 * This row can never be stored, so it must not fail the rows around it on every run:
 * check_violation, string_data_right_truncation, invalid_datetime_format,
 * datetime_field_overflow, not_null_violation, untranslatable_character (jsonb
 * rejects \u0000).
 */
const POISON_CODES = ["23514", "22001", "22007", "22008", "23502", "22P05"];

interface RemoteError {
  message?: string;
  code?: string;
}

interface RemoteResult {
  data: unknown;
  error: RemoteError | null;
  status?: number;
}

const NETWORK_MESSAGE = /failed to fetch|fetch failed|networkerror|network request failed|load failed/i;

/** supabase-js returns fetch failures as `{ error }` with status 0, not as a throw. */
function toSyncError(err: RemoteError, status?: number): Error {
  const message = err.message ?? String(err);
  if (status === 0 || NETWORK_MESSAGE.test(message)) {
    return new SyncOfflineError(message);
  }
  return new SyncError(err.code ? `${message} (${err.code})` : message);
}

function requireClient() {
  const client = getSupabase();
  if (!client) throw new SyncError("Supabase is not configured");
  return client;
}

/** Awaits one client call; only a TypeError thrown by the call itself means offline. */
async function callClient(call: () => PromiseLike<unknown>): Promise<RemoteResult> {
  try {
    return (await call()) as RemoteResult;
  } catch (err) {
    if (err instanceof TypeError) throw new SyncOfflineError(err.message);
    throw new SyncError(err instanceof Error ? err.message : String(err));
  }
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

function rowId(r: SyncRow): string {
  return `${r.collection}\u0000${r.item_key}\u0000${r.server_at}`;
}

/** Pulls every row changed after `cursor` (null = everything). */
export async function pullSince(
  cursor: string | null
): Promise<{ rows: SyncRow[]; cursor: string | null }> {
  const client = requireClient();
  const rows: SyncRow[] = [];
  const seen = new Set<string>();
  let after = cursor;
  let firstPage = true;
  for (;;) {
    let query = client.from("sync_items").select("*");
    if (after !== null) {
      // Later pages use gte so rows tied on server_at across the boundary are
      // not lost; the duplicates are dropped below.
      query = firstPage
        ? query.gt("server_at", after)
        : query.gte("server_at", after);
    }
    const { data, error, status } = await callClient(() =>
      query.order("server_at").limit(PULL_PAGE_SIZE)
    );
    if (error) throw toSyncError(error, status);
    const page = ((data ?? []) as SyncRow[]).map(toSyncRow);
    const before = rows.length;
    for (const row of page) {
      const id = rowId(row);
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push(row);
    }
    if (page.length < PULL_PAGE_SIZE) break;
    if (rows.length === before) {
      throw new SyncError("Sync pull made no progress (page full of ties)");
    }
    // Exact PostgREST string: a JS Date round-trip would drop microseconds.
    after = page[page.length - 1].server_at as string;
    firstPage = false;
  }
  if (rows.length === 0) return { rows, cursor };
  const lastMs = Date.parse(rows[rows.length - 1].server_at as string);
  if (Number.isNaN(lastMs)) throw new SyncError("Unparseable server_at in pulled rows");
  return { rows, cursor: new Date(lastMs - CURSOR_OVERLAP_MS).toISOString() };
}

const jsonBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

function isPushable(row: SyncRow): boolean {
  const { collection, item_key } = row;
  if (
    collection.length < 1 ||
    collection.length > MAX_COLLECTION_LENGTH ||
    item_key.length < 1 ||
    item_key.length > MAX_ITEM_KEY_LENGTH
  ) {
    console.warn(`[sync] skipping item with out-of-range key ${collection}/${item_key}`);
    return false;
  }
  const bytes = jsonBytes(row.value);
  if (bytes > MAX_VALUE_BYTES) {
    console.warn(`[sync] skipping oversized item ${collection}/${item_key} (${bytes} bytes)`);
    return false;
  }
  return true;
}

function toPushItem(r: SyncRow) {
  return {
    collection: r.collection,
    item_key: r.item_key,
    value: r.value,
    edited_at: r.edited_at,
    deleted: r.deleted,
    // sync_push keeps a row stored after this one; servers before it ignore the field.
    ...(r.base_server_at ? { base_server_at: r.base_server_at } : {}),
  };
}

/** Rows in order, at most PUSH_CHUNK_SIZE and PUSH_CHUNK_MAX_BYTES per chunk; a larger single row goes alone. */
function toChunks(rows: SyncRow[]): SyncRow[][] {
  const chunks: SyncRow[][] = [];
  let chunk: SyncRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    const size = jsonBytes(toPushItem(row));
    if (chunk.length > 0 && (chunk.length >= PUSH_CHUNK_SIZE || bytes + size > PUSH_CHUNK_MAX_BYTES)) {
      chunks.push(chunk);
      chunk = [];
      bytes = 0;
    }
    chunk.push(row);
    bytes += size;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

async function pushChunk(
  client: NonNullable<ReturnType<typeof getSupabase>>,
  items: SyncRow[]
): Promise<{ stored: SyncRow[]; error: RemoteError | null; status?: number }> {
  const { data, error, status } = await callClient(() =>
    client.rpc("sync_push", { items: items.map(toPushItem) })
  );
  if (error) return { stored: [], error, status };
  return { stored: ((data ?? []) as SyncRow[]).map(toSyncRow), error: null };
}

/** Pushes local rows through `sync_push`; returns the rows the server stored. */
export async function push(rows: SyncRow[]): Promise<SyncRow[]> {
  const client = requireClient();
  const stored: SyncRow[] = [];
  for (const chunk of toChunks(rows.filter(isPushable))) {
    const result = await pushChunk(client, chunk);
    if (!result.error) {
      stored.push(...result.stored);
      continue;
    }
    if (!POISON_CODES.includes(result.error.code ?? "")) {
      throw toSyncError(result.error, result.status);
    }
    // One bad row rolls back the whole chunk: find the poison item(s).
    for (const item of chunk) {
      const single = await pushChunk(client, [item]);
      if (!single.error) {
        stored.push(...single.stored);
      } else if (POISON_CODES.includes(single.error.code ?? "")) {
        console.warn(
          `[sync] server rejected ${item.collection}/${item.item_key} (${single.error.code}); skipping`
        );
      } else {
        throw toSyncError(single.error, single.status);
      }
    }
  }
  return stored;
}
