import "fake-indexeddb/auto";

// Polyfill structuredClone for fake-indexeddb in Jest
if (typeof global.structuredClone === "undefined") {
  global.structuredClone = (obj: unknown) => JSON.parse(JSON.stringify(obj));
}

import {
  runSync,
  bootstrapResource,
  registerAdapter,
  SYNC_INTERVAL_MS,
} from "./content-sync.service";
import { readSyncState, writeSyncState, trackResource } from "./sync-state.service";
import { readResourceRows } from "./sync-store.service";
import { EMPTY_SYNC_STATE, SyncRow } from "./content-sync.types";
import { idb } from "../storage/idb.service";
import * as api from "../api/quran-api.client";

jest.mock("../api/quran-api.client", () => {
  // Mirrors the production hierarchy in quran-api.client.ts: QuranApiOffline
  // EXTENDS QuranApiError. handleRunError checks `instanceof QuranApiOffline`
  // before the 4xx token-clearing branch, and that ordering only matters
  // because every offline error is also a QuranApiError — a sibling mock
  // would let a misordered check pass anyway.
  class QuranApiError extends Error {
    status: number;
    constructor(status: number, msg: string) {
      super(msg);
      this.status = status;
    }
  }
  class QuranApiOffline extends QuranApiError {
    constructor() {
      super(0, "offline: no usable network connection");
    }
  }
  return {
    __esModule: true,
    CONTENT_API_BASE_URL: "https://apis.quran.foundation/content/api/v4",
    fetchSyncPage: jest.fn(),
    fetchSnapshot: jest.fn(),
    QuranApiOffline,
    QuranApiError,
  };
});

const mockSync = api.fetchSyncPage as jest.Mock;
const mockSnap = api.fetchSnapshot as jest.Mock;

// A trivial adapter: one row per record, keyed by its verse_key.
registerAdapter("tafsirs", {
  toRows: (records, resourceId, sequence): SyncRow[] =>
    (records as { verse_key: string; text: string }[]).map((r) => ({
      id: `tafsirs:${resourceId}:tafsir:${r.verse_key}`,
      resourceGroup: "tafsirs",
      resourceId,
      recordType: "tafsir",
      recordKey: r.verse_key,
      data: { text: r.text },
      sequence,
    })),
});

function page(over: Record<string, unknown> = {}) {
  return {
    sync: {
      sync_until_sequence: 100,
      has_more: false,
      next_page_url: null,
      next_sync_token: "tok-final",
      mutations: [],
      ...over,
    },
  };
}

beforeEach(async () => {
  await idb.clear("sync_meta");
  await idb.clear("content_sync");
  jest.clearAllMocks();
});

describe("bootstrapResource", () => {
  it("fetches the snapshot directly even when the feed has no mutations", async () => {
    // The live API returns zero mutations for most resources. If bootstrap
    // trusted the feed, the resource would be tracked holding no rows.
    mockSync.mockResolvedValue(page());
    mockSnap.mockResolvedValue({
      records: [{ verse_key: "1:1", text: "alpha" }],
      syncSequence: 42,
    });

    await bootstrapResource("tafsirs", 169);

    expect(mockSnap).toHaveBeenCalled();
    const rows = await readResourceRows("tafsirs", 169);
    expect(rows).toHaveLength(1);
    const state = await readSyncState();
    expect(state.trackedResources[0].bootstrappedAt).toBeGreaterThan(0);
  });

  it("leaves bootstrappedAt null when the snapshot fails", async () => {
    mockSnap.mockRejectedValue(new Error("boom"));
    await expect(bootstrapResource("tafsirs", 169)).rejects.toThrow();
    const state = await readSyncState();
    // A failed snapshot must not roll tracking back either — the resource
    // stays tracked (so a later run retries it), just not yet bootstrapped.
    expect(state.trackedResources).toHaveLength(1);
    expect(state.trackedResources[0].bootstrappedAt).toBeNull();
  });
});

