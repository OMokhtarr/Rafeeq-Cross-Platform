/**
 * THE CONTENT SYNC ENGINE.
 *
 * Fetches the sync feed, applies mutations in sequence order, and persists the
 * checkpoint. Knows nothing about tafsirs or recitations — groups register an
 * adapter that converts snapshot records into rows.
 *
 * Satisfies Developer Terms §3.1(3)(b): retained content is maintained through
 * Content Sync rather than expiring after one week. See
 * docs/superpowers/specs/2026-08-21-content-sync-design.md.
 */

import {
  CONTENT_API_BASE_URL,
  QuranApiError,
  QuranApiOffline,
  fetchSnapshot,
  fetchSyncPage,
} from "../api/quran-api.client";
import { parseSyncPage, resolveSnapshotUrl } from "./parse-mutation";
import {
  markBootstrapped,
  readSyncState,
  resourcesFilter,
  trackResource,
  untrackResource,
  writeSyncState,
} from "./sync-state.service";
import {
  deleteRow,
  purgeResource,
  putRows,
  replaceResourceRows,
} from "./sync-store.service";
import {
  SyncGroup,
  SyncMutation,
  SyncRow,
  SyncState,
} from "./content-sync.types";

/** 24 h against a 7-day obligation — six missed windows of headroom. */
export const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * The live API rejects anything above 100: per_page=200 -> 422
 * {"error":{"code":"invalid_per_page","message":"per_page cannot exceed 100"}}
 * (verified against apis.quran.foundation). Must stay <= 100 or every sync
 * attempt fails.
 */
export const PER_PAGE = 100;

/**
 * Pagination has never actually been observed against the live API — every
 * real response returned has_more: false (see the wire-format spec). This is
 * a guard against a server that always claims more is coming, not a real
 * limit: at PER_PAGE=100, the largest resource observed (a tafsir snapshot's
 * mutation feed, 6,236 records) would need ~63 pages, so 500 leaves roughly
 * 8x headroom over anything seen in practice.
 */
const MAX_PAGES = 500;

export interface SyncResult {
  ran: boolean;
  reason?: "throttled" | "no-resources" | "offline";
  applied: number;
}

export interface SyncAdapter {
  /** Convert a snapshot's records into rows. */
  toRows(records: unknown[], resourceId: number, sequence: number): SyncRow[];
  /**
   * Opt into the streamed bootstrap, for snapshots too large to parse whole.
   * Records arrive in batches and one logical row may span several, so the
   * accumulator holds partial state until `rows()` is called.
   */
  createAccumulator?(
    resourceId: number,
    sequence: number,
  ): { add(records: unknown[]): void; rows(): SyncRow[] };
  /** Optional side effect when a resource's content is replaced or removed. */
  onInvalidate?(resourceId: number): Promise<void>;
}

/**
 * Stamp the real sequence onto streamed rows.
 *
 * The accumulator is built before `sync_sequence` has been seen in the body,
 * so rows are created with a placeholder and corrected here.
 */
function withSequence(rows: SyncRow[], sequence: number): SyncRow[] {
  for (const r of rows) r.sequence = sequence;
  return rows;
}

const adapters = new Map<SyncGroup, SyncAdapter>();

export function registerAdapter(group: SyncGroup, adapter: SyncAdapter): void {
  adapters.set(group, adapter);
}

function adapterFor(group: SyncGroup): SyncAdapter {
  const a = adapters.get(group);
  if (!a) throw new Error(`no sync adapter registered for "${group}"`);
  return a;
}

/** Guards against a resume and a visibilitychange both firing a run. */
let inflight: Promise<SyncResult> | null = null;

export async function getSyncStatus(): Promise<SyncState> {
  return readSyncState();
}

/**
 * Load a resource's full content and start tracking it.
 *
 * Goes to the snapshot endpoint directly rather than through the sync feed:
 * verified against the live API, bootstrap returns no mutations for most
 * resources even though they all have snapshots, so trusting the feed would
 * leave the resource tracked while holding zero rows.
 */
