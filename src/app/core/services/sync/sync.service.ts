/**
 * Pro sync engine.
 *
 * One run reads the local stores, pulls the cloud's changes since the cursor,
 * reconciles every key of every collection against the snapshot of the last
 * synced state, writes the remote winners into the local stores, then pushes the
 * local winners. The snapshot is saved only after the push succeeds, so a run
 * that dies after writing locally leaves the dirty times and the old snapshot
 * behind and the next run pushes again.
 *
 * Per key, "changed" means different from the snapshot. A side that alone
 * changed wins wholesale; the per-kind merges run only when both sides changed
 * (there is no common ancestor to merge against otherwise). Day sets always
 * union. Each collection stays in first-merge mode (new device, new user, reset)
 * until it completes one merge: it has no snapshot, both sides count as changed
 * and nothing is ever deleted.
 *
 * A collection whose store can't be read or written is skipped; the others
 * finish and save, and the run reports an error. The cursor still moves, so the
 * skipped collection is pulled from the start once it can be read again. A store
 * the app changed during the run is skipped the same way, but silently: that
 * edit already schedules another run.
 *
 * The server keeps the newer `edited_at`. A pushed key whose stored row comes
 * back different lost to the cloud; it is reconciled once more against that row
 * in the same run. A pushed key missing from the stored rows was rejected and
 * is not pushed again until its local value changes.
 */

import type { HifzPlan } from "../../../features/hifz/hifz.service";
import type { FreezePool } from "../storage/streak-freeze.service";
import { ARCHIVE_PREFIX, OWN_TIME, SYNC_COLLECTIONS, type SyncCollection } from "./collections";
import { SYNC_APPLIED_EVENT } from "./sync-events";
import { clearDirty, dirtyTime, suppressHook } from "./local-changes";
import { mergeFreezePool, mergeHifzPlan, mergeVersioned, stableStringify } from "./merge";
import { pullSince, push, SyncOfflineError } from "./sync-remote";
import type { SyncRow, Versioned } from "./types";

export type SyncResult =
  | { status: "synced"; appliedCollections: string[] }
  | { status: "offline" }
  | { status: "error"; message: string };

export { SYNC_APPLIED_EVENT };

const STATE_KEY = "rafiq_sync_state_v1";
const EPOCH = new Date(0).toISOString();
const CURRENT_PLAN = "current";
/** The app's own change events, and the collections whose arrival should fire them. */
const DISPLAY_EVENTS: [string, string[]][] = [
  ["rafiq-settings-changed", ["settings"]],
  ["hifz-streak-changed", ["hifzStreakDates", "hifzBridgedDates", "hifzSessionCounts", "hifzFreezePool"]],
];

/** collectionId -> itemKey -> fingerprint of the stable JSON. */
type KeyedFingerprints = Record<string, Record<string, string>>;

interface SyncState {
  userId: string;
  cursor: string | null;
  snapshot: KeyedFingerprints;
  /** Collections that completed a merge for this user; every other one is in first merge. */
  merged: string[];
  /** Collections the last run skipped after moving the cursor; they need a full pull. */
  behind: string[];
  /** Rows the server refused, as `rejectionKey`; not pushed again until the item changes. */
  rejected: KeyedFingerprints;
  /** When the last run for this user finished; null before the first one. */
  lastSyncedAt: string | null;
}

// ─── State ────────────────────────────────────────────────────────────────────

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

const isKeyedFingerprints = (v: unknown): v is KeyedFingerprints =>
  isRecord(v) &&
  Object.values(v).every((m) => isRecord(m) && Object.values(m).every((s) => typeof s === "string"));

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

function loadState(userId: string): SyncState {
  let saved: unknown = null;
  try {
    saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null");
  } catch {
    saved = null;
  }
  if (!isSavedState(saved, userId)) {
    return { userId, cursor: null, snapshot: {}, merged: [], behind: [], rejected: {}, lastSyncedAt: null };
  }
  const rejected = isKeyedFingerprints(saved.rejected) ? saved.rejected : {};
  const lastSyncedAt = typeof saved.lastSyncedAt === "string" ? saved.lastSyncedAt : null;
  return { ...saved, rejected, lastSyncedAt };
}

/** When the last sync for `userId` finished, or null (never synced, another user's state, or after a reset). */
export function getLastSyncedAt(userId: string): string | null {
  return loadState(userId).lastSyncedAt;
}

