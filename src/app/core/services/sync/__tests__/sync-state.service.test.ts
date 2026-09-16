import "fake-indexeddb/auto";
import {
  readSyncState,
  writeSyncState,
  trackResource,
  untrackResource,
  markBootstrapped,
  isTracked,
  resourcesFilter,
} from "../sync-state.service";
import { EMPTY_SYNC_STATE } from "../content-sync.types";
import { idb } from "../../storage/idb.service";

// Polyfill structuredClone for Node.js < 17
if (!global.structuredClone) {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

beforeEach(async () => {
  await idb.clear("sync_meta");
});

describe("sync state", () => {
  it("reads an empty state before anything is written", async () => {
    expect(await readSyncState()).toEqual(EMPTY_SYNC_STATE);
  });

  it("round-trips a written state", async () => {
    await writeSyncState({
      ...EMPTY_SYNC_STATE,
      syncToken: "tok",
      lastSyncedAt: 1234,
    });
    const s = await readSyncState();
    expect(s.syncToken).toBe("tok");
    expect(s.lastSyncedAt).toBe(1234);
  });

  it("clears the sync token when a new resource starts being tracked", async () => {
    // Observed on a device after mushafs:19 shipped: the stored token was
    // issued for "tafsirs;recitations", but the filter then became
    // "tafsirs;recitations;mushafs:19". QF rejects that pairing with
    //   422 token_filter_mismatch — "sync_token does not match the requested
    //   resources"
    // and every sync failed until the token was cleared. A token is only
    // meaningful for the exact resource set it was issued against, so adding a
    // resource must invalidate it.
    await writeSyncState({
      ...EMPTY_SYNC_STATE,
      syncToken: "tok-for-two-resources",
      trackedResources: [
        { group: "tafsirs", resourceId: 169, bootstrappedAt: 1 },
      ],
    });

    await trackResource("mushafs", 19);

    expect((await readSyncState()).syncToken).toBeNull();
  });

  it("keeps the sync token when the resource is already tracked", async () => {
    // Re-tracking is a no-op, so it must not throw away a valid checkpoint —
    // that would force a full re-bootstrap on every launch.
    await writeSyncState({
      ...EMPTY_SYNC_STATE,
      syncToken: "tok",
      trackedResources: [
        { group: "tafsirs", resourceId: 169, bootstrappedAt: 1 },
      ],
    });

    await trackResource("tafsirs", 169);

    expect((await readSyncState()).syncToken).toBe("tok");
  });

  it("clears the sync token when a resource stops being tracked", async () => {
    // Same reasoning in reverse: a narrower filter no longer matches the
    // token the wider set was issued against.
    await writeSyncState({
      ...EMPTY_SYNC_STATE,
      syncToken: "tok",
      trackedResources: [
        { group: "tafsirs", resourceId: 169, bootstrappedAt: 1 },
        { group: "mushafs", resourceId: 19, bootstrappedAt: 1 },
      ],
    });

    await untrackResource("mushafs", 19);

    expect((await readSyncState()).syncToken).toBeNull();
  });

  it("tracks a resource once, not twice", async () => {
    await trackResource("tafsirs", 169);
    await trackResource("tafsirs", 169);
    const s = await readSyncState();
    expect(s.trackedResources).toHaveLength(1);
    expect(await isTracked("tafsirs", 169)).toBe(true);
  });

  it("records the bootstrap timestamp separately from tracking", async () => {
    await trackResource("tafsirs", 169);
    // Tracked but not yet bootstrapped — this is the interrupted-download state.
    expect((await readSyncState()).trackedResources[0].bootstrappedAt).toBeNull();
    await markBootstrapped("tafsirs", 169);
    expect(
      (await readSyncState()).trackedResources[0].bootstrappedAt,
    ).toBeGreaterThan(0);
  });

  it("untracks only the named resource", async () => {
    await trackResource("tafsirs", 169);
    await trackResource("recitations", 7);
    await untrackResource("tafsirs", 169);
    const s = await readSyncState();
    expect(s.trackedResources).toHaveLength(1);
    expect(s.trackedResources[0].group).toBe("recitations");
  });

  it("handles concurrent mutations without losing writes", async () => {
    // Fire three concurrent trackResource calls without awaiting each one.
    // Without serialization, read-modify-write cycles can interleave and lose
    // writes since idb.get and idb.put each open their own transaction.
    await Promise.all([
      trackResource("tafsirs", 169),
      trackResource("recitations", 7),
      trackResource("tafsirs", 15),
    ]);
    const s = await readSyncState();
    expect(s.trackedResources).toHaveLength(3);
    expect(await isTracked("tafsirs", 169)).toBe(true);
    expect(await isTracked("recitations", 7)).toBe(true);
    expect(await isTracked("tafsirs", 15)).toBe(true);
  });
});

describe("resourcesFilter", () => {
  it("joins group:id pairs with semicolons", () => {
    expect(
      resourcesFilter([
        { group: "tafsirs", resourceId: 169, bootstrappedAt: null },
        { group: "recitations", resourceId: 7, bootstrappedAt: null },
      ]),
    ).toBe("tafsirs:169;recitations:7");
  });

  it("returns an empty string for no tracked resources", () => {
    // The caller must skip the run — the API 422s on a missing filter, and an
    // empty filter must never be read as "sync everything".
    expect(resourcesFilter([])).toBe("");
  });
});