export async function bootstrapResource(
  group: SyncGroup,
  resourceId: number,
  onProgress?: (pct: number) => void,
): Promise<void> {
  await trackResource(group, resourceId);
  onProgress?.(10);

  const url = resolveSnapshotUrl(
    `/api/v4/resources/snapshots/${group}/${resourceId}`,
    CONTENT_API_BASE_URL,
  );
  const adapter = adapterFor(group);

  let rows: SyncRow[];
  if (adapter.createAccumulator) {
    // Streamed path, for snapshots too large to parse whole. The mushaf
    // snapshot decodes to ~22 MB across 84,270 records; `await res.json()`
    // holds the decoded body AND the full object graph live at once, peaking
    // around 63 MB to produce ~2.5 MB of rows. On a 1-2 GB device that peak
    // risks an OOM, which kills the WebView process rather than throwing
    // something catchable. Mapping each batch as it arrives and keeping only
    // the fields the renderer needs brings the peak to ~18 MB (measured).
    // See stream-records.ts and docs/webview-compat-audit.md.
    let acc: ReturnType<NonNullable<SyncAdapter["createAccumulator"]>> | null =
      null;
    const snap = await fetchSnapshot(url, async (batch) => {
      // The sequence is known only once the stream reports it, so the
      // accumulator is created on the first batch.
      if (!acc) acc = adapter.createAccumulator!(resourceId, 0);
      acc.add(batch);
    });
    onProgress?.(70);
    rows = acc
      ? withSequence((acc as NonNullable<typeof acc>).rows(), snap.syncSequence)
      : [];
  } else {
    const snap = await fetchSnapshot(url);
    onProgress?.(70);
    rows = adapter.toRows(snap.records, resourceId, snap.syncSequence);
  }

  await replaceResourceRows(group, resourceId, rows);
  onProgress?.(95);

  await markBootstrapped(group, resourceId);
  onProgress?.(100);
}