function isSavedState(v: unknown, userId: string): v is SyncState {
  return (
    isRecord(v) &&
    v.userId === userId &&
    (v.cursor === null || typeof v.cursor === "string") &&
    isKeyedFingerprints(v.snapshot) &&
    isStringList(v.merged) &&
    isStringList(v.behind)
  );
}

/** Bumped by resetSyncState so a run already in flight saves its state as a first merge. */
let resets = 0;

/** Forces the next sync to be a first merge: nothing local is turned into a delete. */
export function resetSyncState(): void {
  resets++;
  try {
    const saved = JSON.parse(localStorage.getItem(STATE_KEY) ?? "null");
    if (isRecord(saved)) localStorage.setItem(STATE_KEY, JSON.stringify({ ...saved, merged: [], lastSyncedAt: null }));
  } catch {
    try {
      localStorage.removeItem(STATE_KEY);
    } catch {
      // Nothing more can be done; the in-flight guard still covers a running sync.
    }
  }
}

// ─── Values ───────────────────────────────────────────────────────────────────

/** An unparseable time sorts before every real one. */
function instant(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
}

/** Stable JSON of a live value; undefined for a delete or an absent side. */
const contentOf = (v: Versioned | undefined): string | undefined =>
  v && !v.deleted ? stableStringify(v.value) : undefined;

const sameContent = (a: Versioned | undefined, b: Versioned | undefined): boolean =>
  contentOf(a) === contentOf(b);

const fromRow = (row: SyncRow): Versioned => ({ value: row.value, editedAt: row.edited_at, deleted: row.deleted });

/** cyrb53: a small non-crypto 53-bit string hash. */
function hash53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Saved state only ever compares content for equality, so it keeps this instead
 * of the JSON: a second full copy of the user's data would crowd localStorage,
 * and the app's own writers lose edits silently once it is full.
 */
const fingerprint = (json: string): string => `${hash53(json).toString(36)}:${json.length}`;

/** Fingerprint of a live value; undefined for a delete or an absent side. */
const snapshotOf = (v: Versioned | undefined): string | undefined => {
  const json = contentOf(v);
  return json === undefined ? undefined : fingerprint(json);
};

const rejectionKey = (row: SyncRow): string => fingerprint(stableStringify([row.deleted, row.value]));

const rowId = (collection: string, key: string): string => `${collection}\u0000${key}`;

// ─── Per-collection run ───────────────────────────────────────────────────────

interface CollectionRun {
  c: SyncCollection;
  firstMerge: boolean;
  dirtyAt: string | null;
  /** The store as last read (or written) by this run. */
  stored: Record<string, unknown>;
  /** What the store should hold: `stored` with the remote winners applied. */
  items: Record<string, unknown>;
  /** The snapshot this run diffs against (empty in first-merge mode). */
  base: Record<string, string>;
  /** The snapshot to save if the run succeeds. */
  snapshot: Record<string, string>;
  rejected: Record<string, string>;
  /** Keys whose remote value won this round: the store must be written. */
  applied: Set<string>;
  /** Rows to push this round, by item key. */
  outgoing: Map<string, SyncRow>;
  /** Storage failed or changed under the run: nothing of it is saved. */
  failed: boolean;
  /** A push lost twice: keep its old snapshot entry and dirty time for the next run. */
  unsettled: boolean;
}

interface Decision {
  winner: Versioned;
  pushLocal: boolean;
  applyRemote: boolean;
  archived?: HifzPlan;
}

/** This device's side of `key`: a valid item, a delete, or undefined (absent or invalid). */
function localSide(r: CollectionRun, key: string): Versioned | undefined {
  if (key in r.items) {
    const value = r.items[key];
    if (!r.c.validate(value, key)) return undefined;
    const field = OWN_TIME[r.c.id];
    const own = field && isRecord(value) && typeof value[field] === "string" ? (value[field] as string) : null;
    // An item's own edit time beats the collection-wide dirty time, which a
    // later edit of a different item would otherwise lend to this one.
    const editedAt = own && !Number.isNaN(Date.parse(own)) ? own : r.dirtyAt ?? EPOCH;
    return { value, editedAt, deleted: false };
  }
  if (!r.firstMerge && r.base[key] !== undefined) {
    return { value: null, editedAt: r.dirtyAt ?? EPOCH, deleted: true };
  }
  return undefined;
}

