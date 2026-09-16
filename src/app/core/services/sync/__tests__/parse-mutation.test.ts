import { parseSyncPage, resolveSnapshotUrl, rowId } from "../parse-mutation";

const BASE = "https://apis.quran.foundation/content/api/v4";

describe("parseSyncPage", () => {
  it("unwraps the sync envelope and maps snake_case to the internal shape", () => {
    const page = parseSyncPage({
      sync: {
        sync_until_sequence: 1395,
        has_more: false,
        next_page_url: null,
        next_sync_token: "tok-abc",
        mutations: [
          {
            sequence: 1234,
            type: "RESOURCE_CREATE",
            resource_group: "tafsirs",
            resource_id: 169,
            record_type: null,
            record_key: null,
            data: null,
            snapshot_url: "/api/v4/resources/snapshots/tafsirs/169",
          },
        ],
      },
    });

    expect(page.hasMore).toBe(false);
    expect(page.nextSyncToken).toBe("tok-abc");
    expect(page.syncUntilSequence).toBe(1395);
    expect(page.mutations).toHaveLength(1);
    expect(page.mutations[0].resourceGroup).toBe("tafsirs");
    expect(page.mutations[0].resourceId).toBe(169);
    expect(page.mutations[0].snapshotUrl).toBe(
      "/api/v4/resources/snapshots/tafsirs/169",
    );
  });

  it("returns an empty page when mutations is absent", () => {
    // The live API returns mutations: [] for most resources; a missing key
    // must not throw either.
    const page = parseSyncPage({
      sync: { sync_until_sequence: 1, has_more: false, next_sync_token: "t" },
    });
    expect(page.mutations).toEqual([]);
  });

  it("skips mutations from resource groups this app does not handle", () => {
    // articles/translations are valid API groups but not ours; keeping them
    // would create rows no adapter can ever read.
    const page = parseSyncPage({
      sync: {
        sync_until_sequence: 2,
        has_more: false,
        next_sync_token: "t",
        mutations: [
          { sequence: 1, type: "RESOURCE_CREATE", resource_group: "articles", resource_id: 1 },
          { sequence: 2, type: "RESOURCE_CREATE", resource_group: "tafsirs", resource_id: 169 },
        ],
      },
    });
    expect(page.mutations.map((m) => m.resourceGroup)).toEqual(["tafsirs"]);
  });

  it("keeps mushafs mutations", () => {
    // Shape copied from the live bootstrap response for mushafs:19
    // (QCF V4 Tajweed) on 2026-09-11 — one RESOURCE_CREATE carrying the
    // snapshot url. Before mushafs joined SYNC_GROUPS this was dropped as an
    // unhandled group, leaving the resource tracked with zero rows.
    const page = parseSyncPage({
      sync: {
        sync_until_sequence: 1399,
        has_more: false,
        next_page_url: null,
        next_sync_token: "tok-mushaf",
        mutations: [
          {
            sequence: 1399,
            type: "RESOURCE_CREATE",
            resource_group: "mushafs",
            resource_id: 19,
            record_type: null,
            record_key: null,
            data: null,
            snapshot_url: "/api/v4/resources/snapshots/mushafs/19",
          },
        ],
      },
    });

    expect(page.mutations).toHaveLength(1);
    expect(page.mutations[0].resourceGroup).toBe("mushafs");
    expect(page.mutations[0].resourceId).toBe(19);
    expect(page.mutations[0].snapshotUrl).toBe(
      "/api/v4/resources/snapshots/mushafs/19",
    );
  });
});

describe("resolveSnapshotUrl", () => {
  it("rewrites the /api/v4 prefix to the content base path", () => {
    // Naive resolution against the base yields /content/api/v4/api/v4/... → 404.
    expect(
      resolveSnapshotUrl("/api/v4/resources/snapshots/tafsirs/169", BASE),
    ).toBe(
      "https://apis.quran.foundation/content/api/v4/resources/snapshots/tafsirs/169",
    );
  });

  it("passes an absolute url through unchanged", () => {
    const abs = "https://example.test/snap.json";
    expect(resolveSnapshotUrl(abs, BASE)).toBe(abs);
  });
});

describe("rowId", () => {
  it("builds the composite key the API's ROW mutations carry", () => {
    expect(rowId("tafsirs", 169, "tafsir", "2:255")).toBe(
      "tafsirs:169:tafsir:2:255",
    );
  });
});