export async function runSync(opts?: { force?: boolean }): Promise<SyncResult> {
  if (inflight) return inflight;
  inflight = doRun(opts?.force ?? false).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRun(force: boolean): Promise<SyncResult> {
  const state = await readSyncState();

  if (state.trackedResources.length === 0) {
    return { ran: false, reason: "no-resources", applied: 0 };
  }
  if (
    !force &&
    state.lastSyncedAt !== null &&
    Date.now() - state.lastSyncedAt < SYNC_INTERVAL_MS
  ) {
    return { ran: false, reason: "throttled", applied: 0 };
  }

  // A resource can be tracked with no rows on disk: trackResource() runs
  // before the snapshot fetch in bootstrapResource(), so a failure there
  // (very plausible — it can fire while offline) leaves it tracked forever
  // with bootstrappedAt: null. isTracked() guards like
  // ensureRecitationTracked() in audio-cache.service.ts then never retry it.
  // Recover here so the resource does not hold zero rows indefinitely.
  const recovery = await recoverUnbootstrappedResources(state.trackedResources);
  if (recovery.failures.length > 0) {
    // Being offline must stay the quiet non-event it already is — only a
    // genuine (non-offline) failure to recover blocks a clean success.
    const allOffline = recovery.failures.every(
      (f) => f.error instanceof QuranApiOffline,
    );
    if (allOffline) {
      await writeSyncState({
        ...(await readSyncState()),
        lastAttemptAt: Date.now(),
        lastError: null,
      });
      return { ran: false, reason: "offline", applied: 0 };
    }

    const message = recovery.failures
      .map((f) => `${f.group}:${f.resourceId} — ${describeError(f.error)}`)
      .join("; ");
    await writeSyncState({
      ...(await readSyncState()),
      lastAttemptAt: Date.now(),
      // A run in which recovery failed must not read as a clean success —
      // lastSyncedAt is deliberately left untouched.
      lastError: `Failed to bootstrap: ${message}`,
    });
    return { ran: false, applied: 0 };
  }

  // Re-read: recovery above may have changed trackedResources' bootstrappedAt.
  const stateAfterRecovery = await readSyncState();
  const filter = resourcesFilter(stateAfterRecovery.trackedResources);
  let applied = 0;
  let token = stateAfterRecovery.syncToken;
  let finalToken: string | null = null;

  try {
    let hasMore = true;
    let first = true;
    let pages = 0;
    while (hasMore) {
      if (pages >= MAX_PAGES) {
        throw new Error(
          `sync pagination exceeded ${MAX_PAGES} pages without has_more: false — aborting`,
        );
      }
      pages++;

      const body = await fetchSyncPage({
        resources: filter,
        bootstrap: token === null && first ? true : undefined,
        syncToken: token ?? undefined,
        perPage: PER_PAGE,
      });
      first = false;
      const parsed = parseSyncPage(body);

      // Ascending sequence: the API's stated contract, and the reason a failed
      // run can be safely replayed from the old token.
      const ordered = [...parsed.mutations].sort(
        (a, b) => a.sequence - b.sequence,
      );
      for (const m of ordered) {
        await applyMutation(m);
        applied++;
      }

      hasMore = parsed.hasMore;
      finalToken = parsed.nextSyncToken;
      token = parsed.nextSyncToken ?? token;
    }
  } catch (err) {
    return handleRunError(err, stateAfterRecovery);
  }

  // Only now — a mid-run failure above leaves the previous checkpoint intact.
  await writeSyncState({
    ...(await readSyncState()),
    syncToken: finalToken ?? stateAfterRecovery.syncToken,
    lastSyncedAt: Date.now(),
    lastAttemptAt: Date.now(),
    lastError: null,
  });

  return { ran: true, applied };
}

interface RecoveryFailure {
  group: SyncGroup;
  resourceId: number;
  error: unknown;
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Bootstrap every tracked resource still missing rows on disk
 * (bootstrappedAt === null). A single failing resource must not abort the
 * others or the run — failures are collected and returned so the caller
 * decides how the overall run should be recorded.
 */
async function recoverUnbootstrappedResources(
  tracked: SyncState["trackedResources"],
): Promise<{ failures: RecoveryFailure[] }> {
  const missing = tracked.filter((r) => r.bootstrappedAt === null);
  const failures: RecoveryFailure[] = [];

  for (const r of missing) {
    try {
      await bootstrapResource(r.group, r.resourceId);
    } catch (error) {
      failures.push({ group: r.group, resourceId: r.resourceId, error });
    }
  }

  return { failures };
}

async function handleRunError(
  err: unknown,
  before: SyncState,
): Promise<SyncResult> {
  const now = Date.now();

  // Offline is not a sync failure — the user simply has no connection.
  if (err instanceof QuranApiOffline) {
    await writeSyncState({
      ...(await readSyncState()),
      lastAttemptAt: now,
      lastError: null,
    });
    return { ran: false, reason: "offline", applied: 0 };
  }

  // A 4xx on an incremental run means the token is no longer valid. Its
  // lifetime is undocumented, so clear it and let the next run re-bootstrap
  // rather than wedging sync permanently.
  const rejectedToken =
    err instanceof QuranApiError &&
    err.status >= 400 &&
    err.status < 500 &&
    before.syncToken !== null;

  await writeSyncState({
    ...(await readSyncState()),
    syncToken: rejectedToken ? null : before.syncToken,
    lastAttemptAt: now,
    lastError: err instanceof Error ? err.message : String(err),
  });

  return { ran: false, applied: 0 };
}

async function applyMutation(m: SyncMutation): Promise<void> {
  switch (m.type) {
    case "RESOURCE_CREATE":
    case "RESOURCE_INVALIDATE": {
      const url = resolveSnapshotUrl(
        m.snapshotUrl ??
          `/api/v4/resources/snapshots/${m.resourceGroup}/${m.resourceId}`,
        CONTENT_API_BASE_URL,
      );
      const snap = await fetchSnapshot(url);
      const rows = adapterFor(m.resourceGroup).toRows(
        snap.records,
        m.resourceId,
        snap.syncSequence,
      );
      await replaceResourceRows(m.resourceGroup, m.resourceId, rows);
      await adapters.get(m.resourceGroup)?.onInvalidate?.(m.resourceId);
      return;
    }

    case "RESOURCE_DELETE": {
      await purgeResource(m.resourceGroup, m.resourceId);
      await adapters.get(m.resourceGroup)?.onInvalidate?.(m.resourceId);
      // tracked ⟺ rows on disk: the rows are gone, so the tracking goes too.
      await untrackResource(m.resourceGroup, m.resourceId);
      return;
    }

    case "RESOURCE_UPDATE":
      // Freshness marker only — the rows we hold are still current.
      return;

    case "ROW_CREATE":
    case "ROW_UPDATE": {
      if (!m.recordType || !m.recordKey) return;
      await putRows([
        {
          id: `${m.resourceGroup}:${m.resourceId}:${m.recordType}:${m.recordKey}`,
          resourceGroup: m.resourceGroup,
          resourceId: m.resourceId,
          recordType: m.recordType,
          recordKey: m.recordKey,
          data: m.data,
          sequence: m.sequence,
        },
      ]);
      return;
    }

    case "ROW_DELETE": {
      if (!m.recordType || !m.recordKey) return;
      await deleteRow(
        m.resourceGroup,
        m.resourceId,
        m.recordType,
        m.recordKey,
      );
      return;
    }
  }
}