/** hifzPlan's `current`, the freeze pool and trackerSince merge their own way when both sides are live. */
function customMerge(r: CollectionRun, key: string, local: Versioned, remote: Versioned): Decision | null {
  if (local.deleted || remote.deleted) return null;
  const localNewer = instant(local.editedAt) > instant(remote.editedAt);
  const editedAt = localNewer ? local.editedAt : remote.editedAt;
  let value: unknown;
  let archived: HifzPlan | undefined;
  if (r.c.kind === "hifzPlan" && key === CURRENT_PLAN) {
    const [newer, older] = localNewer ? [local, remote] : [remote, local];
    const merged = mergeHifzPlan(newer.value as HifzPlan, older.value as HifzPlan);
    value = merged.current;
    archived = merged.archived ?? undefined;
  } else if (r.c.kind === "freezePool") {
    value = mergeFreezePool(local.value as FreezePool, remote.value as FreezePool);
  } else if (r.c.id === "trackerSince") {
    value = (local.value as string) < (remote.value as string) ? local.value : remote.value;
  } else {
    return null;
  }
  const winner: Versioned = { value, editedAt, deleted: false };
  return {
    winner,
    pushLocal: !sameContent(winner, remote),
    applyRemote: !sameContent(winner, local),
    archived,
  };
}

function decide(
  r: CollectionRun,
  key: string,
  local: Versioned | undefined,
  remote: Versioned | undefined,
  localChanged: boolean,
  remoteChanged: boolean,
): Decision | null {
  if (!localChanged && !remoteChanged) return null;
  // Day sets only ever grow, whichever side changed.
  if (r.c.kind === "days") return mergeVersioned("days", local, remote);
  if (!remoteChanged) return local ? { winner: local, pushLocal: true, applyRemote: false } : null;
  if (!localChanged || !local) {
    return { winner: remote as Versioned, pushLocal: false, applyRemote: !sameContent(local, remote) };
  }
  const theirs = remote as Versioned;
  if (sameContent(local, theirs)) return { winner: theirs, pushLocal: false, applyRemote: false };
  // A first merge never deletes: a live local item beats a cloud delete.
  if (r.firstMerge && theirs.deleted) return { winner: local, pushLocal: true, applyRemote: false };
  // Both sides changed and one deleted: the edit wins whatever the times say. A
  // delete only has its collection's last edit time, which a later edit of another
  // item would lend it. A wrongly kept item is the safe way to be wrong.
  if (r.c.kind === "items" && local.deleted !== theirs.deleted) {
    return local.deleted
      ? { winner: theirs, pushLocal: false, applyRemote: true }
      : { winner: local, pushLocal: true, applyRemote: false };
  }
  const custom = customMerge(r, key, local, theirs);
  if (custom) return custom;
  const kind = r.c.kind === "hifzPlan" || r.c.kind === "freezePool" ? "object" : r.c.kind;
  return mergeVersioned(kind, local, theirs);
}

function setSnapshot(r: CollectionRun, key: string, v: Versioned): void {
  const entry = snapshotOf(v);
  if (entry === undefined) delete r.snapshot[key];
  else r.snapshot[key] = entry;
}

/** The row to push; a winner not newer than the cloud's copy is stamped just after it so the server keeps it. */
function outgoingRow(collection: string, key: string, winner: Versioned, remote: SyncRow | undefined): SyncRow {
  let editedAt = winner.editedAt;
  if (remote && instant(editedAt) <= instant(remote.edited_at)) {
    editedAt = new Date(instant(remote.edited_at) + 1).toISOString();
  }
  return {
    collection,
    item_key: key,
    value: winner.deleted ? null : winner.value,
    edited_at: editedAt,
    deleted: winner.deleted,
  };
}

/** Reconciles one key; returns the archive key it created, if any. */
function reconcile(r: CollectionRun, key: string, row: SyncRow | undefined, local: Versioned | undefined): string | null {
  const remote = row && fromRow(row);
  const localChanged = !!local && (r.firstMerge || snapshotOf(local) !== r.base[key]);
  const remoteChanged = !!remote && (r.firstMerge || snapshotOf(remote) !== r.base[key]);
  const d = decide(r, key, local, remote, localChanged, remoteChanged);
  if (!d) return null;

  if (d.applyRemote) {
    if (d.winner.deleted) delete r.items[key];
    else r.items[key] = d.winner.value;
    r.applied.add(key);
    delete r.rejected[key];
  }
  if (d.pushLocal) r.outgoing.set(key, outgoingRow(r.c.id, key, d.winner, row));
  else setSnapshot(r, key, d.winner);

  if (!d.archived) return null;
  const archiveKey = ARCHIVE_PREFIX + d.archived.createdAt;
  r.items[archiveKey] = d.archived;
  r.applied.add(archiveKey);
  return archiveKey;
}

