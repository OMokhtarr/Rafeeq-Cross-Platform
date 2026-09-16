import "fake-indexeddb/auto";
import { idb } from "../idb.service";

// Polyfill for jsdom environment
if (typeof structuredClone === "undefined") {
  (global as any).structuredClone = (value: any) => JSON.parse(JSON.stringify(value));
}

describe("IDB v9 sync stores", () => {
  it("creates content_sync with a by_resource index and sync_meta", async () => {
    await idb.open();
    await idb.put("content_sync", {
      id: "tafsirs:169:tafsir:1:1",
      resourceGroup: "tafsirs",
      resourceId: 169,
      recordType: "tafsir",
      recordKey: "1:1",
      data: { text: "x" },
      sequence: 5,
    });
    await idb.put("content_sync", {
      id: "tafsirs:15:tafsir:1:1",
      resourceGroup: "tafsirs",
      resourceId: 15,
      recordType: "tafsir",
      recordKey: "1:1",
      data: { text: "y" },
      sequence: 6,
    });

    // The index must return ONLY resource 169 — a full-store scan would return 2.
    const rows = await idb.getAllByIndex<{ id: string }>(
      "content_sync",
      "by_resource",
      ["tafsirs", 169],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("tafsirs:169:tafsir:1:1");

    await idb.put("sync_meta", { key: "state", syncToken: "abc" });
    const meta = await idb.get<{ syncToken: string }>("sync_meta", "state");
    expect(meta?.syncToken).toBe("abc");
  });
});