describe("runSync", () => {
  it("skips when no resources are tracked", async () => {
    const res = await runSync();
    expect(res).toMatchObject({ ran: false, reason: "no-resources" });
    expect(mockSync).not.toHaveBeenCalled();
  });

  it("skips inside the throttle window", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({
      ...(await readSyncState()),
      lastSyncedAt: Date.now() - 1000,
    });
    const res = await runSync();
    expect(res).toMatchObject({ ran: false, reason: "throttled" });
  });

  it("runs when forced inside the throttle window", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({
      ...(await readSyncState()),
      lastSyncedAt: Date.now() - 1000,
    });
    mockSync.mockResolvedValue(page());
    const res = await runSync({ force: true });
    expect(res.ran).toBe(true);
  });

  it("runs once the throttle window has elapsed", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({
      ...(await readSyncState()),
      lastSyncedAt: Date.now() - SYNC_INTERVAL_MS - 1,
    });
    mockSync.mockResolvedValue(page());
    expect((await runSync()).ran).toBe(true);
  });

  it("applies ROW mutations in ascending sequence regardless of arrival order", async () => {
    await trackResource("tafsirs", 169);
    mockSync.mockResolvedValue(
      page({
        mutations: [
          {
            sequence: 2,
            type: "ROW_UPDATE",
            resource_group: "tafsirs",
            resource_id: 169,
            record_type: "tafsir",
            record_key: "1:1",
            data: { text: "second" },
          },
          {
            sequence: 1,
            type: "ROW_CREATE",
            resource_group: "tafsirs",
            resource_id: 169,
            record_type: "tafsir",
            record_key: "1:1",
            data: { text: "first" },
          },
        ],
      }),
    );

    await runSync({ force: true });

    const rows = await readResourceRows("tafsirs", 169);
    // Out-of-order application would leave "first" as the survivor.
    expect((rows[0].data as { text: string }).text).toBe("second");
  });

  it("persists the token only from the final page", async () => {
    await trackResource("tafsirs", 169);
    mockSync
      .mockResolvedValueOnce(
        page({ has_more: true, next_sync_token: "tok-page-1" }),
      )
      .mockResolvedValueOnce(
        page({ has_more: false, next_sync_token: "tok-page-2" }),
      );

    await runSync({ force: true });

    expect((await readSyncState()).syncToken).toBe("tok-page-2");
  });

  it("keeps the old token and lastSyncedAt when a mid-run page fails", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({
      ...(await readSyncState()),
      syncToken: "tok-old",
      lastSyncedAt: 5000,
    });
    mockSync
      .mockResolvedValueOnce(
        page({ has_more: true, next_sync_token: "tok-page-1" }),
      )
      .mockRejectedValueOnce(new Error("network died"));

    await runSync({ force: true });

    const s = await readSyncState();
    // Advancing early would silently lose every change in the missed window.
    expect(s.syncToken).toBe("tok-old");
    expect(s.lastSyncedAt).toBe(5000);
    expect(s.lastError).toContain("network died");
  });

  it("treats offline as a non-event, not an error", async () => {
    await trackResource("tafsirs", 169);
    mockSync.mockRejectedValue(new api.QuranApiOffline());

    const res = await runSync({ force: true });

    const s = await readSyncState();
    expect(res).toMatchObject({ ran: false, reason: "offline" });
    expect(s.lastError).toBeNull();
    expect(s.lastAttemptAt).toBeGreaterThan(0);
  });

  it("clears a rejected sync token so the next run re-bootstraps", async () => {
    await trackResource("tafsirs", 169);
    await writeSyncState({ ...(await readSyncState()), syncToken: "stale" });
    mockSync.mockRejectedValue(new api.QuranApiError(400, "bad sync_token"));

    await runSync({ force: true });

    // Token lifetime is undocumented; a dead token must self-heal rather than
    // wedge sync permanently.
    expect((await readSyncState()).syncToken).toBeNull();
  });

  it("purges rows and untracks on RESOURCE_DELETE", async () => {
    await trackResource("tafsirs", 169);
    mockSnap.mockResolvedValue({
      records: [{ verse_key: "1:1", text: "x" }],
      syncSequence: 1,
    });
    await bootstrapResource("tafsirs", 169);

    mockSync.mockResolvedValue(
      page({
        mutations: [
          {
            sequence: 9,
            type: "RESOURCE_DELETE",
            resource_group: "tafsirs",
            resource_id: 169,
          },
        ],
      }),
    );
    await runSync({ force: true });

    expect(await readResourceRows("tafsirs", 169)).toHaveLength(0);
    expect((await readSyncState()).trackedResources).toHaveLength(0);
  });

  it("refetches the snapshot on RESOURCE_INVALIDATE", async () => {
    await trackResource("tafsirs", 169);
    mockSnap.mockResolvedValue({
      records: [{ verse_key: "1:1", text: "corrected" }],
      syncSequence: 10,
    });
    mockSync.mockResolvedValue(
      page({
        mutations: [
          {
            sequence: 10,
            type: "RESOURCE_INVALIDATE",
            resource_group: "tafsirs",
            resource_id: 169,
            snapshot_url: "/api/v4/resources/snapshots/tafsirs/169",
          },
        ],
      }),
    );

    await runSync({ force: true });

    const rows = await readResourceRows("tafsirs", 169);
    expect((rows[0].data as { text: string }).text).toBe("corrected");
  });
});