/** Reconciles `keys`, the current Hifz plan first so the plan it archives is reconciled too. */
function reconcileKeys(
  r: CollectionRun,
  keys: Iterable<string>,
  rows: Record<string, SyncRow>,
  locals: Map<string, Versioned> = new Map(),
): void {
  const queue = [...new Set(keys)].sort((a, b) => Number(b === CURRENT_PLAN) - Number(a === CURRENT_PLAN));
  const done = new Set<string>();
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i];
    if (done.has(key)) continue;
    done.add(key);
    const local = locals.has(key) ? locals.get(key) : localSide(r, key);
    const archiveKey = reconcile(r, key, rows[key], local);
    if (archiveKey) queue.push(archiveKey);
  }
}

async function openRun(c: SyncCollection, state: SyncState): Promise<CollectionRun | null> {
  const dirtyAt = dirtyTime(c.id);
  let stored: Record<string, unknown>;
  try {
    stored = await c.read();
  } catch (err) {
    console.warn(`[sync] skipping ${c.id} this run: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
  // First merge ignores any old snapshot.
  const firstMerge = !state.merged.includes(c.id);
  const base = firstMerge ? {} : state.snapshot[c.id] ?? {};
  return {
    c,
    firstMerge,
    dirtyAt,
    stored,
    items: { ...stored },
    base,
    snapshot: { ...base },
    rejected: { ...(state.rejected[c.id] ?? {}) },
    applied: new Set(),
    outgoing: new Map(),
    failed: false,
    unsettled: false,
  };
}

/** Pulled rows by collection and key, dropping unknown collections and values this build can't read. */
function groupRows(rows: SyncRow[]): Map<string, Record<string, SyncRow>> {
  const byCollection = new Map<string, Record<string, SyncRow>>();
  for (const row of rows) {
    const c = SYNC_COLLECTIONS.find((x) => x.id === row.collection);
    if (!c) continue;
    if (!row.deleted && !c.validate(row.value, row.item_key)) {
      console.warn(`[sync] skipping unreadable remote item ${row.collection}/${row.item_key}`);
      continue;
    }
    const keyed = byCollection.get(c.id) ?? {};
    // Rows arrive in server_at order: the last copy of a key is the current one.
    keyed[row.item_key] = row;
    byCollection.set(c.id, keyed);
  }
  return byCollection;
}

interface LostPush {
  r: CollectionRun;
  key: string;
  sent: SyncRow;
  stored: SyncRow;
}

/** Writes the remote winners locally (step 4); dispatches SYNC_APPLIED_EVENT. Storage failures land in `failures`. */
async function applyLocally(runs: CollectionRun[], appliedOut: Set<string>, failures: string[]): Promise<void> {
  const written: string[] = [];
  for (const r of runs) {
    if (r.failed || r.applied.size === 0) continue;
    try {
      // A store the app changed since this run read it is left for the next run.
      if (stableStringify(await r.c.read()) !== stableStringify(r.stored)) {
        console.warn(`[sync] skipping ${r.c.id} this run: changed during sync`);
        r.failed = true;
        continue;
      }
      await suppressHook(() => r.c.write(r.items));
      r.stored = await r.c.read();
    } catch (err) {
      console.warn(`[sync] skipping ${r.c.id} this run: ${err instanceof Error ? err.message : String(err)}`);
      r.failed = true;
      failures.push(r.c.id);
      continue;
    }
    // A key the store does not keep (written by a newer app version) is not
    // snapshotted, so its absence is never read as a local delete.
    for (const key of r.applied) if (!(key in r.stored)) delete r.snapshot[key];
    r.applied.clear();
    written.push(r.c.id);
  }
  if (written.length === 0) return;
  written.forEach((id) => appliedOut.add(id));
  window.dispatchEvent(new CustomEvent(SYNC_APPLIED_EVENT, { detail: { collections: written } }));
  for (const [event, ids] of DISPLAY_EVENTS) {
    if (ids.some((id) => written.includes(id))) window.dispatchEvent(new CustomEvent(event));
  }
}

/** Pushes the local winners (step 5); returns the pushes that lost to a different cloud copy. */
async function pushOutgoing(runs: CollectionRun[]): Promise<LostPush[]> {
  const rows: SyncRow[] = [];
  for (const r of runs) {
    if (r.failed) continue;
    for (const [key, row] of r.outgoing) {
      if (r.rejected[key] === rejectionKey(row)) {
        r.outgoing.delete(key);
        delete r.snapshot[key];
      } else {
        rows.push(row);
      }
    }
  }
  if (rows.length === 0) return [];

  const stored = new Map<string, SyncRow>();
  for (const row of await push(rows)) stored.set(rowId(row.collection, row.item_key), row);

  const lost: LostPush[] = [];
  for (const r of runs) {
    if (r.failed) continue;
    for (const [key, sent] of r.outgoing) {
      const got = stored.get(rowId(r.c.id, key));
      if (!got) {
        r.rejected[key] = rejectionKey(sent);
        delete r.snapshot[key];
      } else if (sameContent(fromRow(got), fromRow(sent))) {
        delete r.rejected[key];
        setSnapshot(r, key, fromRow(got));
      } else {
        lost.push({ r, key, sent, stored: got });
      }
    }
    r.outgoing.clear();
  }
  return lost;
}

async function run(userId: string): Promise<SyncResult> {
  const resetsAtStart = resets;
  const runStart = new Date().toISOString();
  const state = loadState(userId);
  const failures: string[] = [];

  const runs: CollectionRun[] = [];
  for (const c of SYNC_COLLECTIONS) {
    const r = await openRun(c, state);
    if (r) runs.push(r);
    else failures.push(c.id);
  }

  // Read first: a broken store must not force a full pull on every run, only the
  // run after it can be read again.
  const fullPull = runs.some((r) => r.firstMerge || state.behind.includes(r.c.id));
  const pulled = await pullSince(fullPull ? null : state.cursor);
  const remote = groupRows(pulled.rows);
  for (const r of runs) {
    const rows = remote.get(r.c.id) ?? {};
    reconcileKeys(r, [...Object.keys(r.items), ...Object.keys(rows), ...Object.keys(r.base)], rows);
  }

  const applied = new Set<string>();
  await applyLocally(runs, applied, failures);
  const lost = await pushOutgoing(runs);

  if (lost.length > 0) {
    // One more round against the copies that won in the cloud.
    for (const { r, key, sent, stored } of lost) {
      if (!r.failed) reconcileKeys(r, [key], { [key]: stored }, new Map([[key, fromRow(sent)]]));
    }
    await applyLocally(runs, applied, failures);
    for (const { r, key } of await pushOutgoing(runs)) {
      r.unsettled = true;
      if (r.base[key] === undefined) delete r.snapshot[key];
      else r.snapshot[key] = r.base[key];
    }
  }

  const done = runs.filter((r) => !r.failed);
  const snapshot: KeyedFingerprints = { ...state.snapshot };
  const rejected: KeyedFingerprints = { ...state.rejected };
  for (const r of done) {
    snapshot[r.c.id] = r.snapshot;
    if (Object.keys(r.rejected).length > 0) rejected[r.c.id] = r.rejected;
    else delete rejected[r.c.id];
  }
  const doneIds = done.map((r) => r.c.id);
  const wasReset = resets !== resetsAtStart;
  const next: SyncState = {
    userId,
    cursor: pulled.cursor,
    snapshot,
    merged: wasReset ? [] : [...new Set([...state.merged, ...doneIds])],
    behind: SYNC_COLLECTIONS.map((c) => c.id).filter((id) => !doneIds.includes(id)),
    rejected,
    lastSyncedAt: wasReset ? null : new Date().toISOString(),
  };
  // A failed save throws: the run is an error and the old state and dirty times stay.
  localStorage.setItem(STATE_KEY, JSON.stringify(next));
  for (const r of done) if (!r.unsettled) clearDirty(r.c.id, runStart);

  if (failures.length > 0) return { status: "error", message: `Could not sync ${failures.join(", ")}` };
  return { status: "synced", appliedCollections: [...applied] };
}

let inFlight: Promise<SyncResult> | null = null;

/** Runs one sync for `userId`. Never throws; concurrent calls share the run in flight. */
export function syncNow(userId: string): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = run(userId)
      .catch((err): SyncResult =>
        err instanceof SyncOfflineError
          ? { status: "offline" }
          : { status: "error", message: err instanceof Error ? err.message : String(err) },
      )
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}
