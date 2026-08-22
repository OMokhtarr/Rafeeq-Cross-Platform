import "fake-indexeddb/auto";
import {
  readSyncState,
  writeSyncState,
  trackResource,
  untrackResource,
  markBootstrapped,
  isTracked,
  resourcesFilter,
} from "./sync-state.service";
import { EMPTY_SYNC_STATE } from "./content-sync.types";
import { idb } from "../storage/idb.service";

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
